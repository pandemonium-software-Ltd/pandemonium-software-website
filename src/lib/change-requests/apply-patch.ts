// Patch applier for Cowork-classified in-scope change requests.
//
// Takes a SafeTarget + newValue and writes it to the right slot in
// the prospect's onboarding data, recording the BEFORE value for
// revert. Defence-in-depth whitelist check + zod re-validation
// before write.
//
// All writes go through updateProspectOnboarding so the existing
// merge + chunked-rich-text logic keeps working. Side effects:
//   1. Writes the new value to onboardingData
//   2. Returns the previousValue so the caller can stamp it on
//      the change request audit log (used by reject revert)

import {
  SAFE_PATCH_TARGETS,
  type SafeTarget,
} from "../haiku/classify-change-request";
import {
  updateProspectOnboarding,
  type ProspectRecord,
} from "../notion-prospects";
import {
  onboardingDataSchema,
  type OnboardingData,
} from "../onboarding";
import {
  OFFER_HEADLINE_MAX,
  OFFER_BODY_MAX,
  OFFER_CTA_LABEL_MAX,
  OFFER_CTA_URL_MAX,
} from "../offers/limits";

export type AppliedPatch = {
  target: SafeTarget;
  previousValue: unknown;
  newValue: string;
};

export type ApplyResult =
  | { ok: true; applied: AppliedPatch[] }
  | { ok: false; reason: string };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Input shape — locator fields are optional but required for
 *  service/faq/testimonial targets (the applier enforces). */
export type IncomingPatch = {
  target: SafeTarget;
  newValue: string;
  serviceName?: string;
  faqQuestion?: string;
  testimonialName?: string;
  locationName?: string;
};

/**
 * Apply ONE OR MORE patches atomically. All patches are validated
 * against the whitelist + applied in-memory, then a single Notion
 * write commits the result. If any patch fails validation OR the
 * final shape fails the schema, NOTHING is written — the call
 * returns `{ ok: false }` and Notion is unchanged.
 *
 * Multi-field requests use the array form so we get atomic
 * "all or nothing" semantics on a single Notion update — much
 * safer than applying field-by-field where a mid-sequence failure
 * leaves Notion in a half-applied state.
 *
 * Returns an `applied` array of `{target, previousValue, newValue}`
 * the caller stamps on the change-request audit log so reject can
 * revert in reverse.
 */
