// Onboarding Hub state model — Stage 2B Phase H1.
//
// The Hub is a 4–5 step self-setup wizard a prospect uses *after*
// payment to provision their hosting account, domain, sender DNS,
// brand assets and final sign-off.
//
// Step list is module-aware. Step 3 (Connect Tools) only shows for
// prospects who bought Online Booking (Cal.com flow) or the GBP
// addon. Everyone else sees a 4-step Hub.
//
// Resend (Newsletter / Enquiry) DNS is intentionally folded into
// Step 2 so DNS records are pasted into Cloudflare once, not twice.
//
// Per-step data is stored as a single JSON blob in Notion's
// "Onboarding Data" rich_text property. Each step has its own zod
// schema to validate partial saves; the top-level schema has every
// step optional so partial state is always valid.

import { z } from "zod";
import type { ProspectRecord, ProspectStatus } from "./notion-prospects";

// ---------- Step identity ----------

export const STEP_IDS = [
  "cloudflare", // 1 — universal
  "domain", // 2 — universal
  "tools", // 3 — only if Booking / Newsletter / Enquiry / GBP module
  "content", // (NEW, between modules + assets in display order) — universal
  "assets", // 4 — universal
  "review", // 5 — universal
] as const;

export type StepId = (typeof STEP_IDS)[number];

// Notion stores per-step done flags as fixed columns. The original
// five (Onboarding Step 1 Done … Step 5 Done) keep their semantic
// meaning — adding the new content step means a new column rather
// than renumbering, so existing prospect records don't need
// migration. Display order is independent (deriveStepList controls
// the customer-facing 1-of-N labels).
//
// Mapping:
//   1 → cloudflare   (Onboarding Step 1 Done)
//   2 → domain       (Onboarding Step 2 Done)
//   3 → tools        (Onboarding Step 3 Done)
//   4 → assets       (Onboarding Step 4 Done)
//   5 → review       (Onboarding Step 5 Done)
//   6 → content      (Onboarding Step 6 Done — NEW)
export const STEP_NUMBER: Record<StepId, 1 | 2 | 3 | 4 | 5 | 6> = {
  cloudflare: 1,
  domain: 2,
  tools: 3,
  assets: 4,
  review: 5,
  content: 6,
};

export type StepDef = {
  id: StepId;
  /** Notion checkbox column number (1-6, never reassigned). */
  notionStep: 1 | 2 | 3 | 4 | 5 | 6;
  /** Display number (1..N where N = applicable step count). */
  displayIndex: number;
  /** Total applicable steps for this prospect (e.g. "step 2 of 4"). */
  displayTotal: number;
  title: string;
  shortBlurb: string;
  applicable: boolean;
};

// ---------- Status gate ----------

const ONBOARDING_UNLOCKED_STATUSES = new Set<ProspectStatus>([
  "Paid",
  "Onboarding Started",
  "Onboarding Complete",
  "Build Started",
  "Live",
]);

/**
 * True when the prospect has paid (or is otherwise past payment) and
 * is allowed to access /onboarding/[token]. Pre-payment prospects
 * see a "your link isn't active yet" page instead of the Hub.
 *
 * Note: this is the VIEW gate. For the MUTATION gate, see
 * `isOnboardingMutable` — once the customer signs off Step 5 the
 * Hub becomes a read-only archive even though it stays viewable.
 */
export function isOnboardingUnlocked(status: string): boolean {
  return ONBOARDING_UNLOCKED_STATUSES.has(status as ProspectStatus);
}

// Statuses where the customer can still mutate Hub data (save
// partials, mark steps done, upload assets, submit review edits).
// Once the customer signs off Step 5 (status flips to Onboarding
// Complete), the Hub becomes a read-only archive — any further
// changes go through the customer dashboard's "Need a change?"
// form and the post-launch monthly allowance (3 requests/month,
// one item per request).
const ONBOARDING_MUTABLE_STATUSES = new Set<ProspectStatus>([
  "Paid",
  "Onboarding Started",
]);

