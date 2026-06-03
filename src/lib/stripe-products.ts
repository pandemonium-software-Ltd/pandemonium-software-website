// TODO(go-live): Create live price ID mapping and switch by STRIPE_MODE env var
// Stripe product + price IDs — SANDBOX (acct_1TEXIxDbGtXpxoDr).
//
// Created via the Stripe MCP on 2026-05-25 against the sandbox
// account. Every recurring price is in pence with `interval: month`
// and currency: gbp. Module prices match the locked 2026-05-25
// pricing in src/lib/fees.ts — keep these aligned.
//
// One-off charges (setup fees + multi-location £15 × N) are NOT
// pre-created as Prices — they're written as Invoice Items with
// inline amount/description per customer per change. Cleaner than
// pre-creating a price per permutation.
//
// When the live account is set up, create a parallel constants file
// (or fold into a feature flag) and switch by env. Sandbox + live
// have different account IDs and Stripe rejects test keys against
// live products / vice versa, so the wiring is intentionally
// explicit.

/** Map module name (Notion canonical string) → Stripe recurring
 *  price ID for that module's monthly add-on. Multi-location is
 *  absent from this map because it has no monthly fee — it's
 *  invoice-item only. */
export const STRIPE_MODULE_PRICE_IDS: Readonly<Record<string, string>> = {
  "Online Booking": "price_1Tb00pDbGtXpxoDrqdE2CIsY",
  "Enquiry Form": "price_1Tb00qDbGtXpxoDrVrz2cLQb",
  Newsletter: "price_1Tb00qDbGtXpxoDrsvPnbzis",
  Offers: "price_1Tb00rDbGtXpxoDrckAloJKu",
  "Google Business Profile Setup/Audit":
    "price_1Tb00rDbGtXpxoDrQHNik0aR",
};

/** Base subscription price IDs — Standard for the normal flow,
 *  Founding for the locked-rate flow. Exactly one of these lands
 *  on every customer's subscription. */
export const STRIPE_BASE_STANDARD_PRICE_ID =
  "price_1Tb00oDbGtXpxoDrIHCXEMvW";
export const STRIPE_BASE_FOUNDING_PRICE_ID =
  "price_1Tb00pDbGtXpxoDrQbTu6JG9";

/** Product IDs (mostly for reference / debug; runtime code uses
 *  the price IDs above). */
export const STRIPE_PRODUCT_IDS = {
  baseStandard: "prod_UaAKHetKaAjjEC",
  baseFounding: "prod_UaAK1IJlokSwve",
  moduleBooking: "prod_UaALuha2RlfvLq",
  moduleEnquiry: "prod_UaALM0zNSNpbSO",
  moduleNewsletter: "prod_UaALGUfqY0usr9",
  moduleOffers: "prod_UaALenb1RPU8pK",
  moduleGbp: "prod_UaALKyyNtbjVBr",
} as const;
