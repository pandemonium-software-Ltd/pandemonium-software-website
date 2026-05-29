// Haiku classifier for inbound change requests.
//
// TWO-PASS architecture (2026-05-29):
//   Pass 1 — CLASSIFY: short prompt → {classification, confidence,
//     reasoning, rebuildOnly}. Haiku almost never fails at this.
//   Pass 2 — PATCH (only when in_scope + confident): focused prompt
//     → {patches: [...]}. Separated so Haiku can concentrate on
//     structured output without also reasoning about scope.
//
// This split eliminated the failure mode where Haiku produced correct
// classification + reasoning but empty patches — the single-call
// prompt was too long (~440 lines) for reliable structured output.
//
// Failure mode: every callable returns null on any error
// (invalid JSON, network failure, missing API key). Caller
// (step6-change-requests) treats null as "couldn't classify —
// escalate to Ben".
//
// Confidence threshold for auto-apply lives in the caller, not
// here. The classifier just reports its confidence; deciding what
// to do with a 0.6 vs 0.85 is policy.

import { callHaiku } from "./client";

/** Whitelist of patch targets the applier knows how to write. The
 *  classifier's prompt restricts proposals to this list — anything
 *  else gets reframed as out_of_scope. The applier rejects any
 *  target outside this list as a defence in depth.
 *
 *  Some targets require a LOCATOR field on the patch:
 *    - "content.services.*"     → `serviceName`
 *    - "content.faq.*"          → `faqQuestion`
 *    - "content.testimonials.*" → `testimonialName`
 *
 *  Some targets accept non-string values via JSON-encoded
 *  newValue:
 *    - "content.aboutBullets"               → JSON array of strings
 *    - "content.services.features"          → JSON array of strings
 *    - "content.services.priceFrom"         → numeric string
 *    - "content.trust.yearsExperience"      → numeric string
 *    - "business.openingHours"              → JSON object (day → {open,from,to})
 *
 *  Brand colours validate as 6-digit hex via the applier — Haiku is
 *  instructed to ask the customer for a code if they didn't supply one. */
export const SAFE_PATCH_TARGETS = [
  // ----- Site Content step copy fields -----
  "copy.tagline",
  "copy.aboutBlurb",
  "content.aboutBullets", // JSON array (full replace)
  "content.aboutBullets.add", // newValue: plain string to append
  "content.aboutBullets.remove", // newValue: exact string to find + remove
  // ----- Business details -----
  "business.contactName",
  "business.phoneDisplay",
  "business.phoneTel",
  "business.publicEmail",
  "business.address",
  "business.serviceArea",
  "business.openingHours", // JSON object (full per-day record)
  // ----- Trust signals -----
  "content.trust.yearsExperience", // numeric string
  "content.trust.associations",
  "content.trust.awards",
  // ----- Per-service (requires `serviceName` locator) -----
  "content.services.description",
  "content.services.longDescription",
  "content.services.pricingNotes",
  "content.services.priceFrom", // numeric string
  "content.services.features", // JSON array
  // ----- Service add/remove (max 10 services) -----
  "content.services.add", // newValue: JSON of new service object
  "content.services.remove", // requires serviceName locator
  // ----- Per-FAQ (requires `faqQuestion` locator) -----
  "content.faq.answer",
  "content.faq.question",
  // ----- FAQ add/remove (max 10 entries) -----
  "content.faq.add", // newValue: JSON {question, answer}
  "content.faq.remove", // requires faqQuestion locator
  // ----- Per-testimonial (requires `testimonialName` locator) -----
  "content.testimonials.quote",
  "content.testimonials.location",
  "content.testimonials.rating", // numeric string 1-5
  // ----- Testimonial add/remove (max 5) -----
  "content.testimonials.add", // newValue: JSON {name, quote, location?, rating?}
  "content.testimonials.remove", // requires testimonialName locator
  // ----- Brand colours (validated as #rrggbb hex) -----
  "branding.brandColorPrimary",
  "branding.brandColorSecondary",
  // ----- Offers module (the active promotional strip on
  //       the homepage). newValue is a JSON-encoded OfferEntry
  //       object — Haiku gets the whole offer in one patch. -----
  "content.offers.current",
] as const;

