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

export type ApplyResult =
  | {
      ok: true;
      target: SafeTarget;
      previousValue: unknown;
      newValue: string;
    }
  | { ok: false; reason: string };

/**
 * Apply a single patch to the prospect's onboarding data. Returns
 * { ok: false, reason } on any failure (target out of whitelist,
 * onboardingData unparseable, schema rejected, Notion write failed).
 *
 * Idempotent in the sense that calling twice with the same patch
 * is safe (second call writes the same value); but the
 * previousValue returned by the second call would be the first
 * call's newValue, so callers should only stamp the audit log
 * once per logical apply.
 */
export async function applyChangeRequestPatch(args: {
  prospect: ProspectRecord;
  target: SafeTarget;
  newValue: string;
}): Promise<ApplyResult> {
  if (!(SAFE_PATCH_TARGETS as readonly string[]).includes(args.target)) {
    return {
      ok: false,
      reason: `Target '${args.target}' not in safe whitelist`,
    };
  }
  const parsed = onboardingDataSchema.safeParse(
    args.prospect.onboardingData ?? {},
  );
  const baseData: OnboardingData = parsed.success ? parsed.data : {};

  // Targets follow "section.field" — content.{tagline,aboutBlurb}
  // and content.business.{contactName,phoneDisplay,publicEmail,
  // address,serviceArea}. Same shape as the customer-edited
  // values in Step 4 Site Content.
  const content = ((baseData.content ?? {}) as Record<string, unknown>);
  let previousValue: unknown;

  if (args.target === "copy.tagline") {
    previousValue = content.tagline ?? undefined;
    content.tagline = args.newValue;
  } else if (args.target === "copy.aboutBlurb") {
    previousValue = content.aboutBlurb ?? undefined;
    content.aboutBlurb = args.newValue;
  } else if (args.target.startsWith("business.")) {
    const field = args.target.slice("business.".length);
    const business = ((content.business ?? {}) as Record<string, unknown>);
    previousValue = business[field] ?? undefined;
    business[field] = args.newValue;
    content.business = business;
  } else {
    return {
      ok: false,
      reason: `Target '${args.target}' has no apply handler (whitelist drift?)`,
    };
  }

  const newData: OnboardingData = {
    ...baseData,
    content: content as OnboardingData["content"],
  };

  // Re-validate the section we changed. If the schema rejects
  // (e.g. tagline > 200 chars), abort the write — the old value
  // stays in Notion and the caller escalates to Ben.
  const reparsed = onboardingDataSchema.safeParse(newData);
  if (!reparsed.success) {
    return {
      ok: false,
      reason: `Schema rejected new value: ${
        reparsed.error.issues[0]?.message ?? "unknown"
      }`,
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

  return {
    ok: true,
    target: args.target,
    previousValue,
    newValue: args.newValue,
  };
}
