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
  "tools", // 3 — only if Booking or GBP module
  "assets", // 4 — universal
  "review", // 5 — universal
] as const;

export type StepId = (typeof STEP_IDS)[number];

// Notion stores per-step done flags as fixed columns (Onboarding
// Step 1 Done … Step 5 Done). The mapping never changes even when a
// step is hidden, so the Notion schema stays stable across orders.
export const STEP_NUMBER: Record<StepId, 1 | 2 | 3 | 4 | 5> = {
  cloudflare: 1,
  domain: 2,
  tools: 3,
  assets: 4,
  review: 5,
};

export type StepDef = {
  id: StepId;
  /** Notion checkbox column number (1-5, never reassigned). */
  notionStep: 1 | 2 | 3 | 4 | 5;
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
 */
export function isOnboardingUnlocked(status: string): boolean {
  return ONBOARDING_UNLOCKED_STATUSES.has(status as ProspectStatus);
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
  const step3Applicable = hasBooking || hasGbpAddon;

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
      title: "Domain & email DNS",
      shortBlurb: "Register or connect your domain and add the DNS records.",
      applicable: true,
    },
    {
      id: "tools",
      notionStep: 3,
      title: "Connect your tools",
      shortBlurb: hasBooking && hasGbpAddon
        ? "Set up your booking page and Google Business Profile."
        : hasBooking
          ? "Set up your booking page."
          : "Set up your Google Business Profile.",
      applicable: step3Applicable,
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

// Step 2 covers the customer's *initiating* actions:
//   - tell me your domain
//   - tell me where you registered (or will register) it
//   - confirm the domain is registered / connected to Cloudflare
//   - if Enquiry or Newsletter is in play: sign up for Resend, invite
//     me as a team member, share your Resend signup email
//
// The actual DNS plumbing (Cloudflare Pages CNAMEs, Resend SPF /
// DKIM / Return-Path) is mine to do — I have Administrator access
// on their Cloudflare from Step 1 and team-member access on their
// Resend from this step. Customer never pastes a DNS record.
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
  domainConnected: z.boolean().optional(),
  resendSignupEmail: z.string().trim().email().max(254).optional(),
  resendInvitedMe: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Step 3 (Connect tools) — conditional on Booking and/or GBP-addon
// modules. Cal.com is URL-capture only (we embed their public booking
// page; no admin access needed). GBP requires manager invite so I can
// audit / update their listing later.
const step3ToolsSchema = z.object({
  // Cal.com booking URL — must be a cal.com domain so the embed
  // library knows how to render it. Schema is loose-permissive (any
  // URL); the per-step gate enforces the cal.com host check.
  calcomBookingUrl: z.string().trim().url().max(500).optional(),
  // GBP listing URL — usually `https://g.page/...` or a full
  // `https://www.google.com/maps/...` URL. Permissive validation.
  gbpUrl: z.string().trim().url().max(500).optional(),
  // Tick the customer flips once they've added BEN_OPS_EMAIL
  // as a Manager on their GBP listing. Required to mark step done.
  gbpManagerInvited: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const step4AssetsSchema = z.object({
  logoR2Key: z.string().max(500).optional(),
  photoR2Keys: z.array(z.string().max(500)).max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const step5ReviewSchema = z.object({
  previewUrlSeen: z.boolean().optional(),
  changeRequests: z.string().trim().max(5000).optional(),
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
  assets: step4AssetsSchema.optional(),
  review: step5ReviewSchema.optional(),
});

export type OnboardingData = z.infer<typeof onboardingDataSchema>;

/** Per-step partial schema — used by the API to validate a single step's PATCH body. */
export const STEP_SCHEMAS: Record<StepId, z.ZodTypeAny> = {
  cloudflare: step1CloudflareSchema,
  domain: step2DomainSchema,
  tools: step3ToolsSchema,
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
      if (!data.domainConnected) {
        return {
          ok: false,
          reason:
            "Please tick the box once your domain is registered or connected.",
        };
      }
      // Resend fields are only required when the prospect bought
      // Enquiry or Newsletter — those are the modules that actually
      // need a verified sender domain.
      const needsResend =
        ctx.modules.includes("Enquiry Form") ||
        ctx.modules.includes("Newsletter");
      if (needsResend) {
        if (!data.resendSignupEmail) {
          return {
            ok: false,
            reason:
              "Please share the email you signed up to Resend with.",
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
    case "tools": {
      const hasBooking = ctx.modules.includes("Online Booking");
      const hasGbpAddon = ctx.modules.includes(
        "Google Business Profile Setup/Audit",
      );
      if (hasBooking) {
        const url = typeof data.calcomBookingUrl === "string"
          ? data.calcomBookingUrl.trim()
          : "";
        if (!url) {
          return {
            ok: false,
            reason:
              "Please paste your Cal.com booking URL so I can embed it on your site.",
          };
        }
        // Cal.com hosted URL check. Self-hosted Cal.com (custom
        // domain) is uncommon for the prospects we serve, so we
        // require cal.com for now and revisit if a customer needs
        // self-hosted.
        try {
          const parsed = new URL(url);
          const ok =
            parsed.hostname === "cal.com" ||
            parsed.hostname === "www.cal.com" ||
            parsed.hostname.endsWith(".cal.com");
          if (!ok) {
            return {
              ok: false,
              reason:
                "That doesn't look like a cal.com URL — it should start with https://cal.com/.",
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
              "Please paste your Google Business Profile URL (e.g. https://g.page/...).",
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
      return { ok: true };
    }
    case "assets":
      // H4 will tighten this — placeholder always passes for now.
      return { ok: true };
    case "review":
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
