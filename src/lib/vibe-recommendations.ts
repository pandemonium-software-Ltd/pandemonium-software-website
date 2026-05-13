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
import type { Structure } from "@/lib/site-generator/types";

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

// ============================================================
// Structure axis — layout / hero / section emphasis
// ============================================================
//
// Same audit methodology as the style axis but on a different
// dimension: what page SHAPE does this business need?
//
//   services   — text + photo hero, services grid prominent.
//                Default for businesses where "what we do" is the
//                value proposition.
//   showcase   — full-bleed gallery hero, photos lead. For
//                visual-portfolio businesses where the work IS
//                the product.
//   booking    — Cal.com embed prominent in hero. For
//                appointment-driven businesses.
//   editorial  — long-form text + portrait hero, credentials lead.
//                For consultancy / thought-leadership / regulated
//                professions where trust + qualifications sell.

/** Source of truth — every BUSINESS_TYPE_OPTIONS entry maps to
 *  a structure. Coverage is enforced by the same unit test that
 *  guards VIBE_BY_BUSINESS_TYPE. */
export const STRUCTURE_BY_BUSINESS_TYPE: Record<string, Structure> = {
  // Trades — most are services-first; visual trades (carpentry,
  // gardening, decorating) lean showcase because portfolio sells.
  Plumber: "services",
  Electrician: "services",
  "Heating engineer": "services",
  Roofer: "services",
  Builder: "services",
  "Painter / Decorator": "showcase",
  "Joiner / Carpenter": "showcase",
  "Tiler / Plasterer": "showcase",
  "Gardener / Landscaper": "showcase",
  Handyman: "services",
  Locksmith: "services",
  "Tree surgeon": "services",
  Cleaner: "services",
  // Visual + creative — full Showcase territory.
  Photographer: "showcase",
  "Wedding supplier": "showcase",
  "Event planner": "showcase",
  Restaurant: "showcase",
  // Appointment-driven — Booking structure leads with the calendar.
  Therapist: "booking",
  Salon: "booking",
  "Personal trainer / Yoga instructor": "booking",
  "Pet services": "booking",
  // Credentialed / advisory — Editorial leads with the founder's
  // story + qualifications.
  "Accountant / Consultant": "editorial",
  Solicitor: "editorial",
  Tutor: "editorial",
  // Retail — Showcase because product photos sell, even if it's a
  // brick-and-mortar shop with no e-commerce.
  Retail: "showcase",
  // Catch-all.
  Other: "services",
};

/** Plain-English summary of each structure for hover overlays and
 *  copy. Mirror of VIBE_BEST_FOR but for the layout axis. */
export const STRUCTURE_BEST_FOR: Record<Structure, string[]> = {
  services: [
    "Plumbers, Electricians, Heating engineers",
    "Roofers + Builders",
    "Handymen + Locksmiths + Tree surgeons",
    "Cleaners",
    "Any business where 'what we do' sells the work",
  ],
  showcase: [
    "Photographers + Wedding suppliers",
    "Event planners + Restaurants",
    "Painters / Decorators, Joiners",
    "Gardeners / Landscapers",
    "Retail (product photos lead)",
  ],
  booking: [
    "Therapists + Salons",
    "Personal trainers + Yoga instructors",
    "Pet services",
    "Anyone where the booking calendar IS the call to action",
  ],
  editorial: [
    "Accountants + Consultants",
    "Solicitors",
    "Tutors",
    "Any credentialed profession where the founder's story sells",
  ],
};

/** Design feature bullets per structure — paired with
 *  VIBE_FEATURES (style) in the hover overlay so customers can
 *  see what each axis actually changes. */
export const STRUCTURE_FEATURES: Record<Structure, string[]> = {
  services: [
    "Text + photo hero (your tagline leads)",
    "Services grid prominent, 3-up cards",
    "About / FAQ / testimonials beneath",
    "Default — most ModuForge customers pick this",
  ],
  showcase: [
    "Full-bleed gallery hero (your work leads)",
    "Photos dominate; copy is supporting",
    "Services as smaller cards underneath",
    "Best when your work needs to be SEEN, not described",
  ],
  booking: [
    "Cal.com booking widget embedded in hero",
    "Services framed as bookable items",
    "Calendar + location prominent throughout",
    "Best when 'book now' is the primary visitor action",
  ],
  editorial: [
    "Long-form text + portrait photo hero",
    "Credentials + trust signals lead",
    "Services as a refined list, not a grid",
    "Best for advisory / regulated professions",
  ],
};

/** Pick the recommended structure for a given businessType.
 *  Defaults to "services" when the businessType is missing or
 *  unknown — the safest baseline. */
export function recommendedStructureFor(
  businessType: string | undefined,
): Structure {
  if (!businessType) return "services";
  return STRUCTURE_BY_BUSINESS_TYPE[businessType] ?? "services";
}
