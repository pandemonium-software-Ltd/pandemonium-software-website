// Zod schemas for the three intake phases + shared option lists.
//
// These schemas are the single source of truth for:
// - Form field types (react-hook-form + zodResolver)
// - API request validation (route handlers)
// - Notion record shape (when serialising/deserialising JSON blobs)

import { z } from "zod";

// ---------- Shared option lists ----------

export const BUSINESS_TYPE_OPTIONS = [
  "Plumber",
  "Electrician",
  "Heating engineer",
  "Roofer",
  "Builder",
  "Painter / Decorator",
  "Joiner / Carpenter",
  "Tiler / Plasterer",
  "Gardener / Landscaper",
  "Handyman",
  "Locksmith",
  "Tree surgeon",
  "Photographer",
  "Therapist",
  "Personal trainer / Yoga instructor",
  "Salon",
  "Accountant / Consultant",
  "Solicitor",
  "Restaurant",
  "Retail",
  "Wedding supplier",
  "Pet services",
  "Tutor",
  "Cleaner",
  "Event planner",
  "Other",
] as const;

export const WEBSITE_SITUATION_OPTIONS = [
  "I don't have a website yet",
  "I have an old website I don't maintain",
  "I have a website but I don't own it / can't update it",
  "I have a decent website but want something better",
  "Not sure",
] as const;

export const ACQUISITION_OPTIONS = [
  "Checkatrade",
  "Rated People",
  "MyBuilder",
  "Yell",
  "Google Ads",
  "Facebook Ads",
  "Word of mouth",
  "Other",
  "Nothing",
] as const;

export const ENQUIRY_VOLUME_OPTIONS = [
  "0-5",
  "6-15",
  "16-30",
  "31-50",
  "50+",
] as const;

export const BOOKING_HANDLING_OPTIONS = [
  "Phone only",
  "Email only",
  "WhatsApp",
  "Paper diary",
  "Digital calendar",
  "Custom system",
  "Nothing formal",
] as const;

export const GBP_STATUS_OPTIONS = [
  "Yes and up to date",
  "Yes but neglected",
  "No, I don't have one",
  "Not sure what that is",
] as const;

// LOGO_STATUS_OPTIONS removed: logo capture moved out of Phase 2
// qualification entirely. Customer-supplied logos live in Phase 4
// onboarding Step 4 (brand assets, R2 upload). Compatibility engine
// doesn't gate on logo status, so asking in Phase 2 was redundant
// + confused prospects. ModuForge does NOT supply logos — if a
// prospect doesn't have one, they source it themselves (Canva,
// Fiverr etc.) before completing Step 4. See
// src/components/onboarding/Step4Assets.tsx for the explainer.

export const MODULE_OPTIONS = [
  "Online Booking",
  "Enquiry Form",
  "Newsletter",
  "Offers",
  "Google Business Profile Setup/Audit",
  "Multi-location",
] as const;

/** Style axis — typography + corner radii + heading weight.
 *  Driven by globals.css [data-vibe="..."] rules on the customer-
 *  site. Unrelated to layout (see STRUCTURE_OPTIONS below). */
export const VIBE_OPTIONS = [
  "traditional",
  "modern",
  "premium",
  "friendly",
] as const;

/** Structure axis — page layout, hero shape, section emphasis.
 *  Picked by businessType (some businesses NEED photos in the
 *  hero, others NEED a booking widget, etc.). Drives a switch in
 *  customer-site-template/src/app/page.tsx that selects which
 *  hero component renders + which body-section emphasis applies.
 *
 *    "services"   — text + photo hero, services grid prominent.
 *                   Trades + professional services baseline.
 *    "showcase"   — full-bleed gallery hero, services as cards
 *                   beneath, gallery dominant. For visual-product
 *                   businesses where photos sell the work.
 *    "booking"    — Cal.com embed prominent in hero, services as
 *                   a "bookable items" list. For appointment-
 *                   driven businesses.
 *    "editorial"  — long-form text hero + portrait, credentials
 *                   + trust signals lead. For consultancy /
 *                   thought-leadership.
 */