export async function applyChangeRequestPatches(args: {
  prospect: ProspectRecord;
  patches: IncomingPatch[];
}): Promise<ApplyResult> {
  if (args.patches.length === 0) {
    return { ok: false, reason: "No patches to apply (empty array)" };
  }
  // Whitelist check on every target before we touch state.
  for (const p of args.patches) {
    if (!(SAFE_PATCH_TARGETS as readonly string[]).includes(p.target)) {
      return {
        ok: false,
        reason: `Target '${p.target}' not in safe whitelist`,
      };
    }
  }
  const parsed = onboardingDataSchema.safeParse(
    args.prospect.onboardingData ?? {},
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    console.error(
      `[apply-patch] onboardingData failed schema validation: ` +
        `${issue?.path?.join(".")} — ${issue?.message ?? "unknown"}`,
    );
    return {
      ok: false,
      reason: `onboardingData failed schema validation: ${issue?.path?.join(".")} — ${issue?.message ?? "unknown"}`,
    };
  }
  const baseData: OnboardingData = parsed.data;

  // Mutable working copies of each slice we might touch. We
  // re-assemble into the final OnboardingData at the end.
  const content = (baseData.content ?? {}) as Record<string, unknown>;
  const branding = (baseData.branding ?? {}) as Record<string, unknown>;
  const applied: AppliedPatch[] = [];

  for (const patch of args.patches) {
    let previousValue: unknown;
    try {
      // ----- Branding (hex-validated) -----
      if (patch.target === "branding.brandColorPrimary") {
        if (!HEX_RE.test(patch.newValue))
          throw new Error(
            `Primary colour must be 6-digit hex (got "${patch.newValue}")`,
          );
        previousValue = branding.brandColorPrimary ?? undefined;
        branding.brandColorPrimary = patch.newValue;
      } else if (patch.target === "branding.brandColorSecondary") {
        if (!HEX_RE.test(patch.newValue))
          throw new Error(
            `Secondary colour must be 6-digit hex (got "${patch.newValue}")`,
          );
        previousValue = branding.brandColorSecondary ?? undefined;
        branding.brandColorSecondary = patch.newValue;
      }
      // ----- Offers — content.offers.current -----
      // newValue is a JSON-encoded OfferEntry. We parse +
      // structurally validate, then write into content.offers.current.
      // History is archived (old current → first item in history,
      // bounded to 24 entries — matches the schema cap).
      else if (patch.target === "content.offers.current") {
        const newOffer = parseOfferEntry(patch.newValue);
        const offersSlice = (content.offers ?? {}) as {
          current?: Record<string, unknown>;
          history?: Record<string, unknown>[];
        };
        previousValue = offersSlice.current ?? undefined;
        const newHistory = offersSlice.current
          ? [offersSlice.current, ...(offersSlice.history ?? [])].slice(0, 24)
          : offersSlice.history ?? [];
        content.offers = { current: newOffer, history: newHistory };
      }
      // ----- Top-level content copy fields -----
      else if (patch.target === "copy.tagline") {
        previousValue = content.tagline ?? undefined;
        content.tagline = patch.newValue;
      } else if (patch.target === "copy.aboutBlurb") {
        previousValue = content.aboutBlurb ?? undefined;
        content.aboutBlurb = patch.newValue;
      } else if (patch.target === "content.aboutBullets") {
        previousValue = content.aboutBullets ?? undefined;
        content.aboutBullets = parseJsonArrayOfStrings(
          patch.newValue,
          "aboutBullets",
        );
      }
      // ----- aboutBullets add/remove -----
      else if (patch.target === "content.aboutBullets.add") {
        const cur = Array.isArray(content.aboutBullets)
          ? (content.aboutBullets as string[]).slice()
          : [];
        if (cur.length >= 8)
          throw new Error("aboutBullets is at the 8-item maximum");
        // previousValue is the entire pre-add array so revert can
        // restore it cleanly (revert path detects `.add` and lops
        // off the appended item; falls back to full restore if the
        // array shape doesn't match).
        previousValue = cur;
        cur.push(patch.newValue.trim());
        content.aboutBullets = cur;
      } else if (patch.target === "content.aboutBullets.remove") {
        const cur = Array.isArray(content.aboutBullets)
          ? (content.aboutBullets as string[]).slice()
          : [];
        const target = patch.newValue.trim();
        const removeIdx = cur.findIndex(
          (b) => normaliseLocator(b) === normaliseLocator(target),
        );
        if (removeIdx < 0)
          throw new Error(
            `aboutBullets entry "${target}" not found on this customer`,
          );
        previousValue = cur;
        cur.splice(removeIdx, 1);
        content.aboutBullets = cur;
      }
      // ----- Trust signals -----
      else if (patch.target === "content.trust.yearsExperience") {
        const trust = (content.trust ?? {}) as Record<string, unknown>;
        previousValue = trust.yearsExperience ?? undefined;
        trust.yearsExperience = parseInteger(
          patch.newValue,
          "yearsExperience",
        );
        content.trust = trust;
      } else if (
        patch.target === "content.trust.associations" ||
        patch.target === "content.trust.awards"
      ) {
        const trust = (content.trust ?? {}) as Record<string, unknown>;
        const field = patch.target.slice("content.trust.".length);
        previousValue = trust[field] ?? undefined;
        trust[field] = patch.newValue;
        content.trust = trust;
      }
      // ----- Business details (incl. opening hours blob) -----
      else if (patch.target === "business.openingHours") {
        const business = (content.business ?? {}) as Record<string, unknown>;
        previousValue = business.openingHours ?? undefined;
        business.openingHours = parseOpeningHoursBlob(patch.newValue);
        content.business = business;
      } else if (patch.target.startsWith("business.")) {
        const field = patch.target.slice("business.".length);
        const business = (content.business ?? {}) as Record<string, unknown>;
        previousValue = business[field] ?? undefined;
        business[field] = patch.newValue;
        content.business = business;
      }
      // ----- Service add (no locator) -----
      else if (patch.target === "content.services.add") {
        const services = Array.isArray(content.services)
          ? (content.services as Record<string, unknown>[]).slice()
          : [];
        if (services.length >= 10)
          throw new Error("services is at the 10-item maximum");
        const newService = parseServiceObject(patch.newValue);
        if (
          services.some(
            (s) =>
              normaliseLocator(s.serviceName) ===
              normaliseLocator(newService.serviceName),
          )
        )
          throw new Error(
            `A service named "${newService.serviceName}" already exists`,
          );
        previousValue = services;
        services.push(newService);
        content.services = services;
      }
      // ----- Service remove (locator: serviceName) -----
      else if (patch.target === "content.services.remove") {
        if (!patch.serviceName)
          throw new Error("serviceName locator required for remove");
        const services = Array.isArray(content.services)
          ? (content.services as Record<string, unknown>[]).slice()
          : [];
        const idx = services.findIndex(
          (s) =>
            normaliseLocator(s?.serviceName) ===
            normaliseLocator(patch.serviceName),
        );
        if (idx < 0)
          throw new Error(`Service "${patch.serviceName}" not found`);
        previousValue = services;
        services.splice(idx, 1);
        content.services = services;
      }
      // ----- Per-service field update (locator: serviceName) -----
      else if (patch.target.startsWith("content.services.")) {
        if (!patch.serviceName)
          throw new Error(
            `serviceName locator required for ${patch.target}`,
          );
        const services = Array.isArray(content.services)
          ? (content.services as Record<string, unknown>[])
          : [];
        const idx = services.findIndex(
          (s) => normaliseLocator(s?.serviceName) === normaliseLocator(patch.serviceName),
        );
        if (idx < 0)
          throw new Error(
            `Service "${patch.serviceName}" not found on this customer`,
          );
        const field = patch.target.slice("content.services.".length);
        previousValue = services[idx]![field] ?? undefined;
        if (field === "priceFrom") {
          services[idx]![field] = parseNumber(patch.newValue, "priceFrom");
        } else if (field === "features") {
          services[idx]![field] = parseJsonArrayOfStrings(
            patch.newValue,
            "features",
          );
        } else {
          services[idx]![field] = patch.newValue;
        }
        content.services = services;
      }
      // ----- FAQ add (no locator) -----
      else if (patch.target === "content.faq.add") {
        const faq = Array.isArray(content.faq)
          ? (content.faq as Record<string, unknown>[]).slice()
          : [];
        if (faq.length >= 10)
          throw new Error("faq is at the 10-item maximum");
        const newFaq = parseFaqObject(patch.newValue);
        if (
          faq.some(
            (f) =>
              normaliseLocator(f.question) ===
              normaliseLocator(newFaq.question),
          )
        )
          throw new Error(
            `An FAQ entry with question "${newFaq.question}" already exists`,
          );
        previousValue = faq;
        faq.push(newFaq);
        content.faq = faq;
      }
      // ----- FAQ remove (locator: faqQuestion) -----
      else if (patch.target === "content.faq.remove") {
        if (!patch.faqQuestion)
          throw new Error("faqQuestion locator required for remove");
        const faq = Array.isArray(content.faq)
          ? (content.faq as Record<string, unknown>[]).slice()
          : [];
        const idx = faq.findIndex(
          (f) =>
            normaliseLocator(f?.question) ===
            normaliseLocator(patch.faqQuestion),
        );
        if (idx < 0)
          throw new Error(`FAQ "${patch.faqQuestion}" not found`);
        previousValue = faq;
        faq.splice(idx, 1);
        content.faq = faq;
      }
      // ----- Per-FAQ field update (locator: faqQuestion) -----
      else if (patch.target.startsWith("content.faq.")) {
        if (!patch.faqQuestion)
          throw new Error(
            `faqQuestion locator required for ${patch.target}`,
          );
        const faq = Array.isArray(content.faq)
          ? (content.faq as Record<string, unknown>[])
          : [];
        const idx = faq.findIndex(
          (f) => normaliseLocator(f?.question) === normaliseLocator(patch.faqQuestion),
        );
        if (idx < 0)
          throw new Error(
            `FAQ question "${patch.faqQuestion}" not found on this customer`,
          );
        const field = patch.target.slice("content.faq.".length);
        previousValue = faq[idx]![field] ?? undefined;
        faq[idx]![field] = patch.newValue;
        content.faq = faq;
      }
      // ----- Testimonial add (no locator) -----
      else if (patch.target === "content.testimonials.add") {
        const tests = Array.isArray(content.testimonials)
          ? (content.testimonials as Record<string, unknown>[]).slice()
          : [];
        if (tests.length >= 5)
          throw new Error("testimonials is at the 5-item maximum");
        const newTest = parseTestimonialObject(patch.newValue);
        if (
          tests.some(
            (t) =>
              normaliseLocator(t.name) === normaliseLocator(newTest.name),
          )
        )
          throw new Error(
            `A testimonial from "${newTest.name}" already exists`,
          );
        previousValue = tests;
        tests.push(newTest);
        content.testimonials = tests;
      }
      // ----- Testimonial remove (locator: testimonialName) -----
      else if (patch.target === "content.testimonials.remove") {
        if (!patch.testimonialName)
          throw new Error("testimonialName locator required for remove");
        const tests = Array.isArray(content.testimonials)
          ? (content.testimonials as Record<string, unknown>[]).slice()
          : [];
        const idx = tests.findIndex(
          (t) =>
            normaliseLocator(t?.name) ===
            normaliseLocator(patch.testimonialName),
        );
        if (idx < 0)
          throw new Error(
            `Testimonial from "${patch.testimonialName}" not found`,
          );
        previousValue = tests;
        tests.splice(idx, 1);
        content.testimonials = tests;
      }
      // ----- Per-testimonial field update (locator: testimonialName) -----
      else if (patch.target.startsWith("content.testimonials.")) {
        if (!patch.testimonialName)
          throw new Error(
            `testimonialName locator required for ${patch.target}`,
          );
        const tests = Array.isArray(content.testimonials)
          ? (content.testimonials as Record<string, unknown>[])
          : [];
        const idx = tests.findIndex(
          (t) => normaliseLocator(t?.name) === normaliseLocator(patch.testimonialName),
        );
        if (idx < 0)
          throw new Error(
            `Testimonial from "${patch.testimonialName}" not found`,
          );
        const field = patch.target.slice("content.testimonials.".length);
        previousValue = tests[idx]![field] ?? undefined;
        if (field === "rating") {
          tests[idx]![field] = parseInteger(patch.newValue, "rating");
        } else {
          tests[idx]![field] = patch.newValue;
        }
        content.testimonials = tests;
      }
      // ----- Per-location fields (locator: locationName) -----
      else if (patch.target.startsWith("locations.")) {
        if (!patch.locationName)
          throw new Error(
            `locationName locator required for ${patch.target}`,
          );
        const locations = Array.isArray(content.locations)
          ? (content.locations as Record<string, unknown>[])
          : [];
        const idx = locations.findIndex(
          (l) =>
            normaliseLocator(l?.name) ===
            normaliseLocator(patch.locationName),
        );
        if (idx < 0)
          throw new Error(
            `Location "${patch.locationName}" not found on this customer`,
          );
        const field = patch.target.slice("locations.".length);
        previousValue = locations[idx]![field] ?? undefined;
        if (field === "openingHours") {
          locations[idx]![field] = parseOpeningHoursBlob(patch.newValue);
        } else {
          locations[idx]![field] = patch.newValue;
        }
        content.locations = locations;
      }
      // ----- Unknown -----
      else {
        return {
          ok: false,
          reason: `Target '${patch.target}' has no apply handler (whitelist drift?)`,
        };
      }
    } catch (e) {
      return {
        ok: false,
        reason: `Patch '${patch.target}' failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    applied.push({
      target: patch.target,
      previousValue,
      newValue: patch.newValue,
    });
  }

  const newData: OnboardingData = {
    ...baseData,
    content: content as OnboardingData["content"],
    branding: branding as OnboardingData["branding"],
  };

  // Re-validate the assembled new shape. If schema rejects (e.g.
  // any field too long, wrong type), abort entirely — Notion stays
  // at the pre-call state because we haven't written yet.
  const reparsed = onboardingDataSchema.safeParse(newData);
  if (!reparsed.success) {
    const details = reparsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}:${i.message}`)
      .join("; ");
    const failPath = reparsed.error.issues[0]?.path;
    if (failPath) {
      let val: unknown = newData;
      for (const k of failPath) {
        val = (val as Record<string, unknown>)?.[k];
      }
      console.error(
        `[apply-patch] re-validation failed at ${failPath.join(".")}: ` +
          `value=${JSON.stringify(val)} (type=${typeof val}, len=${typeof val === "string" ? val.length : "N/A"})`,
      );
    }
    return {
      ok: false,
      reason: `Schema rejected combined new state: ${details}`,
    };
  }

  try {
    await updateProspectOnboarding(args.prospect.pageId, {
      data: reparsed.data,
    });
  } catch (e) {
    return {
      ok: false,
      reason: `Notion write failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { ok: true, applied };
}

// ---------- Value-parsing helpers ----------

function parseNumber(s: string, label: string): number {
  const n = Number(s);
  if (!Number.isFinite(n))
    throw new Error(`${label} must be a number (got "${s}")`);
  if (n < 0) throw new Error(`${label} must be non-negative`);
  return n;
}

function parseInteger(s: string, label: string): number {
  const n = parseNumber(s, label);
  if (!Number.isInteger(n))
    throw new Error(`${label} must be an integer (got "${s}")`);
  return n;
}

function parseJsonArrayOfStrings(s: string, label: string): string[] {
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error(`${label} must be a JSON array of strings`);
  }
  if (!Array.isArray(v))
    throw new Error(`${label} must be a JSON array (got ${typeof v})`);
  if (!v.every((x) => typeof x === "string"))
    throw new Error(`${label} entries must all be strings`);
  return v;
}

/** Parse the opening-hours blob — JSON object keyed by day
 *  abbreviation ("Mon" / "Tue" / ...). Each value: { open: bool,
 *  from?: "HH:MM", to?: "HH:MM" }. Matches the schema's
 *  openingHours shape exactly so the post-write validation
 *  passes. */
function parseOpeningHoursBlob(
  s: string,
): Record<string, { open: boolean; from?: string; to?: string }> {
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error("openingHours must be a JSON object");
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("openingHours must be a JSON object (day → entry)");
  const result: Record<
    string,
    { open: boolean; from?: string; to?: string }
  > = {};
  for (const [day, entry] of Object.entries(v as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object")
      throw new Error(`openingHours[${day}] must be an object`);
    const e = entry as Record<string, unknown>;
    if (typeof e.open !== "boolean")
      throw new Error(`openingHours[${day}].open must be a boolean`);
    const out: { open: boolean; from?: string; to?: string } = {
      open: e.open,
    };
    if (e.from !== undefined) {
      if (typeof e.from !== "string")
        throw new Error(`openingHours[${day}].from must be a string`);
      out.from = e.from;
    }
    if (e.to !== undefined) {
      if (typeof e.to !== "string")
        throw new Error(`openingHours[${day}].to must be a string`);
      out.to = e.to;
    }
    result[day] = out;
  }
  return result;
}

/** Case-insensitive trim for locator matching — "Lawn Care for you"
 *  matches "Lawn Care For You". */
function normaliseLocator(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------- New-entry parsers (for .add operations) ----------

/** Parse a new service object from JSON. Required: serviceName.
 *  Optional: description, priceFrom (number), longDescription,
 *  features (string array), pricingNotes. Schema re-validates
 *  the assembled state — bad shapes get rejected there too. */
function parseServiceObject(s: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error(
      "Service must be a JSON object with at least {serviceName: string}",
    );
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Service must be a JSON object");
  const obj = v as Record<string, unknown>;
  const rawName = typeof obj.serviceName === "string" ? obj.serviceName
    : typeof obj.name === "string" ? obj.name : "";
  if (!rawName.trim())
    throw new Error("Service.serviceName is required");
  const result: Record<string, unknown> = {
    serviceName: rawName.trim(),
  };
  if (typeof obj.description === "string")
    result.description = obj.description.trim();
  if (typeof obj.longDescription === "string")
    result.longDescription = obj.longDescription.trim();
  if (typeof obj.pricingNotes === "string")
    result.pricingNotes = obj.pricingNotes.trim();
  if (obj.priceFrom !== undefined) {
    const n =
      typeof obj.priceFrom === "number"
        ? obj.priceFrom
        : Number(obj.priceFrom);
    if (!Number.isFinite(n) || n < 0)
      throw new Error("Service.priceFrom must be non-negative number");
    result.priceFrom = n;
  }
  if (obj.features !== undefined) {
    if (!Array.isArray(obj.features) || !obj.features.every((x) => typeof x === "string"))
      throw new Error("Service.features must be an array of strings");
    result.features = obj.features.map((f) => (f as string).trim());
  }
  return result;
}

/** Parse a new FAQ entry. Required: question + answer (both strings). */
function parseFaqObject(s: string): { question: string; answer: string } {
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error("FAQ must be a JSON object {question, answer}");
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("FAQ must be a JSON object");
  const obj = v as Record<string, unknown>;
  if (typeof obj.question !== "string" || obj.question.trim() === "")
    throw new Error("FAQ.question is required");
  if (typeof obj.answer !== "string" || obj.answer.trim() === "")
    throw new Error("FAQ.answer is required");
  return { question: obj.question.trim(), answer: obj.answer.trim() };
}

/** Parse a new testimonial. Required: name + quote. Optional: location,
 *  rating (1-5 integer). */
function parseTestimonialObject(s: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error("Testimonial must be a JSON object {name, quote, ...}");
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Testimonial must be a JSON object");
  const obj = v as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.trim() === "")
    throw new Error("Testimonial.name is required");
  if (typeof obj.quote !== "string" || obj.quote.trim() === "")
    throw new Error("Testimonial.quote is required");
  const result: Record<string, unknown> = {
    name: obj.name.trim(),
    quote: obj.quote.trim(),
  };
  if (typeof obj.location === "string")
    result.location = obj.location.trim();
  if (obj.rating !== undefined) {
    const n =
      typeof obj.rating === "number" ? obj.rating : Number(obj.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5)
      throw new Error("Testimonial.rating must be an integer 1-5");
    result.rating = n;
  }
  return result;
}

/** Parse + validate an OfferEntry JSON. Required: id, headline,
 *  startsAt, endsAt (YYYY-MM-DD). Optional: body, ctaLabel,
 *  ctaUrl. Caller (admin approve / Cowork apply) is trusted to
 *  have stamped id + createdAt; this parser is defensive in case
 *  Haiku ever produces a malformed offer JSON. */
function parseOfferEntry(s: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error(
      "Offer must be JSON {id,headline,startsAt,endsAt,...}",
    );
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Offer must be a JSON object");
  const obj = v as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id.trim())
    throw new Error("Offer.id is required");
  if (typeof obj.headline !== "string" || !obj.headline.trim())
    throw new Error("Offer.headline is required");
  if (obj.headline.length > OFFER_HEADLINE_MAX)
    throw new Error(`Offer.headline must be ≤ ${OFFER_HEADLINE_MAX} chars`);
  if (typeof obj.body === "string" && obj.body.length > OFFER_BODY_MAX)
    throw new Error(`Offer.body must be ≤ ${OFFER_BODY_MAX} chars`);
  if (
    typeof obj.ctaLabel === "string" &&
    obj.ctaLabel.length > OFFER_CTA_LABEL_MAX
  )
    throw new Error(
      `Offer.ctaLabel must be ≤ ${OFFER_CTA_LABEL_MAX} chars`,
    );
  if (
    typeof obj.ctaUrl === "string" &&
    obj.ctaUrl.length > OFFER_CTA_URL_MAX
  )
    throw new Error(`Offer.ctaUrl must be ≤ ${OFFER_CTA_URL_MAX} chars`);
  if (typeof obj.startsAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.startsAt))
    throw new Error("Offer.startsAt must be YYYY-MM-DD");
  if (typeof obj.endsAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.endsAt))
    throw new Error("Offer.endsAt must be YYYY-MM-DD");
  if (obj.endsAt < obj.startsAt)
    throw new Error("Offer.endsAt must be on or after startsAt");
  const result: Record<string, unknown> = {
    id: obj.id.trim(),
    headline: obj.headline.trim(),
    startsAt: obj.startsAt,
    endsAt: obj.endsAt,
    status: "active",
    createdAt:
      typeof obj.createdAt === "string"
        ? obj.createdAt
        : new Date().toISOString(),
  };
  if (typeof obj.body === "string" && obj.body.trim())
    result.body = obj.body.trim();
  if (typeof obj.ctaLabel === "string" && obj.ctaLabel.trim())
    result.ctaLabel = obj.ctaLabel.trim();
  if (typeof obj.ctaUrl === "string" && obj.ctaUrl.trim())
    result.ctaUrl = obj.ctaUrl.trim();
  return result;
}

/**
 * Backward-compat shim: existing callers still want single-patch
 * semantics. Wraps the array variant + flattens the result.
 *
 * @deprecated Use `applyChangeRequestPatches` directly.
 */
export async function applyChangeRequestPatch(args: {
  prospect: ProspectRecord;
  target: SafeTarget;
  newValue: string;
  serviceName?: string;
  faqQuestion?: string;
  testimonialName?: string;
  locationName?: string;
}): Promise<
  | { ok: true; target: SafeTarget; previousValue: unknown; newValue: string }
  | { ok: false; reason: string }
> {
  const res = await applyChangeRequestPatches({
    prospect: args.prospect,
    patches: [
      {
        target: args.target,
        newValue: args.newValue,
        serviceName: args.serviceName,
        faqQuestion: args.faqQuestion,
        testimonialName: args.testimonialName,
        locationName: args.locationName,
      },
    ],
  });
  if (!res.ok) return res;
  const first = res.applied[0]!;
  return {
    ok: true,
    target: first.target,
    previousValue: first.previousValue,
    newValue: first.newValue,
  };
}
