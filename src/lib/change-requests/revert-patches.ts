// Revert previously-applied change-request patches.
//
// Mirror of applyChangeRequestPatches but in REVERSE: each patch's
// `previousValue` (captured at apply-time) is written back to the
// same location in onboardingData. Patches are applied in reverse
// order so multi-patch sequences unwind correctly (e.g. if Cowork
// applied {tagline=A, aboutBlurb=B} the revert applies
// {aboutBlurb=prevB, tagline=prevA} in that order).
//
// Used by the admin "Revert" action on a resolved CR — operator
// realises the change was wrong / customer wants the old value
// back. Avoids the operator having to re-type the original value
// by hand.
//
// No validation: if the value was VALID when it was the prior
// state of the field, it's valid now too. This skips ~600 lines
// of input validation that the apply path needs because we trust
// that whatever was IN onboardingData before the apply is a
// reasonable value to put back.
//
// Limitations:
//   - Per-item patches (services / faq / testimonials by locator)
//     require the locator field to STILL match an item in the
//     current state. If the customer renamed the service between
//     apply and revert, the locator won't match and that single
//     patch's revert is skipped (logged + flagged in the result).
//   - Whole-array patches (.add / .remove / .aboutBullets) revert
//     by overwriting with previousValue (which is the full pre-
//     change array). Always works.

import {
  onboardingDataSchema,
  type OnboardingData,
} from "../onboarding";
import {
  updateProspectOnboarding,
  type ProspectRecord,
} from "../notion-prospects";

/** Minimal patch shape needed to revert. Compatible with both
 *  AppliedPatch (from apply-patch.ts — used by Cowork at apply
 *  time) and the looser shape stored on ChangeRequest.coworkPatches
 *  in Notion. We only USE `target` + `previousValue` + the optional
 *  locators here — newValue is ignored on revert. */
export type RevertablePatch = {
  target: string;
  previousValue: unknown;
  serviceName?: string;
  faqQuestion?: string;
  testimonialName?: string;
};

export type RevertResult =
  | {
      ok: true;
      revertedCount: number;
      /** Patches we couldn't revert (e.g. locator no longer matches).
       *  Empty array on full success. Caller decides whether to
       *  surface to the operator. */
      skipped: { target: string; reason: string }[];
    }
  | { ok: false; reason: string };

