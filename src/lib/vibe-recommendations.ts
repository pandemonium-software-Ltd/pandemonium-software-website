// Maps the Phase 1 businessType selection to the vibe that fits
// most customers in that category, plus the design features +
// "best for" copy that the hover overlay surfaces on the homepage
// gallery and the intake-form vibe picker.
//
// Treat the recommendation as a nudge, never a lock-in: the picker
// pre-highlights the recommended option but the customer can pick
// any of the four. Useful when:
//   - A builder visits the homepage and sees "Traditional" subtly
//     pitched as the obvious choice for them
//   - A photographer's intake form pre-recommends "Premium" so
//     they don't have to read four taglines to decide
//
// Mapping methodology (May 2026 audit, see /docs and recent
// session transcript): each of the 26 BUSINESS_TYPE_OPTIONS entries
// in schemas.ts was scored against modern / traditional / premium /
// friendly on three axes — trust signal (heritage vs. fresh),
// formality (formal vs. casual), and content density (text-forward
// vs. visual-forward). The winning vibe is whichever serves the
// largest share of customers in that category.
//
// Visual-portfolio businesses (restaurant, wedding, event planner)
// fall back to Premium today — a known shortfall. A future
// "Showcase" vibe with a photo-forward layout is on the roadmap;
// when it lands, swap those rows here in one go.

import type { Vibe } from "@/components/VibePreview";

/** Source of truth — must stay in sync with the keys in
 *  BUSINESS_TYPE_OPTIONS in schemas.ts. TypeScript can't enforce
 *  the relationship without circular imports, so the included unit
 *  test fails loudly if a businessType is added without a vibe
 *  recommendation here (or vice versa). */
export const VIBE_BY_BUSINESS_TYPE: Record<string, Vibe> = {
  // Trades — local sole traders. Friendly serves the majority;
  // established trades + craft heritage trades lean traditional.
  Plumber: "friendly",
  Electrician: "friendly",
  "Heating engineer": "friendly",
  Roofer: "traditional",
  Builder: "traditional",
  "Painter / Decorator": "friendly",
  "Joiner / Carpenter": "traditional",
  "Tiler / Plasterer": "modern",
  "Gardener / Landscaper": "friendly",
  Handyman: "friendly",
  Locksmith: "modern",
  "Tree surgeon": "friendly",
  Cleaner: "friendly",
  // Visual + creative — Premium leads on text-forward portfolio
  // businesses today (Photographer); the three "visual-portfolio"
  // shortfalls (Restaurant, Wedding supplier, Event planner) also
  // route to Premium pending the Showcase vibe.
  Photographer: "premium",
  "Wedding supplier": "premium",
  "Event planner": "premium",
  Restaurant: "premium",
  // Wellness + personal — Premium for higher-fee professionals,
  // Friendly for community-facing.
  Therapist: "premium",
  Salon: "premium",
  "Personal trainer / Yoga instructor": "friendly",
  "Pet services": "friendly",
  // Professional services — heritage credentials beat contemporary.
  "Accountant / Consultant": "traditional",
  Solicitor: "traditional",
  Tutor: "traditional",
  // Retail — depends what they sell; modern reads as the default
  // for an online-shop-adjacent feel.
  Retail: "modern",
  // Catch-all — modern is the safest neutral.
  Other: "modern",
};

/** "Best for…" short copy shown in the hover overlay. Keep each
 *  list under ~8 examples — the goal is "you'll recognise yourself
 *  here", not a comprehensive catalogue. */
export const VIBE_BEST_FOR: Record<Vibe, string[]> = {
  modern: [
    "Locksmiths",
    "Tilers / Plasterers",
    "Retail",
    "Cleaners (newer firms)",
    "Anyone wanting a neutral, contemporary look",
  ],
  traditional: [
    "Builders + Roofers",
    "Joiners + Carpenters",
    "Accountants + Solicitors",
    "Tutors",
    "Any business with years of history to lean on",
  ],
  premium: [
    "Photographers",
    "Therapists + Salons",
    "Wedding suppliers",
    "Event planners",
    "Restaurants (where the look is the product)",
  ],
  friendly: [
    "Plumbers, Electricians, Heating engineers",
    "Painters / Decorators",
    "Gardeners + Tree surgeons",
    "Handymen",
    "Personal trainers, Yoga, Pet services",
  ],
};

/** Design feature bullets shown in the hover overlay. These are the
 *  short typography + layout claims that the vibe makes — same
 *  facts as the [data-vibe="..."] CSS in
 *  customer-site-template/src/app/globals.css. Mirror any changes
 *  there here. */
export const VIBE_FEATURES: Record<Vibe, string[]> = {
  modern: [
    "Geist sans throughout (clean contemporary)",
    "Pill-shaped buttons + rounded cards",
    "Full-bleed hero photo with text overlaid",
    "Generous whitespace, tight headings",
  ],
  traditional: [
    "Playfair Display headings + Lora body",
    "Sharp corners, classical button shapes",
    "Heavier heading weight (set-in-print feel)",
    "Slightly tighter rhythm — reads like print",
  ],
  premium: [
    "Cormorant Garamond display + Inter body",
    "Light heading weights, airy spacing",
    "Near-square corners, minimal radii",
    "Generous section padding — editorial feel",
  ],
  friendly: [
    "Nunito throughout (rounded humanist sans)",
    "Pill buttons, large-radius rounded cards",
    "Bold heading weight, friendly proportions",
    "Warm and approachable spacing",
  ],
};

/** Pick the recommended vibe for a given businessType. Defaults to
 *  "modern" when the businessType is missing or unknown (e.g. the
 *  customer picked "Other" or hasn't reached the picker yet). */
export function recommendedVibeFor(
  businessType: string | undefined,
): Vibe {
  if (!businessType) return "modern";
  return VIBE_BY_BUSINESS_TYPE[businessType] ?? "modern";
}
