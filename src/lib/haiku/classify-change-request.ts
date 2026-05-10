// Haiku classifier for inbound change requests.
//
// Inputs: customer's free-text request + sanitised current site
// state (so the model can write actual values back rather than
// inventing). Output: a structured classification + (when in_scope
// + a safe target) a patch the applier can write to Notion.
//
// Failure mode: every callable returns null on any error
// (invalid JSON, network failure, missing API key). Caller
// (step6-change-requests) treats null as "couldn't classify —
// escalate to Ben".
//
// Confidence threshold for auto-apply lives in the caller, not
// here. The classifier just reports its confidence; deciding what
// to do with a 0.6 vs 0.85 is policy.
//
// IMPORTANT: this classifier produces patches Cowork will apply
// to a customer's live data. The system prompt is intentionally
// strict about staying within the whitelist — if a target isn't
// safely auto-applicable, it should classify as out_of_scope so
// Ben can handle it manually.

import { callHaiku } from "./client";

/** Whitelist of patch targets the applier knows how to write. The
 *  classifier's prompt restricts proposals to this list — anything
 *  else gets reframed as out_of_scope. The applier rejects any
 *  target outside this list as a defence in depth. */
export const SAFE_PATCH_TARGETS = [
  // Site Content step copy fields
  "copy.tagline",
  "copy.aboutBlurb",
  // Business details fields
  "business.contactName",
  "business.phoneDisplay",
  "business.publicEmail",
  "business.address",
  "business.serviceArea",
  // Future v2: service description / faq answer / opening hours
  // (need locator-aware patch + revert; punted for v2)
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
  /** Structured patch the applier will write. Only present when
   *  classification is in_scope AND the target is in
   *  SAFE_PATCH_TARGETS. */
  patch?: {
    target: SafeTarget;
    /** New value being written. String for all current targets. */
    newValue: string;
  };
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
    publicEmail?: string;
    address?: string;
    serviceArea?: string;
  };
  copy: {
    tagline?: string;
    aboutBlurb?: string;
  };
};

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
  const targetsList = SAFE_PATCH_TARGETS.map((t) => `  - ${t}`).join("\n");

  const system =
    `You classify customer change requests for a website builder. ` +
    `Output STRICT JSON matching the schema below — no prose, no ` +
    `code fences, no commentary. Be conservative: when unsure, ` +
    `prefer "out_of_scope" or "ambiguous" over a wrong "in_scope". ` +
    `NEVER invent facts (phone numbers, URLs, prices, dates). ` +
    `If the customer's request implies inventing a value, classify ` +
    `as ambiguous and flag it in reasoning.`;

  const prompt =
    `Customer's current site state (you can reference these to write ` +
    `a correct patch):\n\n` +
    `${JSON.stringify(args.snapshot, null, 2)}\n\n` +
    `Customer's request:\n\n  ${args.message}\n\n` +
    `Classify this request. Respond with ONLY this JSON shape:\n\n` +
    `{\n` +
    `  "classification": "in_scope" | "out_of_scope" | "ambiguous",\n` +
    `  "confidence": <number between 0 and 1>,\n` +
    `  "reasoning": "<1-2 sentences>",\n` +
    `  "patch": null OR { "target": "<one of the targets below>", "newValue": "<string>" }\n` +
    `}\n\n` +
    `In-scope targets you can patch (any other change is out_of_scope):\n` +
    `${targetsList}\n\n` +
    `Rules:\n` +
    `1. Only set "patch" when classification is "in_scope" AND the ` +
    `customer asked for a change to ONE of the targets above.\n` +
    `2. Image / layout / design / structural / new-page changes are ` +
    `always "out_of_scope".\n` +
    `3. If the customer's request is vague (e.g. "make it look better") ` +
    `mark "ambiguous" and don't propose a patch.\n` +
    `4. If patching, "newValue" is the FULL replacement value, not a diff.\n` +
    `5. Confidence below 0.7 means the request is risky — Cowork will ` +
    `escalate to a human regardless of classification, so be honest about ` +
    `your uncertainty.\n` +
    `6. NEVER use "patch" with a target outside the list above.\n` +
    `7. MULTI-FIELD requests: if the customer asks to change MORE THAN ` +
    `ONE distinct field in this single request (e.g. "change email AND ` +
    `phone", "update tagline and address", "change my hours and contact ` +
    `name"), ALWAYS classify as "ambiguous" and DO NOT propose a patch. ` +
    `The reasoning should mention "multi-field — please split into ` +
    `separate requests" so the operator knows to ask the customer to ` +
    `re-submit. Single fields with multiple data points (e.g. "update ` +
    `address to X, Y, postcode Z") are still ONE field and may be ` +
    `patched normally.`;

  const out = await callHaiku({
    system,
    prompt,
    maxTokens: 600,
  });
  if (!out) return null;

  // Parse + validate. Haiku occasionally wraps JSON in code fences
  // despite the instruction; strip them defensively.
  const jsonText = out
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.warn(
      `[classify-change-request] JSON parse failed; raw response: ${out.slice(0, 200)}`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
  return validateAndNormalise(parsed);
}

/**
 * Defensive parse of Haiku's JSON output. Returns null on any
 * shape mismatch — a malformed patch or out-of-whitelist target
 * is treated as "couldn't classify" (caller escalates to Ben).
 */
function validateAndNormalise(raw: unknown): ClassificationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const classification = obj.classification;
  const confidence = obj.confidence;
  const reasoning = obj.reasoning;
  if (
    classification !== "in_scope" &&
    classification !== "out_of_scope" &&
    classification !== "ambiguous"
  ) {
    return null;
  }
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return null;
  }
  if (typeof reasoning !== "string" || reasoning.trim().length === 0) {
    return null;
  }
  let patch: ClassificationResult["patch"] | undefined;
  if (obj.patch !== null && obj.patch !== undefined) {
    if (typeof obj.patch !== "object") return null;
    const p = obj.patch as Record<string, unknown>;
    const target = p.target;
    const newValue = p.newValue;
    if (typeof target !== "string") return null;
    // Whitelist enforcement — Haiku said target=X but X isn't safe.
    if (!(SAFE_PATCH_TARGETS as readonly string[]).includes(target)) {
      console.warn(
        `[classify-change-request] Haiku proposed unsafe target '${target}' — discarding patch + downgrading to ambiguous`,
      );
      return {
        classification: "ambiguous",
        confidence: Math.min(confidence, 0.5),
        reasoning: `${reasoning} (Note: Cowork rejected the model's proposed patch because it targeted an unsupported field.)`,
      };
    }
    if (typeof newValue !== "string" || newValue.length === 0) {
      // Patches with non-string newValue not yet supported by the
      // applier (v2 will add hours / numbers); drop the patch but
      // keep the classification.
      return {
        classification: classification as ClassificationResult["classification"],
        confidence,
        reasoning,
      };
    }
    patch = { target: target as SafeTarget, newValue };
  }
  // In-scope without a patch is still useful — Cowork will
  // escalate, but Ben sees the model's reasoning. Don't filter it.
  return {
    classification,
    confidence,
    reasoning: reasoning.trim(),
    patch,
  };
}
