// Pricing calculator — Playbook §3.
//
// Pricing applies to Phase 3 intake submissions. The same numbers
// also drive the public /pricing page calculator, but that calculator
// already lives in src/components/PricingCalculator.tsx (legacy from
// Stage 1) — when those two ever diverge, this module is the source
// of truth for what a prospect actually gets charged.

export const BASE_SETUP_GBP = 129;
export const BASE_MONTHLY_GBP = 19;

export const MODULE_BOOKING_SETUP_GBP = 39;
export const MODULE_BOOKING_MONTHLY_GBP = 4;

export const MODULE_ENQUIRY_SETUP_GBP = 39;
export const MODULE_ENQUIRY_MONTHLY_GBP = 4;

export const MODULE_NEWSLETTER_SETUP_GBP = 39;
export const MODULE_NEWSLETTER_MONTHLY_GBP = 6;

export const GBP_ADDON_ONE_OFF_GBP = 29;
// Monthly fee for the GBP module — covers the Google Places API
// cost of refreshing the customer's reviews on their site daily.
// Real cost is ~£0.40/month per customer (5 reviews per refresh,
// 30 refreshes/month at $0.017 each); £2/month gives ~5x margin
// for Google price increases, occasional retries on errors, and
// the Stripe transaction fee. Stops when the monthly subscription
// stops — see the GBP reviews cron in the ops worker.
export const GBP_ADDON_MONTHLY_GBP = 2;

export const FOUNDING_MEMBER_SETUP_GBP = 99;
export const FOUNDING_MEMBER_MONTHLY_GBP = 15;

export type ModuleSelection = {
  moduleBooking: boolean;
  moduleEnquiry: boolean;
  moduleNewsletter: boolean;
  gbpAddon: boolean;
};

export type FeeBreakdown = {
  setup: number;
  monthly: number;
  founding: boolean;
  modules: string[]; // names of selected modules for the Notion record
};

/**
 * Calculate setup + monthly fees from a module selection.
 *
 * `foundingMember` overrides the standard pricing with the flat
 * Founding Member rate (£99 setup + £15/mo, all features included).
 * Whether a prospect qualifies as a Founding Member is decided by
 * Ben — this function just applies the rate when told to.
 */
export function calculateFees(
  selection: ModuleSelection,
  foundingMember = false,
): FeeBreakdown {
  const modules: string[] = [];
  if (selection.moduleBooking) modules.push("Online Booking");
  if (selection.moduleEnquiry) modules.push("Enquiry Form");
  if (selection.moduleNewsletter) modules.push("Newsletter");
  if (selection.gbpAddon) modules.push("Google Business Profile Setup/Audit");

  if (foundingMember) {
    return {
      setup: FOUNDING_MEMBER_SETUP_GBP + (selection.gbpAddon ? GBP_ADDON_ONE_OFF_GBP : 0),
      // Founding members still pay the GBP monthly when they tick
      // the addon — the API cost we're covering is per-customer
      // not per-tier.
      monthly:
        FOUNDING_MEMBER_MONTHLY_GBP +
        (selection.gbpAddon ? GBP_ADDON_MONTHLY_GBP : 0),
      founding: true,
      modules,
    };
  }

  let setup = BASE_SETUP_GBP;
  let monthly = BASE_MONTHLY_GBP;
  if (selection.moduleBooking) {
    setup += MODULE_BOOKING_SETUP_GBP;
    monthly += MODULE_BOOKING_MONTHLY_GBP;
  }
  if (selection.moduleEnquiry) {
    setup += MODULE_ENQUIRY_SETUP_GBP;
    monthly += MODULE_ENQUIRY_MONTHLY_GBP;
  }
  if (selection.moduleNewsletter) {
    setup += MODULE_NEWSLETTER_SETUP_GBP;
    monthly += MODULE_NEWSLETTER_MONTHLY_GBP;
  }
  if (selection.gbpAddon) {
    setup += GBP_ADDON_ONE_OFF_GBP;
    monthly += GBP_ADDON_MONTHLY_GBP;
  }

  return { setup, monthly, founding: false, modules };
}

/**
 * Build a customer-facing "what you'll get" list for the phase3
 * receipt email. One bullet per included service, with a one-line
 * description so the customer sees exactly what each module
 * unlocks (not just the module name).
 *
 * The leading two-space indent matches the bullet style used
 * elsewhere in our email templates.
 */
export function buildModuleListMarkdown(
  selection: ModuleSelection,
): string {
  const lines: string[] = ["  • Site + hosting"];
  if (selection.moduleBooking) {
    lines.push(
      "  • Online booking (Cal.com integration with your branding)",
    );
  }
  if (selection.moduleEnquiry) {
    lines.push(
      "  • Enquiry form (emails hit your inbox without exposing your address)",
    );
  }
  if (selection.moduleNewsletter) {
    lines.push(
      "  • Newsletter (send up to 1000 emails/month from name@yourdomain)",
    );
  }
  if (selection.gbpAddon) {
    lines.push(
      "  • Google Business Profile setup + live reviews on your site (I'll claim your listing, embed it, and refresh your top reviews automatically)",
    );
  }
  return lines.join("\n");
}
