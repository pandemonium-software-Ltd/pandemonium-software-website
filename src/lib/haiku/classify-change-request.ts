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
    `  "patches": null OR [ { "target": "<target>", "newValue": "<string>", ` +
    `"serviceName"?: "<exact service name>", "faqQuestion"?: "<exact question>", ` +
    `"testimonialName"?: "<exact testimonial name>" }, ... ],\n` +
    `  "rebuildOnly": true OR false\n` +
    `}\n\n` +
    `In-scope targets you can patch (any other change is out_of_scope):\n` +
    `${targetsList}\n\n` +
    `Value-encoding rules (newValue is ALWAYS a string — encode as below):\n` +
    `  - String targets: just the text.\n` +
    `  - "content.aboutBullets" → JSON array of strings, e.g. ` +
    `'["Free quotes","2-year guarantee"]'.\n` +
    `  - "content.services.features" → JSON array of strings.\n` +
    `  - "content.services.priceFrom" → numeric string, e.g. "15000".\n` +
    `  - "content.trust.yearsExperience" → numeric string, e.g. "12".\n` +
    `  - "content.testimonials.rating" → numeric string 1-5.\n` +
    `  - "business.openingHours" → JSON object keyed by day abbreviation ` +
    `("Mon","Tue","Wed","Thu","Fri","Sat","Sun"). Each entry: ` +
    `{"open":bool,"from"?:"HH:MM","to"?:"HH:MM"}. Example: ` +
    `'{"Mon":{"open":true,"from":"09:00","to":"17:00"},"Sat":{"open":false}}'. ` +
    `Include EVERY day in the object — overwrites the whole record.\n` +
    `  - "branding.brandColorPrimary" / "branding.brandColorSecondary" → ` +
    `6-digit hex with leading hash, e.g. "#1a2b3c". Only patch if the ` +
    `customer supplied a hex code OR a named colour you can map to a ` +
    `specific hex with high confidence (basic colours like "red"=#dc2626, ` +
    `"navy"=#1e3a8a). If the customer gave a vague reference like ` +
    `"more blue" / "darker red" — ambiguous, ask for a hex code.\n` +
    `  - "*.add" operations (services / faq / testimonials / aboutBullets) → ` +
    `newValue is a JSON-encoded object describing the new entry:\n` +
    `      • content.services.add → {"serviceName":"...","description"?,"longDescription"?,"priceFrom"?,"features"?,"pricingNotes"?}\n` +
    `      • content.faq.add → {"question":"...","answer":"..."}\n` +
    `      • content.testimonials.add → {"name":"...","quote":"...","location"?,"rating"?}\n` +
    `      • content.aboutBullets.add → just the plain bullet text\n` +
    `    .add operations DO NOT need a locator. Adding multiple in one ` +
    `request → multiple patches with the same target are allowed.\n` +
    `  - "*.remove" operations → newValue is any non-empty marker ` +
    `(e.g. "remove" or the locator text); the locator field is what ` +
    `identifies what gets removed:\n` +
    `      • content.services.remove → serviceName locator\n` +
    `      • content.faq.remove → faqQuestion locator\n` +
    `      • content.testimonials.remove → testimonialName locator\n` +
    `      • content.aboutBullets.remove → newValue is the exact bullet ` +
    `text to remove (no locator field).\n\n` +
    `Locator rules — patches that target a specific entry in an array:\n` +
    `  - "content.services.*" targets REQUIRE "serviceName" set to the ` +
    `EXACT name from the snapshot's services array. If the customer ` +
    `says "the lawn care service" and the snapshot has ` +
    `services=[{name:"Lawn Care For You"}], use "serviceName":"Lawn Care For You".\n` +
    `  - "content.faq.*" targets REQUIRE "faqQuestion" set to the EXACT ` +
    `question from the snapshot's faq array.\n` +
    `  - "content.testimonials.*" targets REQUIRE "testimonialName" set ` +
    `to the EXACT name from the snapshot's testimonials array.\n` +
    `  - If the customer references something that doesn't appear in the ` +
    `snapshot (e.g. "the FAQ about pricing" but no matching question ` +
    `exists), classify as "ambiguous" — don't guess the locator.\n\n` +
    `Rules:\n` +
    `1. Only set "patches" when classification is "in_scope" AND the ` +
    `customer asked for a change to ONE OR MORE of the targets above. ` +
    `Single-field requests produce a 1-element array; multi-field ` +
    `produce N elements.\n` +
    `2. Image / layout / design / structural / new-page changes are ` +
    `always "out_of_scope". Layout/styling beyond the brand-colour ` +
    `swap is out_of_scope.\n` +
    `3. If the customer's request is vague (e.g. "make it look better", ` +
    `"freshen up the copy") mark "ambiguous" and set patches to null.\n` +
    `4. "newValue" is the FULL replacement value, not a diff.\n` +
    `5. Confidence below 0.7 means the request is risky — Cowork will ` +
    `escalate to a human regardless of classification, so be honest about ` +
    `your uncertainty.\n` +
    `6. NEVER include a patch with a target outside the list above. If ` +
    `even one requested change isn't in the list (mixed scope, e.g. ` +
    `"change phone AND add a new page"), classify as "ambiguous" with ` +
    `patches=null and explain in reasoning which part you couldn't handle.\n` +
    `7. MULTI-FIELD: customers commonly bundle related changes ` +
    `("change phone AND email", "update tagline and address", ` +
    `"update Garden Pods price and description"). When ALL the requested ` +
    `fields are in the safe-target list, return ALL of them as patches in ` +
    `the array — DON'T escalate. Only escalate when the request is ` +
    `mixed-scope (rule 6) OR vague (rule 3). Single fields with multiple ` +
    `data points (e.g. "update address to X, Y, postcode Z") are still ` +
    `ONE patch.\n` +
    `8. Each (target, locator) combination in the patches array MUST be ` +
    `unique — never patch the same target+locator twice. Same target ` +
    `with different locators (e.g. priceFrom on two different services) ` +
    `is fine.\n` +
    `8b. BRAND COLOURS clarification: when the customer asks to change ` +
    `a colour but doesn't give a hex code or unambiguous named colour ` +
    `("make my primary more blue", "I want a green tone"), classify as ` +
    `"ambiguous" with patches=null and reasoning starting with ` +
    `"NEED_HEX_CODE:" so Cowork can email them to ask. Example: ` +
    `"NEED_HEX_CODE: Customer wants a darker primary but didn't supply ` +
    `a hex — please reply with the code (e.g. #2c5e9f) and I'll apply it."\n` +
    `9. ASSET / PHOTO / LOGO refresh — IMPORTANT. The customer's Hub ` +
    `has a "Brand Assets" step (Step 4) where they upload their logo, ` +
    `hero image, about photo, service photos and gallery photos. When ` +
    `they re-upload a new version of an asset there, the new file is ` +
    `ALREADY in their data and you have NOTHING to patch — Cowork just ` +
    `needs to dispatch a fresh build to ship it. This is called ` +
    `"rebuildOnly" intent.\n` +
    `Set "classification":"in_scope", "patches":null, "rebuildOnly":true ` +
    `when:\n` +
    `   (a) the customer's request mentions a visual asset — any of: ` +
    `logo, photo, image, picture, header, banner, hero, gallery, photos, ` +
    `headshot, profile photo, team photo, service photo; AND\n` +
    `   (b) the snapshot's "assets" object shows an "uploadedAt" ` +
    `timestamp (any slot — logo, hero, about, gallery, services) ` +
    `within the last 7 DAYS of the current date. The customer is ` +
    `referring to an upload they just did — this is the signal.\n\n` +
    `EXAMPLES:\n` +
    `  - Message: "Update the website logo from the brand asset update." ` +
    `Snapshot shows assets.logo.uploadedAt = today. → in_scope, ` +
    `rebuildOnly:true, patches:null. (Customer says "logo" + recent ` +
    `upload exists → rebuild.)\n` +
    `  - Message: "Please use my new hero photo I just uploaded." ` +
    `Snapshot assets.hero.uploadedAt = 2 days ago. → in_scope, ` +
    `rebuildOnly:true, patches:null.\n` +
    `  - Message: "Change the logo on my site." Snapshot has no recent ` +
    `upload (assets.lastUploadedAt > 7 days ago, or absent). → ` +
    `ambiguous, patches:null, rebuildOnly:false. Reasoning should say ` +
    `"No recent upload found in Brand Assets — please upload via ` +
    `Step 4 of the Hub first."\n` +
    `  - Message: "I uploaded a new logo, please use it. Also change my ` +
    `phone to 0123." Snapshot has logo uploaded today. → in_scope, ` +
    `patches:[{target:"business.phoneDisplay",newValue:"0123"}], ` +
    `rebuildOnly:true. (Combined: text patch + rebuild for asset.)\n\n` +
    `Do NOT classify asset requests as "out_of_scope" when a recent ` +
    `upload exists — that's exactly the rebuildOnly case.\n` +
    `10. rebuildOnly defaults to false. Only set it true when rule 9 ` +
    `applies. NEVER set rebuildOnly:true for text-only changes — those ` +
    `use the patches array.\n` +
    `11. ADD operations for new services / FAQs / testimonials / about ` +
    `bullets are IN SCOPE. Customers commonly want to extend their site ` +
    `without changing what's there. Examples:\n\n` +
    `  - "Add a new service: Tree Felling, £200 starting price, 2-day ` +
    `turnaround, weekend visits available." → patches: ` +
    `[{"target":"content.services.add","newValue":"{\\"serviceName\\":\\"Tree Felling\\",` +
    `\\"priceFrom\\":200,\\"description\\":\\"2-day turnaround. Weekend visits available.\\"}"}]\n` +
    `  - "Add an FAQ: Q: Do you do emergencies? A: Yes, evenings + weekends ` +
    `at a 50% surcharge." → patches: [{"target":"content.faq.add","newValue":"{\\"question\\":\\"Do you do emergencies?\\",\\"answer\\":\\"Yes, evenings and weekends at a 50% surcharge.\\"}"}]\n` +
    `  - "Add a testimonial from Sarah in Oxford: 'Great service, on time' ` +
    `5 stars." → patches: [{"target":"content.testimonials.add","newValue":"{\\"name\\":\\"Sarah\\",\\"location\\":\\"Oxford\\",\\"quote\\":\\"Great service, on time\\",\\"rating\\":5}"}]\n` +
    `  - "Add a bullet about our 24-hour callout." → patches: ` +
    `[{"target":"content.aboutBullets.add","newValue":"24-hour callout service"}]\n` +
    `  - "Add two services: Mowing £20/visit, and Hedge trimming £60." → ` +
    `TWO patches both with target "content.services.add" and different ` +
    `newValue JSON. Same target appearing twice with different newValue ` +
    `is fine for .add.\n\n` +
    `12. REMOVE operations are similarly in scope. The customer names ` +
    `the thing to remove; you put it in the locator field, and newValue ` +
    `can be any non-empty marker. Examples:\n\n` +
    `  - "Remove the Garden Pods service." → patches: ` +
    `[{"target":"content.services.remove","newValue":"remove","serviceName":"Garden Pods"}]\n` +
    `  - "Drop the FAQ about pricing turnaround time." (snapshot has that ` +
    `question) → patches: [{"target":"content.faq.remove","newValue":"remove","faqQuestion":"How long do you take to respond?"}]\n` +
    `  - "Take down John's testimonial." → patches: ` +
    `[{"target":"content.testimonials.remove","newValue":"remove","testimonialName":"John"}]\n` +
    `  - "Remove the 'Free quotes' bullet." → patches: ` +
    `[{"target":"content.aboutBullets.remove","newValue":"Free quotes"}]\n\n` +
    `13. CONSTRAINTS — the applier rejects .add operations that would ` +
    `exceed max counts: services 10, faq 10, testimonials 5, ` +
    `aboutBullets 8. Look at the snapshot's count; if you're at the ` +
    `cap, classify as ambiguous explaining the customer should remove ` +
    `something first.\n` +
    `14. RENAMES of services/FAQs/testimonials (e.g. "rename Lawn Care ` +
    `to Lawn & Garden Care") are NOT yet supported — classify as ` +
    `ambiguous with reasoning explaining that rename isn't on the ` +
    `whitelist; suggest the customer remove the old entry and add a ` +
    `new one if they want.\n` +
    `15. VERBATIM QUOTES — when the customer wraps their replacement ` +
    `text in straight double quotes ("...") or smart double quotes ` +
    `("..."), that quoted text is a LITERAL string they want applied ` +
    `as-is. For any patch whose target is a free-text field (tagline, ` +
    `aboutBlurb, aboutBullets.add, services description/longDescription/` +
    `pricingNotes, services.add (description fields inside JSON), ` +
    `faq.question/answer, testimonials.quote, business.address/` +
    `serviceArea/contactName, trust.associations/awards), the ` +
    `\`newValue\` MUST equal the quoted text exactly — same punctuation, ` +
    `capitalisation, spacing. Never paraphrase, polish, "improve", ` +
    `"smooth", or "fix" quoted text. The customer chose those exact ` +
    `words on purpose. Examples:\n` +
    `  - "Update my tagline to \\"we fix gardens fast\\"." → ` +
    `newValue: "we fix gardens fast" (not "We fix gardens fast." or ` +
    `"Fast garden fixes" or any rewrite).\n` +
    `  - "Set the FAQ answer about pricing to \\"Prices vary by job.\\"" ` +
    `→ newValue: "Prices vary by job." (not "Prices vary depending on ` +
    `the job.")\n` +
    `Single quotes ('...') and apostrophes within words ("we're") are ` +
    `NOT verbatim markers — only double quotes count. Cowork's ` +
    `deterministic guard will overwrite any patch where you diverged ` +
    `from a verbatim double-quoted candidate, so it's safer to copy ` +
    `the quoted text exactly than to "improve" it.`;

  const out = await callHaiku({
    system,
    prompt,
    // Bumped from 600 → 1000 to accommodate multi-patch responses
    // with locator fields (services / faq / testimonials) and the
    // long opening-hours JSON blob.
    maxTokens: 1000,
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
  const validated = validateAndNormalise(parsed);
  if (!validated || !validated.patches || validated.patches.length === 0) {
    return validated;
  }
  // Belt + braces: even with rule #15 in the prompt, Haiku can still
  // drift and "improve" quoted text. Apply the deterministic verbatim-
  // quote guard so the customer's exact words ALWAYS win for free-text
  // targets. See enforceVerbatimQuotes() docstring for the algorithm.
  const guarded = enforceVerbatimQuotes(args.message, validated.patches);
  if (guarded.overrideCount > 0) {
    console.warn(
      `[verbatim-quote-guard] Overrode ${guarded.overrideCount} ` +
        `patch(es) on free-text targets to match the customer's ` +
        `double-quoted text. Haiku had paraphrased the quoted value(s).`,
    );
  }
  return { ...validated, patches: guarded.patches };
}

/**
 * Free-text patch targets — those where the customer's exact words
 * matter. Numeric, JSON-encoded, hex-colour, structured-locator, and
 * .remove/.add-marker targets are NOT in this set: their newValue
 * format is mechanical (a number, hex, JSON blob, or a marker token),
 * not natural language, so the verbatim-quote guard would either
 * misfire or be a no-op.
 *
 * Notably included:
 *   - business.address / serviceArea / contactName — customer often
 *     quotes the precise wording (postcodes, address punctuation)
 *   - business.publicEmail / phoneDisplay / phoneTel — not free-text
 *     per se, but commonly quoted, and the guard preserves whatever
 *     formatting the customer used (spaces, parentheses, +44 vs 0).
 *   - trust.associations / awards — verbatim acronyms / award names
 *
 * NOT included (intentionally):
 *   - aboutBullets (full array replace via JSON)
 *   - any *.add / *.remove
 *   - openingHours, services.features, services.priceFrom (numeric),
 *     trust.yearsExperience (numeric), testimonials.rating (numeric)
 *   - branding.brandColorPrimary / Secondary (hex)
 *   - content.offers.current (JSON blob)
 */
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
 * Customers who want verbatim text can use double quotes.
 *
 * Returns the inner text only (without the surrounding quotes), in
 * order of appearance. Empty / whitespace-only quotes are dropped.
 *
 * Exported for unit testing.
 */
export function extractDoubleQuotedStrings(message: string): string[] {
  const results: string[] = [];
  // Match: ASCII double quote OR Unicode "left double quotation
  // mark" (U+201C) OR Unicode "right double quotation mark" (U+201D)
  // → any non-quote, non-newline content → another double-quote
  // variant. Multi-line quoted strings are extremely rare in change
  // requests and could mis-bracket, so we require the content stays
  // on one line.
  const re = /["“”]([^"“”\n]+)["“”]/g;
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
 *   1. Extract double-quoted strings from the customer's message in
 *      order of appearance.
 *   2. Walk the patches array in order. For each patch whose target
 *      is in VERBATIM_GUARDED_TARGETS, consume the next available
 *      quote and use it as the newValue. (Non-free-text patches do
 *      not consume quotes — order alignment stays sensible when
 *      customers mix numeric + free-text changes.)
 *   3. When a patch's existing newValue already equals the matched
 *      quote, no-op. Otherwise overwrite + count the override.
 *
 * Returns the (possibly mutated) patches array + an override count
 * for caller logging.
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
  // Backward-compat: accept legacy single `patch` field too. Haiku
  // can drift back to that shape when the prompt is long; normalise
  // either form into an array.
  const rawPatches: unknown =
    obj.patches !== undefined && obj.patches !== null
      ? obj.patches
      : obj.patch !== undefined && obj.patch !== null
        ? [obj.patch]
        : undefined;

  let patches: ClassificationResult["patches"] | undefined;
  if (rawPatches !== undefined) {
    if (!Array.isArray(rawPatches)) return null;
    if (rawPatches.length === 0) {
      // Empty array means "no patches" — same as undefined.
      patches = undefined;
    } else {
      const normalised: NonNullable<ClassificationResult["patches"]> = [];
      const seenTargets = new Set<string>();
      for (const p of rawPatches) {
        if (!p || typeof p !== "object") return null;
        const pp = p as Record<string, unknown>;
        const target = pp.target;
        const newValue = pp.newValue;
        if (typeof target !== "string") return null;
        // Whitelist enforcement — even one unsafe target invalidates
        // the entire patch set (we don't apply partial; mixed scope
        // requires operator review).
        if (!(SAFE_PATCH_TARGETS as readonly string[]).includes(target)) {
          console.warn(
            `[classify-change-request] Haiku proposed unsafe target '${target}' — discarding ALL patches + downgrading to ambiguous`,
          );
          return {
            classification: "ambiguous",
            confidence: Math.min(confidence, 0.5),
            reasoning: `${reasoning} (Note: Cowork rejected the model's proposed patches because one targeted an unsupported field: ${target}.)`,
          };
        }
        if (typeof newValue !== "string" || newValue.length === 0) {
          // Patches with non-string newValue not yet supported. Drop
          // the entire patch set — partial apply isn't safe — and
          // escalate.
          console.warn(
            `[classify-change-request] Haiku patch had empty/non-string newValue for target '${target}' — discarding patch set`,
          );
          return {
            classification:
              classification as ClassificationResult["classification"],
            confidence,
            reasoning,
          };
        }
        // Locator enforcement — service / faq / testimonial targets
        // need their corresponding locator field. Missing locator =
        // we can't safely identify which entry to patch.
        const serviceName =
          typeof pp.serviceName === "string"
            ? pp.serviceName.trim()
            : undefined;
        const faqQuestion =
          typeof pp.faqQuestion === "string"
            ? pp.faqQuestion.trim()
            : undefined;
        const testimonialName =
          typeof pp.testimonialName === "string"
            ? pp.testimonialName.trim()
            : undefined;
        // `.add` operations create a new entry, so they don't need
        // a locator. Everything else under content.services/faq/
        // testimonials (UPDATE existing field, .remove) MUST have
        // the matching locator.
        const needsServiceLocator =
          target.startsWith("content.services.") &&
          target !== "content.services.add";
        const needsFaqLocator =
          target.startsWith("content.faq.") && target !== "content.faq.add";
        const needsTestimonialLocator =
          target.startsWith("content.testimonials.") &&
          target !== "content.testimonials.add";
        if (needsServiceLocator && !serviceName) {
          return {
            classification: "ambiguous",
            confidence: Math.min(confidence, 0.5),
            reasoning: `${reasoning} (Note: Cowork rejected a services patch because no service name was specified.)`,
          };
        }
        if (needsFaqLocator && !faqQuestion) {
          return {
            classification: "ambiguous",
            confidence: Math.min(confidence, 0.5),
            reasoning: `${reasoning} (Note: Cowork rejected a FAQ patch because no question was specified.)`,
          };
        }
        if (needsTestimonialLocator && !testimonialName) {
          return {
            classification: "ambiguous",
            confidence: Math.min(confidence, 0.5),
            reasoning: `${reasoning} (Note: Cowork rejected a testimonial patch because no testimonial name was specified.)`,
          };
        }
        // Reject duplicate-target requests (Haiku violating rule #8).
        // Last-write-wins would be ambiguous; safer to escalate.
        // For locator-aware targets, uniqueness is target+locator —
        // same target with different services is fine.
        // EXCEPTION: `.add` targets are intentionally append-only
        // and a customer might want to add multiple entries in one
        // request ("Add two new FAQs..."). Include newValue in the
        // dedupe key for those so they don't collide.
        const isAddOp = target.endsWith(".add");
        const dedupeKey = isAddOp
          ? `${target}|${newValue}`
          : serviceName || faqQuestion || testimonialName
            ? `${target}|${serviceName ?? ""}|${faqQuestion ?? ""}|${testimonialName ?? ""}`
            : target;
        if (seenTargets.has(dedupeKey)) {
          return {
            classification: "ambiguous",
            confidence: Math.min(confidence, 0.5),
            reasoning: `${reasoning} (Note: Cowork rejected the model's patches because a duplicate appeared: ${target}.)`,
          };
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
      patches = normalised;
    }
  }
  // rebuildOnly intent — when the customer's request is about an
  // asset they've already re-uploaded. Defaults to false. Validated
  // against the same defence-in-depth pattern as patches: must be
  // boolean, never silently coerced.
  let rebuildOnly = false;
  if (obj.rebuildOnly !== undefined && obj.rebuildOnly !== null) {
    if (typeof obj.rebuildOnly !== "boolean") return null;
    rebuildOnly = obj.rebuildOnly;
  }
  // Defensive: rebuildOnly only meaningful when in_scope. If
  // Haiku set it on out_of_scope/ambiguous, drop it.
  if (rebuildOnly && classification !== "in_scope") {
    rebuildOnly = false;
  }

  // In-scope without patches is still useful — Cowork will escalate,
  // but Ben sees the model's reasoning. Don't filter it.
  return {
    classification,
    confidence,
    reasoning: reasoning.trim(),
    patches,
    rebuildOnly: rebuildOnly ? true : undefined,
  };
}