export async function revertChangeRequestPatches(args: {
  prospect: ProspectRecord;
  patches: readonly RevertablePatch[];
}): Promise<RevertResult> {
  if (args.patches.length === 0) {
    return { ok: false, reason: "No patches to revert (empty array)" };
  }

  const parsed = onboardingDataSchema.safeParse(
    args.prospect.onboardingData ?? {},
  );
  const baseData: OnboardingData = parsed.success ? parsed.data : {};

  // Mutable working copies of every slice we might touch.
  const branding = { ...((baseData.branding ?? {}) as Record<string, unknown>) };
  const content = { ...((baseData.content ?? {}) as Record<string, unknown>) };
  const business = {
    ...((content.business ?? {}) as Record<string, unknown>),
  };
  const trust = { ...((content.trust ?? {}) as Record<string, unknown>) };
  const services = Array.isArray(content.services)
    ? [...(content.services as Record<string, unknown>[])]
    : [];
  const faq = Array.isArray(content.faq)
    ? [...(content.faq as Record<string, unknown>[])]
    : [];
  const testimonials = Array.isArray(content.testimonials)
    ? [...(content.testimonials as Record<string, unknown>[])]
    : [];
  const offers = { ...((content.offers ?? {}) as Record<string, unknown>) };

  const skipped: { target: string; reason: string }[] = [];
  let revertedCount = 0;

  // Apply in reverse order. Spread + reverse so we don't mutate
  // the caller's array.
  const reversed = [...args.patches].reverse();

  for (const p of reversed) {
    const t = p.target;
    const prev = p.previousValue;

    // Helper: set or delete based on whether prev is undefined.
    const setOrDelete = (
      obj: Record<string, unknown>,
      key: string,
      value: unknown,
    ) => {
      if (value === undefined || value === null) {
        delete obj[key];
      } else {
        obj[key] = value;
      }
    };

    try {
      // ----- Top-level content fields -----
      if (t === "copy.tagline") {
        setOrDelete(content, "tagline", prev);
      } else if (t === "copy.aboutBlurb") {
        setOrDelete(content, "aboutBlurb", prev);
      } else if (
        t === "content.aboutBullets" ||
        t === "content.aboutBullets.add" ||
        t === "content.aboutBullets.remove"
      ) {
        // previousValue is the WHOLE pre-change array.
        if (Array.isArray(prev)) {
          content.aboutBullets = prev;
        } else if (prev === undefined) {
          delete content.aboutBullets;
        } else {
          skipped.push({
            target: t,
            reason: "previousValue not an array — can't revert",
          });
          continue;
        }
      }
      // ----- Business contact fields -----
      else if (t.startsWith("business.")) {
        const key = t.slice("business.".length);
        setOrDelete(business, key, prev);
      }
      // ----- Trust signals -----
      else if (t.startsWith("content.trust.")) {
        const key = t.slice("content.trust.".length);
        setOrDelete(trust, key, prev);
      }
      // ----- Branding colours -----
      else if (t === "branding.brandColorPrimary") {
        setOrDelete(branding, "brandColorPrimary", prev);
      } else if (t === "branding.brandColorSecondary") {
        setOrDelete(branding, "brandColorSecondary", prev);
      }
      // ----- Offers (whole entry) -----
      else if (t === "content.offers.current") {
        setOrDelete(offers, "current", prev);
      }
      // ----- Services array (add/remove) — previousValue is whole
      //       pre-change array -----
      else if (
        t === "content.services.add" ||
        t === "content.services.remove"
      ) {
        if (Array.isArray(prev)) {
          // Replace via splice so the const reference stays valid.
          services.length = 0;
          services.push(...(prev as Record<string, unknown>[]));
        } else if (prev === undefined) {
          services.length = 0;
        } else {
          skipped.push({
            target: t,
            reason: "previousValue not an array — can't revert",
          });
          continue;
        }
      }
      // ----- Per-service field updates (locate by serviceName) -----
      else if (t.startsWith("content.services.")) {
        const field = t.slice("content.services.".length);
        // The locator was stamped on the patch as serviceName.
        // AppliedPatch type doesn't carry locators directly, but
        // they're round-tripped via the original IncomingPatch shape
        // in coworkPatches' Notion JSON. We accept the locator on
        // a sibling field of the AppliedPatch (loose-cast).
        const locator = (p as unknown as { serviceName?: string })
          .serviceName;
        if (!locator) {
          skipped.push({
            target: t,
            reason: "missing serviceName locator on patch — can't revert",
          });
          continue;
        }
        const idx = services.findIndex(
          (s) => (s.serviceName as string) === locator,
        );
        if (idx < 0) {
          skipped.push({
            target: t,
            reason: `service "${locator}" no longer in list — can't revert per-field change`,
          });
          continue;
        }
        const item = { ...services[idx] };
        setOrDelete(item, field, prev);
        services[idx] = item;
      }
      // ----- FAQ array (add/remove) -----
      else if (t === "content.faq.add" || t === "content.faq.remove") {
        if (Array.isArray(prev)) {
          faq.length = 0;
          faq.push(...(prev as Record<string, unknown>[]));
        } else if (prev === undefined) {
          faq.length = 0;
        } else {
          skipped.push({
            target: t,
            reason: "previousValue not an array — can't revert",
          });
          continue;
        }
      }
      // ----- Per-FAQ field updates (locate by faqQuestion) -----
      else if (t.startsWith("content.faq.")) {
        const field = t.slice("content.faq.".length);
        const locator = (p as unknown as { faqQuestion?: string })
          .faqQuestion;
        if (!locator) {
          skipped.push({
            target: t,
            reason: "missing faqQuestion locator on patch — can't revert",
          });
          continue;
        }
        const idx = faq.findIndex((f) => (f.question as string) === locator);
        if (idx < 0) {
          skipped.push({
            target: t,
            reason: `faq "${locator}" no longer in list — can't revert per-field change`,
          });
          continue;
        }
        const item = { ...faq[idx] };
        setOrDelete(item, field, prev);
        faq[idx] = item;
      }
      // ----- Testimonials array (add/remove) -----
      else if (
        t === "content.testimonials.add" ||
        t === "content.testimonials.remove"
      ) {
        if (Array.isArray(prev)) {
          testimonials.length = 0;
          testimonials.push(...(prev as Record<string, unknown>[]));
        } else if (prev === undefined) {
          testimonials.length = 0;
        } else {
          skipped.push({
            target: t,
            reason: "previousValue not an array — can't revert",
          });
          continue;
        }
      }
      // ----- Per-testimonial field updates (locate by testimonialName) -----
      else if (t.startsWith("content.testimonials.")) {
        const field = t.slice("content.testimonials.".length);
        const locator = (p as unknown as { testimonialName?: string })
          .testimonialName;
        if (!locator) {
          skipped.push({
            target: t,
            reason:
              "missing testimonialName locator on patch — can't revert",
          });
          continue;
        }
        const idx = testimonials.findIndex(
          (tt) => (tt.name as string) === locator,
        );
        if (idx < 0) {
          skipped.push({
            target: t,
            reason: `testimonial "${locator}" no longer in list — can't revert per-field change`,
          });
          continue;
        }
        const item = { ...testimonials[idx] };
        setOrDelete(item, field, prev);
        testimonials[idx] = item;
      }
      // ----- Unknown target (would only happen if SAFE_PATCH_TARGETS
      //       added a new entry without revert support) -----
      else {
        skipped.push({
          target: t,
          reason: `unknown target — revert not implemented`,
        });
        continue;
      }
      revertedCount++;
    } catch (e) {
      skipped.push({
        target: t,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (revertedCount === 0) {
    return {
      ok: false,
      reason:
        "Couldn't revert any patches" +
        (skipped.length > 0
          ? `: ${skipped.map((s) => `${s.target} (${s.reason})`).join("; ")}`
          : ""),
    };
  }

  // Re-assemble + commit.
  content.business = business;
  content.trust = trust;
  content.services = services;
  content.faq = faq;
  content.testimonials = testimonials;
  content.offers = offers;
  const merged: OnboardingData = {
    ...baseData,
    branding,
    content,
  };

  await updateProspectOnboarding(args.prospect.pageId, {
    data: merged as Parameters<typeof updateProspectOnboarding>[1]["data"],
  });

  return { ok: true, revertedCount, skipped };
}
