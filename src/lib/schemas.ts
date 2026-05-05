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

export const LOGO_STATUS_OPTIONS = [
  "I have a good one",
  "I have an old one",
  "No logo",
  "Need help creating one",
] as const;

export const MODULE_OPTIONS = [
  "Online Booking",
  "Enquiry Form",
  "Newsletter",
  "Google Business Profile Setup/Audit",
] as const;

export const VIBE_OPTIONS = [
  "traditional",
  "modern",
  "premium",
  "friendly",
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
  logoStatus: z.enum(LOGO_STATUS_OPTIONS),
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
  openingHours: z.record(
    z.string(),
    z
      .object({
        open: z.boolean(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .optional(),
  ),
});

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  startingPrice: z.number().nonnegative().optional(),
  featured: z.boolean().default(false),
  icon: z.string().max(10).optional(),
});

const servicesSchema = z.object({
  services: z
    .array(serviceSchema)
    .min(3, "Please add at least 3 services.")
    .max(10, "Template displays up to 10 services."),
  differentiator: z.string().trim().min(1).max(1000),
});

const brandSchema = z.object({
  primaryColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex like #1d3a5f"),
  secondaryColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  vibe: z.enum(VIBE_OPTIONS),
  logoFileName: z.string().max(200).optional(),
});

const moduleSelectionSchema = z.object({
  baseSelected: z.literal(true), // base is always on
  moduleBooking: z.boolean().default(false),
  moduleEnquiry: z.boolean().default(false),
  moduleNewsletter: z.boolean().default(false),
  gbpAddon: z.boolean().default(false),
});

const testimonialSchema = z.object({
  name: z.string().trim().max(100),
  location: z.string().trim().max(100),
  quote: z.string().trim().max(500),
});

const socialProofSchema = z.object({
  testimonials: z.array(testimonialSchema).max(3).default([]),
  associations: z.string().trim().max(500).optional(),
  yearsExperience: z.number().int().min(0).max(100).optional(),
  awards: z.string().trim().max(500).optional(),
});

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
  marketingConsent: z.boolean().default(false),
});

export const phase3Schema = z.object({
  businessBasics: businessBasicsSchema,
  contactDetails: contactDetailsSchema,
  services: servicesSchema,
  brand: brandSchema,
  modules: moduleSelectionSchema,
  socialProof: socialProofSchema,
  legal: legalComplianceSchema,
});

// Partial intake schema - allows section-by-section saves
export const phase3PartialSchema = z.object({
  businessBasics: businessBasicsSchema.partial().optional(),
  contactDetails: contactDetailsSchema.partial().optional(),
  services: servicesSchema.partial().optional(),
  brand: brandSchema.partial().optional(),
  modules: moduleSelectionSchema.partial().optional(),
  socialProof: socialProofSchema.partial().optional(),
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