export const STRUCTURE_OPTIONS = [
  "services",
  "showcase",
  "booking",
  "editorial",
] as const;

// ---------- Phase 1: Initial Enquiry ----------

export const phase1Schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell me your name.")
    .max(100, "Name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "I need an email address to reply to.")
    .email("That doesn't look like a valid email address.")
    .max(254),
  phone: z
    .string()
    .trim()
    .min(1, "Please give me a number I can ring if email bounces.")
    .max(30)
    .regex(
      /^[+\d\s()-]+$/,
      "Phone numbers can have digits, spaces, +, -, and brackets only.",
    ),
  business: z
    .string()
    .trim()
    .min(1, "Please tell me your business name.")
    .max(100),
  businessType: z.enum(BUSINESS_TYPE_OPTIONS, {
    errorMap: () => ({ message: "Pick the closest match for your business." }),
  }),
  location: z
    .string()
    .trim()
    .min(1, "Where in the UK are you? Town or county is fine.")
    .max(100),
  websiteSituation: z.enum(WEBSITE_SITUATION_OPTIONS, {
    errorMap: () => ({ message: "Pick whichever fits best." }),
  }),
});

export type Phase1Data = z.infer<typeof phase1Schema>;

// ---------- Phase 2: Qualification ----------

export const phase2Schema = z.object({
  acquisitionMethod: z.enum(ACQUISITION_OPTIONS),
  acquisitionMonthlyCost: z
    .number()
    .min(0, "Cost can't be negative.")
    .max(100_000, "That's a lot - check the figure."),
  enquiryVolume: z.enum(ENQUIRY_VOLUME_OPTIONS),
  bookingHandling: z.enum(BOOKING_HANDLING_OPTIONS),
  gbpStatus: z.enum(GBP_STATUS_OPTIONS),
  brandColour: z.string().max(20).optional(),
  brandColourUnsure: z.boolean().optional(),
  modulesInterest: z.array(z.enum(MODULE_OPTIONS)).default([]),
  specificFeatures: z.string().trim().max(2000).optional(),
  dealBreakers: z.string().trim().max(2000).optional(),
  goLiveDate: z.string().min(1, "Please pick a target go-live date."),
});

export type Phase2Data = z.infer<typeof phase2Schema>;

// ---------- Phase 3: Full Intake (8 sections) ----------

const businessBasicsSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradingName: z.string().trim().max(200).optional(),
  legalForm: z.enum(["Sole trader", "Limited company", "Partnership", "Other"]),
  companiesHouseNumber: z.string().trim().max(20).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  yearEstablished: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1)
    .optional(),
  elevatorPitch: z.string().trim().min(1).max(280),
});

const contactDetailsSchema = z.object({
  contactName: z.string().trim().min(1).max(100),
  phoneDisplay: z.string().trim().min(1).max(30),
  phoneTel: z.string().trim().min(1).max(30),
  publicEmail: z.string().trim().email().max(254),
  address: z.string().trim().min(1).max(500),
  serviceArea: z.string().trim().min(1).max(500),
  // openingHours removed from Phase 3 intake 2026-05-14 — the per-day
  // grid was a tedious filler at intake time. Hours are now captured
  // exclusively in the Onboarding Hub (Step 4 Content) where they
  // also drive the live customer site's JSON-LD + opening-hours
  // strip. See src/components/onboarding/Step4Content.tsx for the
  // canonical capture.
});

// serviceSchema + servicesSchema removed from Phase 3 intake 2026-05-14.
// Services are now captured exclusively in the Onboarding Hub Step 4
// Content step, where they have richer fields (longDescription,
// features list, pricing notes, per-service photos) anyway. The
// adapter (src/lib/site-generator/adapter.ts) already preferred the
// Hub Content version as canonical; removing the Phase 3 leg makes
// that explicit.
//
// Operator scope-check is preserved via Phase 2 compatibility rules
// (SB2: more than 10 services; HB6: features outside template).
//
// `differentiator` (formerly a required free-text alongside services)
// was unused on the live customer site — its only consumer was the
// Hub Step 4 aboutBlurb seeding, which now starts blank for new
// customers (legacy customers still have it in their phase3Data JSON
// blob, so back-compat seeding remains intact).