export type SafeTarget = (typeof SAFE_PATCH_TARGETS)[number];

export type ClassificationResult = {
  classification: "in_scope" | "out_of_scope" | "ambiguous";
  /** 0..1 — how confident the model is in the classification +
   *  patch correctness. Higher = more aggressive policy can
   *  auto-apply directly. Lower = escalate to Ben. */
  confidence: number;
  /** Plain-English reasoning, 1-2 sentences. Surfaces in the
   *  escalation email + admin audit log so Ben can spot
   *  misclassifications. */
  reasoning: string;
  /** Structured patches the applier will write. Multi-field
   *  requests produce an array of length > 1 (e.g. "change phone
   *  AND email" → 2 patches). All patches must target a SafeTarget;
   *  mixed-scope requests (one patchable + one not) classify as
   *  ambiguous with `patches` left undefined. Empty array is not a
   *  valid value — we use undefined to mean "no patches". */
  patches?: Array<{
    target: SafeTarget;
    /** New value being written. Always a string from Haiku — for
     *  non-string targets (numbers, arrays, JSON blobs) the applier
     *  parses the encoding. See SAFE_PATCH_TARGETS docstring for
     *  per-target encoding rules. */
    newValue: string;
    /** Locator for `content.services.*` targets. Matches against
     *  the current `content.services[i].serviceName` to find the
     *  right entry. Required for services targets; ignored
     *  otherwise. */
    serviceName?: string;
    /** Locator for `content.faq.*` targets. Matches against the
     *  current `content.faq[i].question`. Required for FAQ targets. */
    faqQuestion?: string;
    /** Locator for `content.testimonials.*` targets. Matches the
     *  testimonial's `name` field. Required for testimonials. */
    testimonialName?: string;
  }>;
  /** When true, the change has ALREADY been applied to the
   *  customer's data outside of Cowork's patch path — for instance
   *  they re-uploaded a logo via Hub Step 4 (Brand assets) and
   *  the new asset is already in their onboardingData. Cowork
   *  has nothing to patch; it just needs to dispatch a fresh
   *  build to ship what's already saved.
   *
   *  Mutually exclusive with `patches`: if Haiku proposes patches
   *  AND rebuildOnly, the validator drops rebuildOnly because the
   *  patches path is more specific. Currently triggered by asset/
   *  photo/logo references where the customer has just re-uploaded. */
  rebuildOnly?: boolean;
  skippedPatches?: Array<{ target: string; reason: string }>;
};

/**
 * Snapshot of the customer's current site state passed to the
 * classifier as context. Lets Haiku see what's there so it can
 * write a correct patch (e.g. customer says "fix typo in my
 * tagline" — Haiku needs the current tagline to compute the fix).
 *
 * Sanitised: no PII beyond what's already public on the customer's
 * own site (since they own this data).
 */
export type SiteSnapshot = {
  business: {
    name: string;
    type: string;
    location: string;
    contactName?: string;
    phoneDisplay?: string;
    phoneTel?: string;
    publicEmail?: string;
    address?: string;
    serviceArea?: string;
    openingHours?: Record<
      string,
      { open: boolean; from?: string; to?: string }
    >;
  };
  copy: {
    tagline?: string;
    aboutBlurb?: string;
    aboutBullets?: string[];
  };
  trust?: {
    yearsExperience?: number;
    associations?: string;
    awards?: string;
  };
  /** Current brand colours — Haiku reads these to confirm an
   *  existing colour vs. a fresh one. Hex 6-digit format. */
  branding?: {
    primary?: string;
    secondary?: string;
  };
  /** Per-service names — Haiku uses these as the canonical locator
   *  for `content.services.*` patches. Match by trimmed lowercase. */
  services?: Array<{
    name: string;
    description?: string;
    priceFrom?: number;
    longDescription?: string;
    features?: string[];
    pricingNotes?: string;
  }>;
  /** FAQ questions — same locator pattern. */
  faq?: Array<{ question: string; answer?: string }>;
  /** Testimonial names — same locator pattern. */
  testimonials?: Array<{ name: string; quote?: string; rating?: number }>;
  /** Summary of the customer's brand assets — count + most recent
   *  upload per slot. Lets Haiku validate "I re-uploaded my logo"
   *  claims: if the customer says they uploaded a new logo but
   *  `assets.logo.uploadedAt` is months old, escalate rather than
   *  triggering a rebuild. Optional so old test fixtures still
   *  pass; classifier degrades gracefully when missing. */
  assets?: {
    logo?: { filename: string; uploadedAt: string } | null;
    hero?: { filename: string; uploadedAt: string } | null;
    about?: { filename: string; uploadedAt: string } | null;
    galleryCount?: number;
    servicePhotoCount?: number;
    /** ISO timestamp of the most-recent asset upload across ALL
     *  slots. Used as the primary "recency" signal for
     *  rebuildOnly classification. */
    lastUploadedAt?: string;
  };
};

