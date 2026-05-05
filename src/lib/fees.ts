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
      monthly: FOUNDING_MEMBER_MONTHLY_GBP,
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
  }

  return { setup, monthly, founding: false, modules };
}
