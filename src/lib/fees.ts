// Pricing calculator — Playbook §3.
//
// Pricing applies to Phase 3 intake submissions. The same numbers
// also drive the public /pricing page calculator, but that calculator
// already lives in src/components/PricingCalculator.tsx (legacy from
// Stage 1) — when those two ever diverge, this module is the source
// of truth for what a prospect actually gets charged.
//
// Locked 2026-05-25 — see ROADMAP "Strategic decisions locked
// 2026-05-25". Module prices are honest-effort: setup roughly
// reflects actual operator time per module (GBP audit 1-3h,
// Newsletter setup 45-90 min, etc.).

export const BASE_SETUP_GBP = 299;
export const BASE_MONTHLY_GBP = 29;

export const MODULE_BOOKING_SETUP_GBP = 19;
export const MODULE_BOOKING_MONTHLY_GBP = 6;

export const MODULE_ENQUIRY_SETUP_GBP = 19;
export const MODULE_ENQUIRY_MONTHLY_GBP = 6;

export const MODULE_NEWSLETTER_SETUP_GBP = 49;
export const MODULE_NEWSLETTER_MONTHLY_GBP = 9;

// Offers module — homepage promotional strip (headline + dates +
// CTA) the customer manages from their dashboard. Lighter touch
// than Newsletter (no per-customer email volume to bill), so
// priced lower. Cowork moderates each offer before it goes live
// to keep claims honest.
export const MODULE_OFFERS_SETUP_GBP = 19;
export const MODULE_OFFERS_MONTHLY_GBP = 6;

export const GBP_ADDON_ONE_OFF_GBP = 59;
// Monthly fee for the GBP module — covers the Google Places API
// cost of refreshing the customer's reviews on their site daily.
// Real cost is ~£0.40/month per customer (5 reviews per refresh,
// 30 refreshes/month at $0.017 each); £3/month gives ~7x margin
// for Google price increases, occasional retries on errors, and
// the Stripe transaction fee. Stops when the monthly subscription
// stops — see the GBP reviews cron in the ops worker.
export const GBP_ADDON_MONTHLY_GBP = 3;

// Multi-location — one-off £15 per extra location. No monthly
// contribution (single subscription regardless of location count).
// Acknowledged under-priced vs the 2-4h of provisioning per
// location; watch-item if customers add 5+ locations and operator
// time becomes a real bottleneck. See ROADMAP watch-items.
export const MODULE_MULTILOCATION_SETUP_GBP = 15;

/** Per-module setup-fee map in pence. Single source of truth —
 *  used by Checkout (stripe.ts), apply-pending.ts, and the
 *  onboarding module-change route. */
export const MODULE_SETUP_PENCE: Readonly<Record<string, number>> = {
  "Online Booking": MODULE_BOOKING_SETUP_GBP * 100,
  "Enquiry Form": MODULE_ENQUIRY_SETUP_GBP * 100,
  Newsletter: MODULE_NEWSLETTER_SETUP_GBP * 100,
  Offers: MODULE_OFFERS_SETUP_GBP * 100,
  "Google Business Profile Setup/Audit": GBP_ADDON_ONE_OFF_GBP * 100,
};

// Founding setup raised £99 → £199 on 2026-06-03 (Ben). Better covers
// onboarding effort for the 3 founding spots; £15/mo 5-yr lock unchanged.
// No founding customers signed yet, so safe. Setup is charged inline
// (Stripe price_data), so no Stripe price needs creating.
export const FOUNDING_MEMBER_SETUP_GBP = 199;
export const FOUNDING_MEMBER_MONTHLY_GBP = 15;

export type ModuleSelection = {
  moduleBooking: boolean;
  moduleEnquiry: boolean;
  moduleNewsletter: boolean;
  moduleOffers: boolean;
  gbpAddon: boolean;
  /** Counter — extra locations beyond the included one. £15 setup
   *  each, no monthly. Default 0. */
  extraLocations: number;
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
  if (selection.moduleOffers) modules.push("Offers");
  if (selection.gbpAddon) modules.push("Google Business Profile Setup/Audit");
  if (selection.extraLocations > 0) modules.push("Multi-location");

  const multiLocationSetup =
    Math.max(0, selection.extraLocations) * MODULE_MULTILOCATION_SETUP_GBP;

  if (foundingMember) {
    return {
      setup:
        FOUNDING_MEMBER_SETUP_GBP +
        (selection.gbpAddon ? GBP_ADDON_ONE_OFF_GBP : 0) +
        multiLocationSetup,
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
  if (selection.moduleOffers) {
    setup += MODULE_OFFERS_SETUP_GBP;
    monthly += MODULE_OFFERS_MONTHLY_GBP;
  }
  if (selection.gbpAddon) {
    setup += GBP_ADDON_ONE_OFF_GBP;
    monthly += GBP_ADDON_MONTHLY_GBP;
  }
  setup += multiLocationSetup;

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
  if (selection.moduleOffers) {
    lines.push(
      "  • Offers (a promotional strip on your homepage — set a headline, dates and CTA from your dashboard)",
    );
  }
  if (selection.gbpAddon) {
    lines.push(
      "  • Google Business Profile setup + live reviews on your site (I'll claim your listing, embed it, and refresh your top reviews automatically)",
    );
  }
  if (selection.extraLocations > 0) {
    const n = selection.extraLocations;
    lines.push(
      `  • Multi-location (${n} extra location${n === 1 ? "" : "s"} provisioned — each gets its own contact / map / opening hours block on the site)`,
    );
  }
  return lines.join("\n");
}