// ================================================================
// Public API — unchanged signature, now backed by two-pass internals
// ================================================================

/**
 * Classify a customer's change request. Returns null on any
 * failure (no key, network error, malformed JSON response,
 * missing required fields). Caller should treat null as
 * "couldn't classify — escalate to Ben".
 */
export async function classifyChangeRequest(args: {
  message: string;
  snapshot: SiteSnapshot;
}): Promise<ClassificationResult | null> {
  // ── Pass 1: Classify (is it in scope? how confident? rebuild-only?) ──
  const classify = await classifyPass(args.message, args.snapshot);
  if (!classify) return null;

  // Not eligible for auto-apply → return classification only
  if (
    classify.classification !== "in_scope" ||
    classify.confidence < 0.75
  ) {
    return {
      classification: classify.classification,
      confidence: classify.confidence,
      reasoning: classify.reasoning,
    };
  }

  // ── Pass 2: Generate structured patches ──
  let patchResult = await patchPass(
    args.message,
    args.snapshot,
    classify.reasoning,
  );

  // Retry once if patch generation failed or returned nothing
  // (unless it's pure rebuild-only — empty patches are expected)
  if (
    (!patchResult || patchResult.patches.length === 0) &&
    !classify.rebuildOnly
  ) {
    console.log(
      `[classify] Patch pass returned ${patchResult ? "empty" : "null"} ` +
        `for in_scope@${classify.confidence} — retrying`,
    );
    patchResult = await patchPass(
      args.message,
      args.snapshot,
      classify.reasoning,
    );
  }

  const patches =
    patchResult && patchResult.patches.length > 0
      ? patchResult.patches
      : undefined;
  const skippedPatches = patchResult?.skippedPatches;

  // Apply verbatim quote guard
  let finalPatches = patches;
  if (finalPatches && finalPatches.length > 0) {
    const guarded = enforceVerbatimQuotes(args.message, finalPatches);
    if (guarded.overrideCount > 0) {
      console.warn(
        `[verbatim-quote-guard] Overrode ${guarded.overrideCount} ` +
          `patch(es) to match customer's double-quoted text.`,
      );
    }
    finalPatches = guarded.patches;
  }

  return {
    classification: classify.classification,
    confidence: classify.confidence,
    reasoning: classify.reasoning,
    patches: finalPatches,
    rebuildOnly: classify.rebuildOnly ? true : undefined,
    skippedPatches: skippedPatches?.length ? skippedPatches : undefined,
  };
}

// ================================================================
// Pass 1 — Classification (simple output, short prompt)
// ================================================================