/**
 * True when the customer is allowed to mutate Hub data. False once
 * they've signed off (Onboarding Complete / Build Started / Live /
 * Cancelled). All Hub-mutating API routes guard on this; the UI
 * propagates the inverse (`hubLocked`) into every step's `readOnly`
 * prop so inputs are disabled and Save / Mark Done / Update buttons
 * are hidden once the work is locked in.
 */
export function isOnboardingMutable(status: string): boolean {
  return ONBOARDING_MUTABLE_STATUSES.has(status as ProspectStatus);
}

// ---------- Step list derivation ----------

/**
 * Produces the step list this prospect actually sees. Steps that
 * aren't applicable (e.g. step 3 when they bought no Booking or GBP)
 * are returned with `applicable: false` and excluded from displayTotal.
 *
 * Caller filters to applicable steps before rendering, but the full
 * list is returned so the API layer can sanity-check step IDs.
 */
export function deriveStepList(prospect: ProspectRecord): StepDef[] {
  const modules = new Set(prospect.moduleSelections);
  const hasBooking = modules.has("Online Booking");
  const hasGbpAddon = modules.has("Google Business Profile Setup/Audit");
  const hasNewsletter = modules.has("Newsletter");
  const hasEnquiry = modules.has("Enquiry Form");
  // Step 3 (Modules) shows whenever the customer bought any module
  // beyond the base website. Resend covers both Newsletter and
  // Enquiry Form (single sender domain serves both).
  const step3Applicable =
    hasBooking || hasGbpAddon || hasNewsletter || hasEnquiry;

  // Compose a friendly per-customer short blurb listing what they've
  // got to set up. Order matters: most common first.
  const moduleNames: string[] = [];
  if (hasBooking) moduleNames.push("booking page");
  if (hasNewsletter || hasEnquiry) moduleNames.push("sender email");
  if (hasGbpAddon) moduleNames.push("Google Business Profile");
  const moduleBlurb =
    moduleNames.length === 0
      ? "Set up the modules you bought."
      : moduleNames.length === 1
        ? `Set up your ${moduleNames[0]}.`
        : moduleNames.length === 2
          ? `Set up your ${moduleNames[0]} and ${moduleNames[1]}.`
          : `Set up your ${moduleNames.slice(0, -1).join(", ")} and ${moduleNames[moduleNames.length - 1]}.`;

  const draft: Array<Omit<StepDef, "displayIndex" | "displayTotal">> = [
    {
      id: "cloudflare",
      notionStep: 1,
      title: "Set up Cloudflare",
      shortBlurb: "Create your free hosting account.",
      applicable: true,
    },
    {
      id: "domain",
      notionStep: 2,
      title: "Your domain",
      shortBlurb: "Register or connect your domain.",
      applicable: true,
    },
    {
      id: "tools",
      notionStep: 3,
      title: "Modules",
      shortBlurb: moduleBlurb,
      applicable: step3Applicable,
    },
    {
      id: "content",
      notionStep: 6,
      title: "Site content",
      shortBlurb:
        "Write the about us, services and FAQ — the words that go on your site.",
      applicable: true,
    },
    {
      id: "assets",
      notionStep: 4,
      title: "Brand assets",
      shortBlurb: "Upload your logo and photos.",
      applicable: true,
    },
    {
      id: "review",
      notionStep: 5,
      title: "Review & launch",
      shortBlurb: "Preview the site, request changes, pick a go-live date.",
      applicable: true,
    },
  ];

  const applicableCount = draft.filter((s) => s.applicable).length;
  let cursor = 0;
  return draft.map((s) => ({
    ...s,
    displayIndex: s.applicable ? ++cursor : 0,
    displayTotal: applicableCount,
  }));
}

/**
 * Convenience: which step should the prospect open onto by default?
 * The first applicable step that isn't yet done. Falls back to the
 * last step if everything is ticked.
 */
export function pickInitialStep(
  steps: StepDef[],
  prospect: ProspectRecord,
): StepId {
  const doneFlags: Record<StepId, boolean> = {
    cloudflare: prospect.onboardingStep1Done,
    domain: prospect.onboardingStep2Done,
    tools: prospect.onboardingStep3Done,
    content: prospect.onboardingContentDone,
    assets: prospect.onboardingStep4Done,
    review: prospect.onboardingStep5Done,
  };
  const firstUnfinished = steps.find(
    (s) => s.applicable && !doneFlags[s.id],
  );
  return firstUnfinished?.id ?? "review";
}

