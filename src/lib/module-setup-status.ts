// Per-module "is the customer's setup complete?" predicate.
//
// Single source of truth for whether a module needs setup. Used by
// BOTH the onboarding Hub Step 3 (gates the mark-done button) AND
// the post-launch dashboard ModulesEditor (drives the Set up
// button next to active-but-not-yet-configured modules).
//
// Returns true for modules that need no customer-side setup at
// all (Enquiry Form, Offers — those just appear on the site or
// in a composer once activated) so the dashboard never asks the
// customer to "set up" something there's nothing to set up.
//
// Lives outside the React components so server routes can call it
// too (e.g. the admin module-change endpoint when deciding whether
// to include a setup link in the customer's confirmation email).

/** Subset of onboardingData.tools we care about for setup-status.
 *  Loose typing because Notion can hand us anything in that JSON
 *  blob — the readers below all defensively narrow before use.
 *
 *  Field names MUST match what Step3Modules persists via
 *  savePartial — see the patch object in handleSave / handleDone:
 *    - resendInvitedMe   (NOT resendManagerInvited)
 *    - gbpManagerInvited (this one's a happy match)
 *    - calcomBookingUrl
 */
export type ToolsSlice = {
  calcomBookingUrl?: unknown;
  resendSignupEmail?: unknown;
  resendInvitedMe?: unknown;
  gbpUrl?: unknown;
  gbpManagerInvited?: unknown;
};

/** Modules with no customer-side setup task — they activate the
 *  moment they're billed for. */
const NO_SETUP_REQUIRED = new Set<string>(["Enquiry Form", "Offers"]);

/**
 * True if the customer has fully configured the named module.
 * Returns true for modules that require no setup at all.
 *
 * Definition of "complete" per module (matches Step3Modules
 * Hub logic 1:1 — keep in sync):
 *   - Online Booking → calcomBookingUrl is a valid Cal.com URL
 *     pointing at /<user>/<event-slug>
 *   - Newsletter → resendSignupEmail present AND
 *     resendManagerInvited === true
 *   - GBP → gbpUrl present AND gbpManagerInvited === true
 *   - Enquiry Form, Offers → always true (no setup needed)
 */
export function isModuleSetupComplete(
  moduleName: string,
  tools: ToolsSlice | undefined,
): boolean {
  if (NO_SETUP_REQUIRED.has(moduleName)) return true;
  const t = tools ?? {};
  switch (moduleName) {
    case "Online Booking":
      return isValidCalcomUrl(asString(t.calcomBookingUrl));
    case "Newsletter":
      return asString(t.resendSignupEmail).length > 0 &&
        t.resendInvitedMe === true;
    case "Google Business Profile Setup/Audit":
      return asString(t.gbpUrl).length > 0 &&
        t.gbpManagerInvited === true;
    default:
      // Unknown module name — be generous; the dashboard won't
      // show a Set-up button for a module it doesn't recognise.
      return true;
  }
}

/** Read the onboardingData.tools slice safely. Returns an empty
 *  object when the prospect has no tools captured yet (e.g. they
 *  added their first module just now). */
export function readToolsSlice(onboardingData: unknown): ToolsSlice {
  if (!onboardingData || typeof onboardingData !== "object") return {};
  const data = onboardingData as { tools?: unknown };
  if (!data.tools || typeof data.tools !== "object") return {};
  return data.tools as ToolsSlice;
}

// ---------- internals ----------

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Same validation as Step3Modules calcomStatus — accept cal.com
 *  + cal.eu (EU instance), require /username/event-slug not just
 *  /username (the profile page lists event types, doesn't embed). */
function isValidCalcomUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const hostnameOk =
      parsed.hostname === "cal.com" ||
      parsed.hostname === "cal.eu" ||
      parsed.hostname === "www.cal.com" ||
      parsed.hostname === "www.cal.eu" ||
      parsed.hostname.endsWith(".cal.com") ||
      parsed.hostname.endsWith(".cal.eu");
    const segments = parsed.pathname.split("/").filter(Boolean);
    return hostnameOk && segments.length >= 2;
  } catch {
    return false;
  }
}