async function classifyPass(
  message: string,
  snapshot: SiteSnapshot,
): Promise<{
  classification: "in_scope" | "out_of_scope" | "ambiguous";
  confidence: number;
  reasoning: string;
  rebuildOnly: boolean;
} | null> {
  const system =
    `You classify customer change requests for a website builder. ` +
    `Output STRICT JSON — no prose, no code fences, nothing else.`;

  const prompt =
    `OUTPUT SCHEMA:\n` +
    `{\n` +
    `  "classification": "in_scope" | "out_of_scope" | "ambiguous",\n` +
    `  "confidence": <number 0.0 to 1.0>,\n` +
    `  "reasoning": "<1-2 sentences>",\n` +
    `  "rebuildOnly": true | false\n` +
    `}\n\n` +
    `RULES:\n` +
    `1. "in_scope" = ALL requested changes target patchable fields ` +
    `(see list below) OR a visual asset rebuild, or both.\n` +
    `2. "out_of_scope" = layout, design, structural, new pages, or ` +
    `anything not in the patchable fields list.\n` +
    `3. "ambiguous" = vague request ("make it better"), mixed scope ` +
    `(some patchable + some not), colour without hex code, or missing info.\n` +
    `4. "rebuildOnly" = true when request mentions a visual asset ` +
    `(logo, photo, image, hero, gallery, banner) AND the snapshot ` +
    `shows a recent upload (<7 days). True EVEN IF there are also ` +
    `text changes (patches will be generated separately).\n` +
    `5. Multi-field requests where ALL fields are patchable → "in_scope".\n` +
    `6. Mixed scope (one patchable + one not) → "ambiguous".\n` +
    `7. Never invent facts. Prefer "ambiguous" over wrong "in_scope".\n` +
    `8. Brand colour without hex code → "ambiguous", reasoning starts ` +
    `with "NEED_HEX_CODE:".\n\n` +
    `PATCHABLE FIELDS:\n` +
    `  Text: tagline, about blurb, about bullets\n` +
    `  Business: contact name, phone (display + tel), email, address, ` +
    `service area, opening hours\n` +
    `  Services: description, long description, pricing notes, ` +
    `price-from, features (per service by name)\n` +
    `  FAQ: question, answer (per FAQ by question text)\n` +
    `  Testimonials: quote, location, rating (per testimonial by name)\n` +
    `  Trust: years experience, associations, awards\n` +
    `  Brand: primary colour (hex), secondary colour (hex)\n` +
    `  Offers: current promotional offer\n` +
    `  Add/remove: services, FAQs, testimonials, about bullets\n\n` +
    `SITE STATE:\n${JSON.stringify(snapshot, null, 2)}\n\n` +
    `REQUEST:\n${message}`;

  const out = await callHaiku({
    system,
    prompt,
    maxTokens: 300,
    temperature: 0.2,
  });
  if (!out) return null;

  const jsonText = stripCodeFences(out);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn(`[classify-pass1] JSON parse failed: ${out.slice(0, 200)}`);
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const classification = obj.classification;
  if (
    classification !== "in_scope" &&
    classification !== "out_of_scope" &&
    classification !== "ambiguous"
  )
    return null;

  const confidence = obj.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  )
    return null;

  const reasoning = obj.reasoning;
  if (typeof reasoning !== "string" || reasoning.trim().length === 0)
    return null;

  let rebuildOnly = false;
  if (typeof obj.rebuildOnly === "boolean") rebuildOnly = obj.rebuildOnly;
  if (rebuildOnly && classification !== "in_scope") rebuildOnly = false;

  return {
    classification,
    confidence,
    reasoning: reasoning.trim(),
    rebuildOnly,
  };
}

// ================================================================
// Pass 2 — Patch generation (focused prompt, low temperature)
// ================================================================