// ---------- Per-step zod schemas ----------
//
// All fields optional so partial saves are always valid. The
// "mark this step done" gate runs additional zod validation that
// requires the user-filled fields (per-step required-when-done
// helper below).

const step1CloudflareSchema = z.object({
  cloudflareEmail: z
    .string()
    .trim()
    .max(254)
    .email("That doesn't look like an email address.")
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Step 2 — Domain only. The customer's *initiating* actions:
//   - tell me your domain
//   - tell me where you registered (or will register) it
//
// Marking the step "done" means "the domain exists at a registrar
// and I'm ready for Cowork to take over" — NOT "I've already
// connected the nameservers". Cowork adds the zone, emails the
// customer the assigned nameservers, polls until propagated.
//
// Resend, Cal.com and GBP setup all moved to Step 3 (Modules) since
// they're customer-purchased modules, not universal infrastructure.
const step2DomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .max(253)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i,
      "Domain looks malformed (e.g. yourbusiness.co.uk).",
    )
    .optional(),
  registrar: z.enum(["already-have", "cloudflare", "external"]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Step 3 — Modules. Each customer-purchased module has its own
// collapsible sub-card with a RAG status (red / amber / green)
// shown in the card header. Conditional on at least one of the
// four supported modules being in `prospect.moduleSelections`;
// otherwise this step is hidden from the wizard entirely.
//
// Internal step ID stays "tools" so existing Notion done-flags
// and saved data don't break — the user-facing label is "Modules".
//
// Sub-modules:
//   - Sender email (Resend) — applies if Newsletter OR Enquiry Form
//     is purchased. Customer signs up, invites me to their team,
//     shares signup email.
//   - Online booking (Cal.com) — applies if Online Booking is
//     purchased. Customer signs up, pastes their public booking URL.
//     I embed it on the built site; no admin access needed.
//   - Google Business Profile — applies if the GBP addon is
//     purchased. Customer adds me as a Manager, pastes their public
//     listing URL.
const step3ToolsSchema = z.object({
  // Cal.com — URL-only capture (embed). Schema is loose; the gate
  // enforces the cal.com / cal.eu host check (both accepted: UK
  // customers route to the EU instance for GDPR).
  calcomBookingUrl: z.string().trim().url().max(500).optional(),
  // GBP — URL + manager-invite confirmation.
  gbpUrl: z.string().trim().url().max(500).optional(),
  gbpManagerInvited: z.boolean().optional(),
  // Resend — signup email + team-invite confirmation. Domain DNS is
  // handled by Cowork once both fields are in.
  resendSignupEmail: z.string().trim().email().max(254).optional(),
  resendInvitedMe: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Step 4 (Brand assets) — direct uploads to a public R2 bucket
// (`moduforge-customer-assets`). The Hub UI uploads each file via
// POST /api/onboarding/upload, which validates + writes to R2 and
// appends the new asset record to this slice. Marking the step
// done has no minimum asset count: customers without photos can
// signal that in the notes field and I'll suggest placeholders.
const assetSchema = z.object({
  /** R2 object key, e.g. `assets/<token>/logo/<uuid>-favicon.png`. */
  key: z.string().max(500),
  filename: z.string().max(200),
  /** Bytes. */
  size: z.number().int().nonnegative(),
  contentType: z.string().max(120),
  /** ISO-8601 timestamp set when the upload completes. */
  uploadedAt: z.string(),
});

export type Asset = z.infer<typeof assetSchema>;

/**
 * A photo specifically tagged to one of the customer's services.
 * `serviceName` matches against `phase3Data.services[N].name` so the
 * mapping survives reordering. Falls back to position if no name
 * matches (for older uploads done before service-naming was strict).
 */
const serviceAssetSchema = assetSchema.extend({
  serviceName: z.string().trim().max(200),
});
export type ServiceAsset = z.infer<typeof serviceAssetSchema>;

const step4AssetsSchema = z.object({
  /** Single brand logo. PNG / JPG / SVG / WebP. */
  logo: assetSchema.optional(),
  /** Single hero photo — full-width on the home page. NEW C5.3. */
  hero: assetSchema.optional(),
  /** Single about-us / team / owner photo — appears on About page. NEW C5.3. */
  about: assetSchema.optional(),
  /** Per-service photos, mapped by serviceName. NEW C5.3. */
  services: z.array(serviceAssetSchema).max(10).optional(),
  /** Subtle background images for section dividers. NEW C5.3, max 5. */
  backgrounds: z.array(assetSchema).max(5).optional(),
  /** Gallery photos — anything that doesn't fit a specific role. NEW C5.3. */
  gallery: z.array(assetSchema).max(20).optional(),
  /**
   * LEGACY pre-C5.3 untagged photos. The adapter falls back to
   * `photos[0]` for hero and treats the rest as gallery if no
   * semantic fields are set. New uploads should use the
   * semantically-named fields above; this stays around so existing
   * customers' data keeps working without a migration.
   */
  photos: z.array(assetSchema).max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Step "content" (NEW, between Modules + Brand assets in display
// order, but Notion checkbox 6). Captures the WORDS that go on the
// customer's site — about us, services-rich content, FAQ, optional
// tagline override. Phase 3 intake captures the bare minimum needed
// to scope the project pre-payment; this step captures the deeper
// content post-payment, when the customer is committed and willing
// to invest the time. Also the raw material for Haiku copy assist
// (Stage 2C C5.5).
const step4ContentSchema = z.object({
  /** Optional override of the Phase 3 intake tagline; ≤200 chars. */
  tagline: z.string().trim().max(200).optional(),
  /** Multi-paragraph "about us" copy; ≤5000 chars. */
  aboutBlurb: z.string().trim().max(5000).optional(),
  /** "What makes us different" bullets; up to 8, ≤300 chars each. */
  aboutBullets: z
    .array(z.string().trim().max(300))
    .max(8)
    .optional(),
  /** Per-service rich content. Renamed services lose Phase 3 link
   *  by design — content step IS the canonical post-edit list.
   *  `description` and `priceFrom` are SEEDED from Phase 3 on first
   *  edit and become canonical thereafter. */
  services: z
    .array(
      z.object({
        serviceName: z.string().trim().max(200),
        /** Short 1-2 sentence summary used on the services card grid.
         *  Seeded from Phase 3 services[].description if names match
         *  on first content-step open. */
        description: z.string().trim().max(500).optional(),
        /** Optional starting price in pounds; seeded from Phase 3. */
        priceFrom: z.number().nonnegative().optional(),
        longDescription: z.string().trim().max(2000).optional(),
        features: z
          .array(z.string().trim().max(200))
          .max(8)
          .optional(),
        pricingNotes: z.string().trim().max(500).optional(),
      }),
    )
    .max(10)
    .optional(),
  /** FAQ Q&A pairs; up to 10. */
  faq: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(300),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .max(10)
    .optional(),
  /** Customer testimonials; up to 5. Seeded from Phase 3
   *  socialProof.testimonials on first content-step open (Phase 3
   *  didn't capture ratings — those start blank). Renders on the
   *  customer site home + about pages and feeds JSON-LD Review +
   *  AggregateRating for SEO star snippets. */
  testimonials: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        location: z.string().trim().max(100).optional(),
        quote: z.string().trim().min(1).max(500),
        /** Optional 1-5 star rating. When set, drives both the
         *  visual star row above the quote on the customer site
         *  AND the per-Review ratingValue in JSON-LD. Unset
         *  testimonials display no star row and contribute a
         *  default 5 to the AggregateRating average. */
        rating: z.number().int().min(1).max(5).optional(),
      }),
    )
    .max(5)
    .optional(),
  /** Trust signals — render as a small horizontal strip on the
   *  About page header ("Established 2010 • Member of FMB •
   *  Trustmark certified"). Each field optional. */
  trust: z
    .object({
      yearsExperience: z.number().int().min(0).max(200).optional(),
      associations: z.string().trim().max(500).optional(),
      awards: z.string().trim().max(500).optional(),
    })
    .optional(),
  /** Business details — contact info that renders site-wide
   *  (footer, contact page, JSON-LD). Seeded from Phase 3
   *  contactDetails on first content-step open; canonical
   *  thereafter. Adapter prefers these over Phase 3 if present. */
  business: z
    .object({
      contactName: z.string().trim().max(100).optional(),
      phoneDisplay: z.string().trim().max(30).optional(),
      phoneTel: z.string().trim().max(30).optional(),
      publicEmail: z
        .string()
        .trim()
        .email("Enter a valid email")
        .max(254)
        .optional()
        .or(z.literal("")),
      address: z.string().trim().max(500).optional(),
      serviceArea: z.string().trim().max(500).optional(),
      /** Per-day hours record. Day key is "Mon" / "Tue" etc.
       *  Each entry: { open: bool, from?: "09:00", to?: "17:00" }. */
      openingHours: z
        .record(
          z.string(),
          z
            .object({
              open: z.boolean(),
              from: z.string().optional(),
              to: z.string().optional(),
            })
            .optional(),
        )
        .optional(),
    })
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Step 5 — Review & go-live. The final pre-launch step. Customer:
//   - Reviews their preview build (when Cowork has it ready)
//   - Submits up to MAX_REVIEW_EDITS rounds of revisions, each
//     scoped to in-scope changes only
//   - Picks a target go-live date
//   - Signs off
//
// Hard cap on revisions stops scope creep. Out-of-scope requests
// (new pages / new features / full redesigns) are quoted
// separately under Terms §10. The pre-submit guardrails copy in
// the Hub UI tells the customer what's in scope before they spend
// an edit; Cowork (Stage 2C) will classify automatically and
// reply with "this one's out of scope; your N stands at N, not
// N-1; please re-submit something in scope".

export const MAX_REVIEW_EDITS = 3;

const reviewEditSchema = z.object({
  id: z.string().min(1).max(40),
  submittedAt: z.string(),
  message: z
    .string()
    .trim()
    .min(20, "Tell me a bit more — at least a couple of sentences.")
    .max(2000),
  /** Set to "applied" once the change is live; "rejected" if
   *  Cowork or Ben deems it out of scope. Customers see this on
   *  their Hub. */
  status: z.enum(["submitted", "applied", "rejected"]).default("submitted"),
  // --- Cowork classify-and-apply audit (NEW C5.7 Phase B v2 pre-commit) ---
  // Same fields as ChangeRequest.cowork* — step6-change-requests
  // iterates BOTH change requests AND review edits and treats them
  // uniformly (single classifier prompt, single applier whitelist).
  // Pre-commit edits skip the customer-approval gate (the whole
  // Step 5 IS the approval) — the cron applies + dispatches a LIVE
  // build that updates the customer's preview Worker directly.
  coworkClassification: z.enum(["in_scope", "out_of_scope", "ambiguous"]).optional(),
  coworkConfidence: z.number().min(0).max(1).optional(),
  coworkReasoning: z.string().max(2000).optional(),
  /** Pre-commit patches use the same shape as post-commit. */
  coworkPatch: z
    .object({
      target: z.string(),
      newValue: z.unknown(),
      previousValue: z.unknown(),
      serviceName: z.string().optional(),
      faqQuestion: z.string().optional(),
    })
    .optional(),
  coworkPatchAppliedAt: z.string().optional(),
  /** Stamped when Ben gets an escalation email for an
   *  out-of-scope / ambiguous edit. */
  coworkEscalatedAt: z.string().optional(),
});

export type ReviewEdit = z.infer<typeof reviewEditSchema>;

const step5ReviewSchema = z.object({
  /** ISO-8601, set when the customer clicks "Request site preview"
   *  (the first of the two end-of-onboarding submits). Until this
   *  is set, the edits section + commit button are hidden — the
   *  customer hasn't asked for a build yet. After it's set, the
   *  edits section unlocks and the commit button appears (disabled
   *  until previewUrl is also set). */
  previewSubmittedAt: z.string().optional(),
  /** URL Cowork sets once a preview is built. Empty until then. */
  previewUrl: z.string().trim().url().max(500).optional(),
  /** Customer's revision requests; capped at MAX_REVIEW_EDITS by
   *  the schema AND by the dedicated /api/onboarding/review-edit
   *  endpoint. */
  edits: z.array(reviewEditSchema).max(MAX_REVIEW_EDITS).optional(),
  /** YYYY-MM-DD. Persisted to Notion's "Go Live Date" property when
   *  the step is marked done. */
  goLiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
    .optional(),
  finalSignOff: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const onboardingDataSchema = z.object({
  cloudflare: step1CloudflareSchema.optional(),
  domain: step2DomainSchema.optional(),
  tools: step3ToolsSchema.optional(),
  content: step4ContentSchema.optional(),
  assets: step4AssetsSchema.optional(),
  review: step5ReviewSchema.optional(),
});

export type OnboardingData = z.infer<typeof onboardingDataSchema>;

/** Per-step partial schema — used by the API to validate a single step's PATCH body. */
export const STEP_SCHEMAS: Record<StepId, z.ZodTypeAny> = {
  cloudflare: step1CloudflareSchema,
  domain: step2DomainSchema,
  tools: step3ToolsSchema,
  content: step4ContentSchema,
  assets: step4AssetsSchema,
  review: step5ReviewSchema,
};

// ---------- "Required to mark done" guards ----------
//
// These check the minimum fields that must be present for a step to
// flip its checkbox. They run on the server inside the API route so
// the client can't bypass them.
//
// `ctx` carries module info so per-step gates can apply conditional
// requirements (e.g. step 2 only requires Resend fields if the
// prospect bought Enquiry or Newsletter).

export type CanMarkStepDoneCtx = {
  modules: string[]; // prospect.moduleSelections
};

export function canMarkStepDone(
  stepId: StepId,
  data: Record<string, unknown>,
  ctx: CanMarkStepDoneCtx,
): { ok: true } | { ok: false; reason: string } {
  switch (stepId) {
    case "cloudflare":
      if (!data.cloudflareEmail) {
        return {
          ok: false,
          reason: "Please share the email you signed up to Cloudflare with.",
        };
      }
      return { ok: true };
    case "domain": {
      if (!data.domain) {
        return {
          ok: false,
          reason: "Please tell me which domain you'll be using.",
        };
      }
      if (!data.registrar) {
        return {
          ok: false,
          reason: "Please tell me where you registered (or will register) it.",
        };
      }
      // No "domain connected" check — the customer can't honestly
      // confirm "connected" before Cowork has added the zone and
      // sent them the nameserver values. Mark-done = "the domain
      // exists at a registrar and I'm ready for you to take over".
      // Cowork handles the rest (zone add → email the customer the
      // assigned nameservers → poll for propagation → email
      // confirmation when live). See ARCHITECTURE.md §6.2.
      return { ok: true };
    }
    case "tools": {
      const hasBooking = ctx.modules.includes("Online Booking");
      const hasGbpAddon = ctx.modules.includes(
        "Google Business Profile Setup/Audit",
      );
      const needsResend =
        ctx.modules.includes("Enquiry Form") ||
        ctx.modules.includes("Newsletter");

      if (hasBooking) {
        const url = typeof data.calcomBookingUrl === "string"
          ? data.calcomBookingUrl.trim()
          : "";
        if (!url) {
          return {
            ok: false,
            reason:
              "Please complete the Online booking module — paste your Cal.com event URL.",
          };
        }
        try {
          const parsed = new URL(url);
          // Accept cal.com (global) and cal.eu (EU instance — UK
          // customers route here for GDPR). Both serve identical
          // embed widgets. Mirrors Step3Modules.tsx calcomStatus.
          const hostnameOk =
            parsed.hostname === "cal.com" ||
            parsed.hostname === "cal.eu" ||
            parsed.hostname === "www.cal.com" ||
            parsed.hostname === "www.cal.eu" ||
            parsed.hostname.endsWith(".cal.com") ||
            parsed.hostname.endsWith(".cal.eu");
          if (!hostnameOk) {
            return {
              ok: false,
              reason:
                "That doesn't look like a Cal.com URL — it should start with https://cal.eu/ (or https://cal.com/).",
            };
          }
          // Profile URLs (cal.eu/their-name) lack the event slug
          // and would render the wrong screen on the embedded
          // booking widget. Require /username/event-slug minimum.
          // Mirrors the client-side check in Step3Modules.tsx.
          const segments = parsed.pathname.split("/").filter(Boolean);
          if (segments.length < 2) {
            return {
              ok: false,
              reason:
                "That looks like your Cal.com profile URL — paste the link to a specific event instead (it'll have a slug after your username, e.g. cal.eu/your-name/30min).",
            };
          }
        } catch {
          return {
            ok: false,
            reason: "That Cal.com URL doesn't look valid.",
          };
        }
      }
      if (hasGbpAddon) {
        const url = typeof data.gbpUrl === "string" ? data.gbpUrl.trim() : "";
        if (!url) {
          return {
            ok: false,
            reason:
              "Please complete the Google Business Profile module — paste your GBP URL.",
          };
        }
        if (!data.gbpManagerInvited) {
          return {
            ok: false,
            reason:
              "Please tick the box once you've added me as a Manager on your Google Business Profile.",
          };
        }
      }
      if (needsResend) {
        if (!data.resendSignupEmail) {
          return {
            ok: false,
            reason:
              "Please complete the Sender email module — share the email you signed up to Resend with.",
          };
        }
        if (!data.resendInvitedMe) {
          return {
            ok: false,
            reason:
              "Please tick the box once you've added me as a team member in Resend.",
          };
        }
      }
      return { ok: true };
    }
    case "content":
      // No minimum field count: customers without polished copy can
      // flag that in the notes field and Haiku-assisted drafts (or
      // stock copy) get used during the build. Mark-done = "this is
      // what I want on my site". They can edit any time after.
      return { ok: true };
    case "assets":
      // No minimum asset count: customers without a logo or photos
      // can flag that in the notes field and I'll provide stock
      // placeholders during the build. Mark-done = "I'm ready, you
      // build with what's here". They can come back to upload more
      // any time after marking done; the inputs stay editable per
      // the edit-after-done pattern.
      return { ok: true };
    case "review":
      if (!data.goLiveDate) {
        return {
          ok: false,
          reason: "Please pick a target go-live date before signing off.",
        };
      }
      if (!data.finalSignOff) {
        return {
          ok: false,
          reason:
            "Please tick the final sign-off so I know you're happy to go live.",
        };
      }
      return { ok: true };
  }
}

// ---------- Merge helpers ----------

/**
 * Deep-ish merge of a per-step patch into the existing onboarding
 * data blob. The schema is shallow (one nested object per step) so
 * we only need a single level of merge.
 */
export function mergeStepData(
  existing: OnboardingData | undefined,
  stepId: StepId,
  patch: Record<string, unknown>,
): OnboardingData {
  const base: OnboardingData = existing ?? {};
  const prevStep = (base[stepId] ?? {}) as Record<string, unknown>;
  return {
    ...base,
    [stepId]: { ...prevStep, ...patch },
  } as OnboardingData;
}

/** Read the typed slice for a single step from the blob. */
export function getStepData(
  data: OnboardingData | undefined,
  stepId: StepId,
): Record<string, unknown> {
  if (!data) return {};
  const slice = data[stepId];
  return (slice ?? {}) as Record<string, unknown>;
}

// ---------- Done flags helper ----------

export function getDoneFlags(prospect: ProspectRecord): Record<StepId, boolean> {
  return {
    cloudflare: prospect.onboardingStep1Done,
    domain: prospect.onboardingStep2Done,
    tools: prospect.onboardingStep3Done,
    content: prospect.onboardingContentDone,
    assets: prospect.onboardingStep4Done,
    review: prospect.onboardingStep5Done,
  };
}

/**
 * True when every applicable step is ticked. Used to flip status to
 * "Onboarding Complete" after the user marks step 5 done.
 */
export function isHubComplete(
  steps: StepDef[],
  done: Record<StepId, boolean>,
): boolean {
  return steps.filter((s) => s.applicable).every((s) => done[s.id]);
}