const brandSchema = z.object({
  primaryColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex like #1d3a5f"),
  secondaryColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  vibe: z.enum(VIBE_OPTIONS),
  /** Page layout structure — added 2026-05-13. Existing customers
   *  with no structure default to "services" via the adapter, so
   *  the field is optional in the schema (back-compat). New
   *  intakes set it explicitly. */
  structure: z.enum(STRUCTURE_OPTIONS).optional(),
  // logoFileName intentionally removed 2026-05-14: the actual logo
  // upload happens in Onboarding Hub Step 4 after payment, so asking
  // for the filename at intake-time was redundant noise. The Hub
  // captures both the file and its display metadata.
});

const moduleSelectionSchema = z.object({
  baseSelected: z.literal(true), // base is always on
  moduleBooking: z.boolean().default(false),
  moduleEnquiry: z.boolean().default(false),
  moduleNewsletter: z.boolean().default(false),
  moduleOffers: z.boolean().default(false),
  gbpAddon: z.boolean().default(false),
  // Multi-location is a counter (extra locations beyond the
  // included one), £15 setup each, no monthly. Defaults to 0.
  extraLocations: z
    .number()
    .int()
    .min(0, "Extra locations can't be negative.")
    .max(50, "That's a lot of locations — get in touch directly.")
    .default(0),
});

// socialProofSchema + testimonialSchema removed 2026-05-14: customer
// testimonials + accreditations are captured in the Onboarding Hub
// (Step 6 Content) where they end up on the live site anyway. Asking
// at intake-time was redundant — operator never used the Phase 3
// values directly because Hub data took precedence.

const legalComplianceSchema = z.object({
  isDataController: z.literal(true, {
    errorMap: () => ({
      message: "You need to confirm you're the data controller for your site.",
    }),
  }),
  acceptsTerms: z.literal(true, {
    errorMap: () => ({
      message: "You need to accept the Terms of Service to proceed.",
    }),
  }),
  // Refund + cancellation surfaced as a separate explicit checkbox
  // (added 2026-05-14). T&Cs already cover these terms by reference,
  // but small-print acknowledgement is easy to miss — putting it on
  // its own line gives customers a clear "I saw this" moment + makes
  // it easier to demonstrate informed acceptance if disputed.
  acceptsRefundCancellation: z.literal(true, {
    errorMap: () => ({
      message:
        "You need to accept the refund and cancellation terms to proceed.",
    }),
  }),
  marketingConsent: z.boolean().default(false),
});

export const phase3Schema = z.object({
  businessBasics: businessBasicsSchema,
  contactDetails: contactDetailsSchema,
  brand: brandSchema,
  modules: moduleSelectionSchema,
  legal: legalComplianceSchema,
});

// Partial intake schema - allows section-by-section saves
export const phase3PartialSchema = z.object({
  businessBasics: businessBasicsSchema.partial().optional(),
  contactDetails: contactDetailsSchema.partial().optional(),
  brand: brandSchema.partial().optional(),
  modules: moduleSelectionSchema.partial().optional(),
  legal: legalComplianceSchema.partial().optional(),
});

export type Phase3Data = z.infer<typeof phase3Schema>;
export type Phase3Partial = z.infer<typeof phase3PartialSchema>;

// ---------- Compatibility outcome ----------

export const compatibilityOutcomeSchema = z.object({
  outcome: z.enum([
    "accept",
    "soft_reject",
    "flag_for_review",
    "clarification_needed",
  ]),
  reasoning: z.string(),
  hardBlockerTriggered: z.string().optional(),
  softBlockersTriggered: z.array(z.string()).default([]),
});

export type CompatibilityOutcome = z.infer<typeof compatibilityOutcomeSchema>;