async function patchPass(
  message: string,
  snapshot: SiteSnapshot,
  reasoning: string,
): Promise<{
  patches: NonNullable<ClassificationResult["patches"]>;
  skippedPatches?: Array<{ target: string; reason: string }>;
} | null> {
  const targetsList = SAFE_PATCH_TARGETS.map((t) => `  ${t}`).join("\n");

  const system =
    `You generate structured data patches for website change requests. ` +
    `The request was already classified as in_scope. Your ONLY job is ` +
    `to produce the patches array. Output STRICT JSON — no prose, ` +
    `no code fences.`;

  const prompt =
    `OUTPUT SCHEMA:\n` +
    `{ "patches": [\n` +
    `  { "target": "<target>", "newValue": "<string>",\n` +
    `    "serviceName"?: "<exact name>",\n` +
    `    "faqQuestion"?: "<exact question>",\n` +
    `    "testimonialName"?: "<exact name>" }\n` +
    `] }\n\n` +
    `Return { "patches": [] } if no text/data patches needed ` +
    `(pure asset rebuild).\n\n` +
    `AVAILABLE TARGETS:\n${targetsList}\n\n` +
    `ENCODING (newValue is ALWAYS a string):\n` +
    `1. Plain text → the text directly\n` +
    `2. Numbers (priceFrom, yearsExperience, rating) → numeric ` +
    `string e.g. "15000"\n` +
    `3. Arrays (aboutBullets, features) → JSON array string ` +
    `e.g. '["item1","item2"]'\n` +
    `4. Opening hours → JSON object by day abbrev ` +
    `("Mon","Tue","Wed","Thu","Fri","Sat","Sun"), each: ` +
    `{"open":bool,"from"?:"HH:MM","to"?:"HH:MM"}. Include ALL 7 days.\n` +
    `5. Brand colours → "#rrggbb" hex\n` +
    `6. Add ops → newValue is JSON of the new entry\n` +
    `7. Remove ops → newValue is "remove", identify via locator\n\n` +
    `LOCATORS:\n` +
    `- content.services.* (except .add) → "serviceName" = EXACT name ` +
    `from snapshot services array\n` +
    `- content.faq.* (except .add) → "faqQuestion" = EXACT question ` +
    `from snapshot faq array\n` +
    `- content.testimonials.* (except .add) → "testimonialName" = ` +
    `EXACT name from snapshot testimonials array\n` +
    `- .add targets need NO locator\n\n` +
    `IMPORTANT:\n` +
    `1. One patch per distinct change. ALL parts of the request.\n` +
    `2. Each (target + locator) must be unique.\n` +
    `3. Only use targets from the list above.\n` +
    `4. Text in "double quotes" in the request → use EXACTLY that ` +
    `text as newValue. Never paraphrase quoted text.\n` +
    `5. newValue must be the FULL replacement, not a diff.\n` +
    `6. Phone number changes need TWO patches: business.phoneDisplay ` +
    `AND business.phoneTel.\n\n` +
    `SITE STATE:\n${JSON.stringify(snapshot, null, 2)}\n\n` +
    `REQUEST:\n${message}\n\n` +
    `CLASSIFICATION CONTEXT:\n${reasoning}`;

  const out = await callHaiku({
    system,
    prompt,
    maxTokens: 800,
    temperature: 0.1,
  });
  if (!out) return null;

  const jsonText = stripCodeFences(out);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn(`[classify-pass2] JSON parse failed: ${out.slice(0, 200)}`);
    return null;
  }

  return validatePatchArray(parsed);
}

// ================================================================
// Patch validation
// ================================================================

function validatePatchArray(raw: unknown): {
  patches: NonNullable<ClassificationResult["patches"]>;
  skippedPatches?: Array<{ target: string; reason: string }>;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawPatches = obj.patches;
  if (!Array.isArray(rawPatches)) return null;
  if (rawPatches.length === 0) return { patches: [] };

  const normalised: NonNullable<ClassificationResult["patches"]> = [];
  const skippedPatches: Array<{ target: string; reason: string }> = [];
  const seenTargets = new Set<string>();

  for (const p of rawPatches) {
    if (!p || typeof p !== "object") continue;
    const pp = p as Record<string, unknown>;
    const target = pp.target;
    const newValue = pp.newValue;

    if (typeof target !== "string") continue;

    if (!(SAFE_PATCH_TARGETS as readonly string[]).includes(target)) {
      console.warn(
        `[classify-pass2] Unsafe target '${target}' — skipping patch`,
      );
      skippedPatches.push({
        target,
        reason: `Unsupported target: ${target}`,
      });
      continue;
    }

    if (typeof newValue !== "string" || newValue.length === 0) {
      console.warn(
        `[classify-pass2] Empty/non-string newValue for '${target}' — skipping`,
      );
      skippedPatches.push({
        target,
        reason: `Empty or non-string newValue for '${target}'`,
      });
      continue;
    }

    const serviceName =
      typeof pp.serviceName === "string" ? pp.serviceName.trim() : undefined;
    const faqQuestion =
      typeof pp.faqQuestion === "string" ? pp.faqQuestion.trim() : undefined;
    const testimonialName =
      typeof pp.testimonialName === "string"
        ? pp.testimonialName.trim()
        : undefined;

    const needsServiceLocator =
      target.startsWith("content.services.") &&
      target !== "content.services.add";
    const needsFaqLocator =
      target.startsWith("content.faq.") && target !== "content.faq.add";
    const needsTestimonialLocator =
      target.startsWith("content.testimonials.") &&
      target !== "content.testimonials.add";

    if (needsServiceLocator && !serviceName) {
      skippedPatches.push({
        target,
        reason: `Missing serviceName locator for '${target}'`,
      });
      continue;
    }
    if (needsFaqLocator && !faqQuestion) {
      skippedPatches.push({
        target,
        reason: `Missing faqQuestion locator for '${target}'`,
      });
      continue;
    }
    if (needsTestimonialLocator && !testimonialName) {
      skippedPatches.push({
        target,
        reason: `Missing testimonialName locator for '${target}'`,
      });
      continue;
    }

    const isAddOp = target.endsWith(".add");
    const dedupeKey = isAddOp
      ? `${target}|${newValue}`
      : serviceName || faqQuestion || testimonialName
        ? `${target}|${serviceName ?? ""}|${faqQuestion ?? ""}|${testimonialName ?? ""}`
        : target;

    if (seenTargets.has(dedupeKey)) {
      skippedPatches.push({ target, reason: `Duplicate target` });
      continue;
    }
    seenTargets.add(dedupeKey);

    normalised.push({
      target: target as SafeTarget,
      newValue,
      serviceName,
      faqQuestion,
      testimonialName,
    });
  }

  return {
    patches: normalised,
    skippedPatches: skippedPatches.length > 0 ? skippedPatches : undefined,
  };
}

// ================================================================
// Verbatim quote guard
// ================================================================

/** Free-text patch targets where the customer's exact words matter. */
const VERBATIM_GUARDED_TARGETS: ReadonlySet<string> = new Set([
  "copy.tagline",
  "copy.aboutBlurb",
  "business.contactName",
  "business.phoneDisplay",
  "business.phoneTel",
  "business.publicEmail",
  "business.address",
  "business.serviceArea",
  "content.trust.associations",
  "content.trust.awards",
  "content.services.description",
  "content.services.longDescription",
  "content.services.pricingNotes",
  "content.faq.answer",
  "content.faq.question",
  "content.testimonials.quote",
  "content.testimonials.location",
]);

/**
 * Extract all straight + smart double-quoted strings from the
 * customer's change-request message. Single quotes / apostrophes are
 * intentionally excluded — they collide with English contractions
 * (we're, don't) and the false-positive risk outweighs the benefit.
 *
 * Exported for unit testing.
 */
export function extractDoubleQuotedStrings(message: string): string[] {
  const results: string[] = [];
  const re = /[“”""]([^“”""\n]+)[“”""]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const inner = m[1]!.trim();
    if (inner.length > 0) results.push(inner);
  }
  return results;
}

/**
 * Enforce verbatim-quote semantics on Haiku-generated patches.
 *
 * Algorithm:
 *   1. Extract double-quoted strings from the customer's message.
 *   2. Walk patches in order. For each free-text target, consume
 *      the next available quote as newValue.
 *   3. If existing newValue already matches, no-op. Otherwise
 *      overwrite + count.
 *
 * Exported for unit testing.
 */
export function enforceVerbatimQuotes(
  message: string,
  patches: NonNullable<ClassificationResult["patches"]>,
): {
  patches: NonNullable<ClassificationResult["patches"]>;
  overrideCount: number;
} {
  const quotes = extractDoubleQuotedStrings(message);
  if (quotes.length === 0) return { patches, overrideCount: 0 };

  let cursor = 0;
  let overrideCount = 0;
  const next = patches.map((p) => {
    if (!VERBATIM_GUARDED_TARGETS.has(p.target)) return p;
    if (cursor >= quotes.length) return p;
    const quote = quotes[cursor]!;
    cursor++;
    if (p.newValue === quote) return p;
    overrideCount++;
    return { ...p, newValue: quote };
  });
  return { patches: next, overrideCount };
}

// ================================================================
// Helpers
// ================================================================

function stripCodeFences(out: string): string {
  return out
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
