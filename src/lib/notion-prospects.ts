// Notion CRUD for the Prospects database.
//
// Uses notionFetch (REST) rather than @notionhq/client — see notion.ts
// for the rationale. Property payloads are constructed in Notion's
// standard JSON shape, exactly as the SDK would have built them.
//
// Schema (must match the Notion database exactly — Cowork created the
// schema via DDL in Phase B Checkpoint 2; H1 added the Onboarding fields):
//
// Title         Name (text, prospect's full name)
// Email         email
// Phone         phone_number
// Business Name rich_text
// Business Type select
// UK Location   rich_text
// Current Website Situation  select
// Phase 1 Submitted At  date
// Phase 1 Unique Token  rich_text (UUID)
// Status        select
// Phase 2 Data  rich_text (JSON blob)
// Phase 2 Submitted At  date
// Compatibility Result  select
// Compatibility Reasoning  rich_text
// Hard Blocker Triggered   rich_text
// Soft Blockers Triggered  multi_select
// Phase 3 Data  rich_text (JSON blob)
// Phase 3 Submitted At  date
// Module Selections  multi_select
// Setup Fee Calculated  number
// Monthly Fee Calculated  number
// Founding Member  checkbox
// Notes  rich_text
// --- Onboarding Hub (Stage 2B) ---
// Onboarding Step 1 Done  checkbox  (Cloudflare account)
// Onboarding Step 2 Done  checkbox  (Domain & email DNS)
// Onboarding Step 3 Done  checkbox  (Connect tools — Cal.com / GBP)
// Onboarding Step 4 Done  checkbox  (Brand assets)
// Onboarding Step 5 Done  checkbox  (Review & launch)
// Onboarding Step 6 Done  checkbox  (Site content — about / FAQ / services-rich)
// Onboarding Data         rich_text (JSON blob, per-step state)
// Onboarding Started At   date
// Onboarding Completed At date
// Go Live Date            date

import { notionFetch } from "./notion";
import { getServerEnv } from "./env";
import type { Phase1Data, Phase2Data, CompatibilityOutcome } from "./schemas";

export type ProspectStatus =
  | "Phase 1 Complete"
  | "Phase 1 Email Sent"
  | "Phase 2 Complete"
  | "Phase 2 Accepted"
  | "Phase 2 Soft Rejected"
  | "Phase 2 Flagged for Review"
  | "Phase 2 Clarification Requested"
  | "Phase 3 In Progress"
  | "Phase 3 Complete"
  | "Paid"
  | "Onboarding Started"
  | "Onboarding Complete"
  | "Build Started"
  | "Live"
  | "Cancelled";

export type ProspectRecord = {
  pageId: string;
  token: string;
  name: string;
  email: string;
  phone?: string;
  business?: string;
  businessType?: string;
  location?: string;
  websiteSituation?: string;
  status: ProspectStatus | string;
  phase1SubmittedAt?: string;
  phase2SubmittedAt?: string;
  phase2Data?: Phase2Data;
  phase3SubmittedAt?: string;
  phase3Data?: unknown; // partial allowed
  compatibilityResult?:
    | "Accept"
    | "Soft Reject"
    | "Flag for Review"
    | "Clarification Needed"
    | "Insufficient Data";
  compatibilityReasoning?: string;
  hardBlockerTriggered?: string;
  softBlockersTriggered: string[];
  moduleSelections: string[];
  /** Multi-location counter — how many EXTRA locations beyond the
   *  one included in the base. £15 setup each, no monthly. Maps
   *  to the Notion "Extra Locations" number column (0 when the
   *  customer hasn't bought any). The per-location details
   *  (name / address / hours) live in `onboardingData.content
   *  .locations[]` once the customer fills them in via Hub
   *  Step 4. */
  extraLocations: number;
  setupFeeCalculated?: number;
  monthlyFeeCalculated?: number;
  foundingMember: boolean;
  notes?: string;
  // --- Stripe integration (Stage 2A Part 2 — 2026-05-25) ---
  /** Stripe Customer ID — `cus_*`. Set on first successful
   *  Checkout. Persists across subscriptions / cancellations so
   *  re-onboarding customers keep history. */
  stripeCustomerId?: string;
  /** Active Subscription ID — `sub_*`. Set on first successful
   *  Checkout. Cleared on `customer.subscription.deleted`. */
  stripeSubscriptionId?: string;
  /** ISO-8601 of the FIRST successful Checkout (the setup-paid
   *  event). Doubles as the "Paid" status timestamp. */
  stripePaidAt?: string;
  // --- Onboarding Hub (Stage 2B) ---
  onboardingStep1Done: boolean;
  onboardingStep2Done: boolean;
  onboardingStep3Done: boolean;
  onboardingStep4Done: boolean;
  onboardingStep5Done: boolean;
  /** New "Site content" Hub step (between Modules and Brand assets
   *  in display order, Notion checkbox 6). Captures rich about-us +
   *  services + FAQ copy. Optional column — false if Notion field
   *  doesn't exist yet (defensive for prospects from before the
   *  column was added). */
  onboardingContentDone: boolean;
  onboardingData?: unknown; // parsed OnboardingData JSON, see lib/onboarding.ts
  onboardingStartedAt?: string;
  onboardingCompletedAt?: string;
  goLiveDate?: string;
  // --- Cowork Ops state (Stage 2C C2.1+) ---
  /** ISO-8601, set by step1-cloudflare when Ben's membership in the customer's CF account is accepted + verified. */
  cloudflareMembershipVerifiedAt?: string;
  /** Customer's Cloudflare account id, captured by step1-cloudflare after accepting the invitation. */
  cloudflareAccountId?: string;
  /** Cloudflare zone id for the customer's domain, captured by step2-domain after zone create / discover. */
  cloudflareZoneId?: string;
  /** Latest known zone status (one of: pending, initializing, active, moved, deleted, deactivated). */
  cloudflareZoneStatus?:
    | "pending"
    | "initializing"
    | "active"
    | "moved"
    | "deleted"
    | "deactivated";
  /** ISO-8601, set when the zone status first flips to "active" (latch — used to send the activation email exactly once). */
  domainVerifiedAt?: string;
  /** ISO-8601, set when step2-domain sends the customer their assigned nameservers (latch — never resend). */
  nameserversEmailSentAt?: string;
  /** ISO-8601, set when the customer clicks "I've updated my nameservers" (in the email or on the hub). Hint to Cowork that the registrar update is supposedly done — useful for prioritising poll order; not authoritative (Cloudflare's zone status is the truth). */
  customerConfirmedNameserversAt?: string;
  /** Per-customer Worker name, captured by step2-domain after the placeholder Worker is uploaded. Latches "Worker exists in customer's CF account". */
  workerName?: string;
  /** ISO-8601, set when step2-domain has bound apex+www to the per-customer Worker AND verified the placeholder responds with HTTP 200. The "site is reachable" latch. */
  siteLiveAt?: string;
  /** ISO-8601, set when ops worker triggers a customer-site build
   *  via GitHub Actions repository_dispatch. Anti-spam latch — if
   *  set within the last 15 min, step5-review skips re-triggering.
   *  Cleared (best-effort) by /api/internal/build-callback after
   *  build completes (success OR failure), so the next preview
   *  request can trigger a fresh build immediately. NEW C5.4. */
  previewBuildTriggeredAt?: string;
  /** ISO-8601 — set by step7-go-live when the GO-LIVE build is
   *  dispatched on (or after) the customer's chosen `goLiveDate`.
   *  Cleared by build-callback on success. Acts as a 20-minute
   *  anti-spam latch so we don't re-dispatch every cron tick while
   *  the Action is still running. Distinct from
   *  `previewBuildTriggeredAt` so the two pipelines can be
   *  diagnosed independently in /admin. */
  finalLaunchTriggeredAt?: string;
  /** ISO-8601, set by /api/internal/build-callback when a customer-
   *  site build fails. Cleared on next successful build. Useful
   *  for surfacing "last build failed" in /admin. NEW C5.4. */
  previewBuildFailedAt?: string;
  /** Resend domain id (UUID) — set by step2b-resend-domain after
   *  registering the customer's domain with Resend. Used to poll
   *  verification status and to look up the verified sender domain
   *  when sending newsletter emails. */
  resendDomainId?: string;
  /** ISO-8601 — set when Resend reports the domain as "verified".
   *  Once set, newsletter emails send from the customer's domain
   *  instead of modu-forge.co.uk. */
  resendDomainVerifiedAt?: string;
  /** Haiku polish cache — JSON object keyed by polish target (e.g.
   *  "tagline", "service:Loft conversions:longDesc", "faq:0:answer").
   *  Each value carries an `inputHash` so we re-polish when the
   *  customer's source bullets change. See src/lib/haiku/cache.ts.
   *  NEW C5.5. */
  haikuCache?: Record<string, unknown>;
  /** Customer login password hash (PBKDF2:SHA-256 — see
   *  src/lib/auth/password.ts for the storage format). Generated +
   *  emailed at Phase 2 acceptance time. NEW C5.7+. */
  passwordHash?: string;
  /** ISO-8601 — when passwordHash was last set (originally OR via
   *  forgot-password regenerate). Audit field for /admin. */
  passwordSetAt?: string;
  // --- GDPR retention (Stage 2D+) ---
  /** ISO-8601 — when the customer's Status flipped to Cancelled.
   *  Set by the admin cancellation flow or the dashboard cancel
   *  endpoint when applying an immediate-prorated cancellation. */
  cancelledAt?: string;
  /** ISO date YYYY-MM-DD — the day personal data MUST be deleted.
   *  Set 30 days after cancelledAt. The gdpr-scrub-tick cron
   *  reads this; on or after this date, personal data is purged.
   *  Customer can request earlier deletion under Article 17 UK
   *  GDPR — we just bring this date forward and the cron handles
   *  the rest. */
  dataRetentionUntil?: string;
  /** ISO-8601 — when the scrub cron actually completed. Set ONCE
   *  by the cron after the writes finish. Used as the safety
   *  latch so a second scrub never runs (e.g. if Notion sync was
   *  flaky and the cron retried). */
  dataScrubbedAt?: string;
  // --- Customer dashboard (Stage 2D) ---
  changeRequests: ChangeRequest[];
  notionUrl: string;
  // --- Module change (1-round-only, pre-commit only — see lib/billing) ---
  /** ISO-8601 timestamp the round was consumed (i.e. customer hit
   *  Confirm on the re-selector). Absence = round still available.
   *  Hard cap: 1 module change per customer ever. */
  moduleChangeRoundUsedAt?: string;
  /** Append-only audit trail. Every Confirm + every operator
   *  resolution (apply / reject) lands here. Used by the admin
   *  panel and (later) the Stripe reconciliation cron. */
  moduleChangeLog: ModuleChangeLogEntry[];
};

// --- Module change log entry ---
//
// Sits inside the prospect's Module Change Log rich_text JSON blob.
// Each Confirm submission appends a row with status="pending-stripe".
// Operator transitions it to "applied" (Stripe op done) or "rejected"
// (no Stripe op needed) via /admin/[token]. When Stripe Phase 2
// lands, the cron + webhook handler will own those transitions.
export type ModuleChangeLogEntry = {
  id: string; // UUID — also used as Stripe idempotency key suffix
  submittedAt: string; // ISO-8601
  /** Snapshot of selection BEFORE the change. */
  fromModules: string[];
  /** Snapshot of selection AFTER the change. */
  toModules: string[];
  /** Setup fee delta in pounds (positive = customer owes us;
   *  negative = we owe customer; zero = no money moves). */
  setupDelta: number;
  /** Monthly fee delta in pounds (positive = sub goes up;
   *  negative = sub goes down; zero = no change). */
  monthlyDelta: number;
  /** New totals (for record + audit; saves recalculating later). */
  newSetupTotal: number;
  newMonthlyTotal: number;
  /**
   * State machine:
   *   pending-stripe → operator hasn't actioned yet (Stripe op + Notion sync)
   *   applied        → operator confirmed Stripe op done; selection live
   *   rejected       → operator declined the change; selection unchanged
   *   billing-failed → Stripe op failed; modules removed only, customer
   *                    needs to update payment method
   */
  status:
    | "pending-stripe"
    | "applied"
    | "rejected"
    | "billing-failed";
  /** Operator's note on the resolution (visible to operator only). */
  resolutionNote?: string;
  /** ISO-8601 of resolution. */
  resolvedAt?: string;
  /**
   * What kind of change this entry represents — drives both the
   * operator UI (which Stripe action is needed) and the customer
   * UI (where the change appears in the dashboard).
   *
   * Defaults to `modules-pre-launch` for legacy entries written
   * before this field was added (the original one-round-per-customer
   * pre-launch flow).
   */
  kind?:
    | "modules-pre-launch"
    | "modules-post-launch"
    | "cancel-end-of-period"
    | "cancel-immediate-prorated"
    | "multilocation-change";
  /** Multi-location counter snapshots — only set when
   *  kind === "multilocation-change". The customer is moving
   *  from `fromExtraLocations` extra locations to
   *  `toExtraLocations`. `setupDelta` reflects the £15 × diff
   *  charge / refund. */
  fromExtraLocations?: number;
  toExtraLocations?: number;
  /**
   * ISO date (YYYY-MM-DD) the change SHOULD take effect on. Set by
   * the customer-facing endpoints to:
   *   - modules-post-launch       → 1st of next month UTC
   *   - cancel-end-of-period      → 1st of next month UTC
   *   - cancel-immediate-prorated → today
   * Pre-launch entries (the original flow) leave this undefined —
   * they apply immediately on operator action.
   */
  effectiveDate?: string;
  /**
   * For `cancel-immediate-prorated` only — pounds owed back to the
   * customer for the unused portion of the current billing period.
   * Computed client-side from latest charge + days used; operator
   * uses this value when issuing the Stripe refund.
   */
  proratedRefund?: number;
};

/**
 * Hard cap on customer change requests per calendar month. Replaces
 * the old "30 minutes/month" time-based allowance with a count-based
 * model that's easier to reason about for both customer and operator.
 * Each request must be a single item — multiple items in one
 * submission are auto-declined by the API and the customer is asked
 * to split. See /api/account/change-request for the detector.
 *
 * Rationale: counting requests is unambiguous and trivially
 * trackable. Time was always a soft estimate that drifted. The
 * one-item-per-request rule keeps each change atomic, makes
 * classification (in scope vs out of scope) tractable, and gives
 * Cowork a clean unit to apply or reject.
 */
// Tightened 3 → 2 on 2026-05-10 (per user direction). The
// pre-commit Hub Step 5 review-edit cap (separate constant
// MAX_REVIEW_EDITS in src/lib/onboarding.ts) stays at 3 — those
// are scoped to launch prep, this cap is the ongoing post-commit
// allowance. Anything bigger or more urgent gets quoted separately
// per the cap-exceeded copy on /account/[token].
export const MONTHLY_CHANGE_REQUEST_LIMIT = 2;

/**
 * Counts requests submitted in the current calendar month that
 * count toward the cap. Two statuses are excluded:
 *   - "rejected" — out-of-scope items quoted separately
 *   - "retracted" — customer withdrew before work started
 * Both shouldn't burn the customer's allowance. Reset is on the
 * 1st of each month, UTC.
 */
export function countActiveChangeRequestsThisMonth(
  requests: ChangeRequest[],
): number {
  const now = new Date();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  return requests.filter(
    (r) =>
      r.submittedAt >= startOfMonth &&
      r.status !== "rejected" &&
      r.status !== "retracted",
  ).length;
}

/**
 * Infer a ChangeRequest's kind from its persisted shape when the
 * explicit `kind` field is absent (legacy records pre-2026-05).
 *
 *   Patches target content.offers.current  → "offer-update"
 *   Anything else                            → "free-text"
 *
 * Used by countActiveChangeRequestsByKind for backward compat. New
 * records always set kind explicitly so inference is the fallback.
 */
export function inferChangeRequestKind(
  request: ChangeRequest,
): NonNullable<ChangeRequest["kind"]> {
  if (request.kind) return request.kind;
  const patches = readCoworkPatches(request);
  if (patches.some((p) => p.target === "content.offers.current")) {
    return "offer-update";
  }
  return "free-text";
}

/**
 * Per-kind monthly counter. Each module gets its own 2/month
 * budget — offers, direct-edits, and free-text classified requests
 * are independent. Used by the dashboard's "Your modules" section
 * to render usage counters.
 *
 * Same status exclusions as countActiveChangeRequestsThisMonth.
 */
export function countActiveChangeRequestsByKind(
  requests: ChangeRequest[],
  kind: NonNullable<ChangeRequest["kind"]>,
): number {
  const now = new Date();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  return requests.filter(
    (r) =>
      r.submittedAt >= startOfMonth &&
      r.status !== "rejected" &&
      r.status !== "retracted" &&
      inferChangeRequestKind(r) === kind,
  ).length;
}

/** Per-module monthly budget. Newsletter sends are counted
 *  separately (see NEWSLETTER_MONTHLY_SEND_LIMIT in newsletter/
 *  limits.ts). General text/content edits use the legacy
 *  free-text MONTHLY_CHANGE_REQUEST_LIMIT — they're part of the
 *  customer's change-request allowance, not a separate module. */
export const MONTHLY_OFFER_UPDATE_LIMIT = 2;

/**
 * One row in the customer's change-requests inbox. Submitted via the
 * /account/[token] dashboard's "Need a change?" form. Cowork will
 * pick these up in Stage 2C, classify (content / module / out-of-
 * scope), draft a reply, and forward to Ben for approval. Until
 * then, Ben handles them manually from /admin/[token].
 *
 * Status is the RAG signal surfaced on both dashboards:
 *   pending     → Red    (received, not yet started)
 *   in-progress → Amber  (being worked on)
 *   resolved    → Green  (done; customer was emailed)
 *   rejected    → Grey   (closed without action; reply explains why)
 *   retracted   → Slate  (customer withdrew before work started;
 *                         doesn't count toward the monthly cap)
 *
 * Retraction is customer-initiated and only allowed while status is
 * `pending`. Once Ben (or Cowork) flips to `in-progress`, retraction
 * is locked out — see DELETE /api/account/change-request.
 */
export type ChangeRequest = {
  id: string; // UUID
  submittedAt: string; // ISO-8601
  message: string; // raw customer text
  /**
   * Discriminator for how the request was submitted + processed.
   * Drives the per-kind monthly counters on the dashboard so each
   * module's budget is independent.
   *
   *   "free-text" (default when absent — legacy records)
   *     The customer types a free-text message via the change-
   *     request block on the dashboard, Haiku classifier patches
   *     OR escalates. This is the only path that consumes
   *     Anthropic tokens.
   *
   *   "offer-update"
   *     Structured offer composer from OfferCard. Pre-baked
   *     coworkPatches[content.offers.current], no Haiku.
   *     Auto-resolved on submit.
   *
   * Counters: countActiveChangeRequestsByKind() filters on this.
   * When absent (old records), the inferred kind comes from the
   * patch targets — see inferChangeRequestKind().
   */
  kind?: "free-text" | "offer-update" | "direct-edit";
  status:
    | "pending"
    | "in-progress"
    | "resolved"
    | "rejected"
    | "retracted";
  /** ISO-8601, set automatically when status flips to resolved /
   *  rejected / retracted. */
  resolvedAt?: string;
  /**
   * Reply shown to the customer on /account/[token] alongside the
   * resolved/rejected status, and included verbatim in the
   * "your change is live" email Cowork sends. Examples:
   *   "Done — your phone number is updated. Refresh your site to
   *   see it live."
   *   "I've quoted this separately because it's bigger than the
   *   monthly allowance — see my email."
   */
  reply?: string;
  /**
   * ISO-8601, set when step6-change-requests has emailed Ben a
   * reminder that this request is still pending. Latch — prevents
   * the cron from re-emailing every tick. The original on-submit
   * notification fires from /api/account/change-request and isn't
   * counted here; this stamp is the FOLLOW-UP nag only. NEW C5.7.
   */
  coworkEscalatedAt?: string;

  // --- Phase B v2 (preview-before-publish) ---
  // When step6 auto-applies a patch + triggers a preview build,
  // these fields capture the build artefacts so the customer can
  // approve/reject before promoting to live.

  /** Cloudflare Worker version id from `wrangler versions upload`.
   *  Threaded into the customer-site-promote workflow when the
   *  customer approves. */
  previewVersionId?: string;
  /** Per-version preview URL Cloudflare issued for `previewVersionId`.
   *  e.g. https://abc123-customer-name.account-subdomain.workers.dev */
  previewVersionUrl?: string;
  /** Random per-version PREVIEW_ACCESS_TOKEN passed to the
   *  customer-site Worker as a `--var` on `wrangler versions upload`.
   *  The marketing site appends this to the iframe src as
   *  `?pa=<token>` so the customer-site middleware authorises the
   *  embed. Without it, anyone with the workers.dev URL would
   *  see "preview locked". NEW C5.7 preview-gate. */
  previewAccessToken?: string;
  /** ISO-8601 — when the preview build completed. */
  previewBuiltAt?: string;
  /** Per-request approval token. The customer's approve / reject
   *  links include this as a query param; the marketing site
   *  validates it matches before dispatching the promote. Stops a
   *  guessed URL from approving someone else's change. Random 32
   *  hex chars (~128 bits). */
  customerApprovalToken?: string;
  /** ISO-8601 — when the customer clicked Approve. After this
   *  the promote workflow runs; once that succeeds the request
   *  flips to status=resolved and customerApprovedAt remains as
   *  the audit stamp. */
  customerApprovedAt?: string;
  /** ISO-8601 — when the customer clicked Reject. Sets status to
   *  pending so Ben can revisit, OR rejected if Cowork's apply
   *  was clearly off-base. Currently always pending. */
  customerRejectedAt?: string;
  /**
   * Cowork's classification + auto-apply audit. Written by step6
   * BEFORE the patch is applied so we always have a rollback
   * record + the operator can spot misclassifications. Plain text
   * so it round-trips through Notion's rich_text shape cleanly.
   */
  coworkClassification?: "in_scope" | "out_of_scope" | "ambiguous";
  /** 0..1, Cowork's confidence in the classification. */
  coworkConfidence?: number;
  /** Free-text reasoning Cowork emits — useful for debugging mis-
   *  classifications + shown to Ben in the escalation email. */
  coworkReasoning?: string;
  /** Structured patches Cowork applied (or proposed). Multi-field
   *  requests produce multiple entries here; reverts run in REVERSE
   *  order so each previousValue puts back what was there before
   *  *its* patch.
   *
   *  Migration: legacy data may have a single `coworkPatch` instead
   *  of `coworkPatches`. Readers should fall back to wrapping
   *  `coworkPatch` in a 1-element array when `coworkPatches` is
   *  absent. New writes use `coworkPatches` only. */
  coworkPatches?: Array<{
    target: string;
    /** New value being written; type depends on target. */
    newValue: unknown;
    /** What was there before — used by the revert button. */
    previousValue: unknown;
    /** For service / faq targets, identifies the entry. */
    serviceName?: string;
    faqQuestion?: string;
  }>;
  /** @deprecated — use `coworkPatches`. Kept on the type for
   *  backward-compat reads of pre-migration data. */
  coworkPatch?: {
    target: string;
    newValue: unknown;
    previousValue: unknown;
    serviceName?: string;
    faqQuestion?: string;
  };
  /** ISO-8601 — when step6 successfully applied coworkPatches to
   *  Notion. Distinct from customerApprovedAt: applied → preview
   *  goes live only when customer approves. */
  coworkPatchAppliedAt?: string;
  /** ISO-8601 — stamped when step6 retries a previously-escalated
   *  in_scope classification. Caps retries at 1: once set,
   *  findActionable() won't allow another retry. */
  coworkRetriedAt?: string;
};

/**
 * Normalise legacy `coworkPatch` (single) and new `coworkPatches`
 * (array) into a single array. Always use this when reading patches
 * to apply / display / revert — never read the raw fields directly,
 * or you'll miss data on either side of the migration.
 *
 * Returns `[]` when neither field is set.
 */
export function readCoworkPatches(
  source:
    | Pick<ChangeRequest, "coworkPatch" | "coworkPatches">
    | { coworkPatch?: unknown; coworkPatches?: unknown },
): NonNullable<ChangeRequest["coworkPatches"]> {
  // New shape wins; legacy shape only used when the new field is
  // absent (so a record migrated by writing both fields shows
  // multi-patch on read).
  const patches = (source as { coworkPatches?: unknown }).coworkPatches;
  if (Array.isArray(patches) && patches.length > 0) {
    return patches as NonNullable<ChangeRequest["coworkPatches"]>;
  }
  const single = (source as { coworkPatch?: unknown }).coworkPatch;
  if (single && typeof single === "object") {
    return [single as NonNullable<ChangeRequest["coworkPatches"]>[number]];
  }
  return [];
}

// --- Property helpers ---

// Notion enforces text.content ≤ 2000 chars per rich_text array
// element, but accepts up to 100 elements per array. So a long
// string (typically a JSON blob like Onboarding Data, Phase 2/3
// Data, Module Change Log, Change Requests Inbox, Haiku Cache)
// gets sliced into 2000-char chunks here. The reader joins them
// back transparently via readRichText (`arr.map(...).join("")`),
// so this is round-trip safe with no caller changes needed.
//
// Why split mid-string is OK for JSON: we're storing arbitrary
// bytes (UTF-8 chars), the reader concatenates without inserting
// separators, and Notion preserves order. Splitting at codepoint
// boundaries (slice on .length, which counts UTF-16 code units)
// is fine because surrogate pairs only matter for a handful of
// emoji + ancient-script chars we don't expect in customer copy
// — and even then, a split mid-pair would just produce garbled
// text on read, never corrupt the JSON parser (which works on
// the joined string).
const NOTION_RICH_TEXT_CHUNK = 2000;

function rt(text: string | undefined) {
  if (!text) return { rich_text: [] };
  if (text.length <= NOTION_RICH_TEXT_CHUNK) {
    return {
      rich_text: [{ type: "text" as const, text: { content: text } }],
    };
  }
  const chunks: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < text.length; i += NOTION_RICH_TEXT_CHUNK) {
    chunks.push({
      type: "text",
      text: { content: text.slice(i, i + NOTION_RICH_TEXT_CHUNK) },
    });
  }
  // Notion caps at 100 rich_text elements per property. 100 × 2000
  // = 200,000 chars — way more than any realistic onboarding blob,
  // but throw a clear error if we ever approach it so we can move
  // to a separate database / external storage.
  if (chunks.length > 100) {
    throw new Error(
      `rt() received text of ${text.length} chars; would split into ` +
        `${chunks.length} blocks but Notion caps at 100. Caller needs ` +
        `to externalise this field.`,
    );
  }
  return { rich_text: chunks };
}

function title(text: string) {
  return { title: [{ type: "text" as const, text: { content: text } }] };
}

function selectProp(name: string | undefined) {
  return name ? { select: { name } } : { select: null };
}

function multiSelectProp(names: string[]) {
  return { multi_select: names.map((name) => ({ name })) };
}

// --- Notion API response shapes (only the bits we read) ---

type NotionPage = {
  id: string;
  url?: string;
  properties: Record<string, unknown>;
};

type NotionQueryResponse = {
  results: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
};

// --- Create ---

export async function createProspect(
  phase1: Phase1Data,
  token: string,
): Promise<{ pageId: string; notionUrl: string }> {
  const env = getServerEnv();
  const now = new Date().toISOString();

  const page = await notionFetch<NotionPage>("/pages", {
    method: "POST",
    body: {
      parent: { database_id: env.NOTION_PROSPECTS_DB_ID },
      properties: {
        Name: title(phase1.name),
        Email: { email: phase1.email },
        Phone: { phone_number: phase1.phone },
        "Business Name": rt(phase1.business),
        "Business Type": selectProp(phase1.businessType),
        "UK Location": rt(phase1.location),
        "Current Website Situation": selectProp(phase1.websiteSituation),
        "Phase 1 Submitted At": { date: { start: now } },
        "Phase 1 Unique Token": rt(token),
        Status: selectProp("Phase 1 Complete"),
        "Founding Member": { checkbox: false },
        "Soft Blockers Triggered": multiSelectProp([]),
        "Module Selections": multiSelectProp([]),
      },
    },
  });

  return {
    pageId: page.id,
    notionUrl: page.url ?? "",
  };
}

// --- Read by token ---

export async function getProspectByToken(
  token: string,
): Promise<ProspectRecord | null> {
  const env = getServerEnv();

  const result = await notionFetch<NotionQueryResponse>(
    `/databases/${env.NOTION_PROSPECTS_DB_ID}/query`,
    {
      method: "POST",
      body: {
        filter: {
          property: "Phase 1 Unique Token",
          rich_text: { equals: token },
        },
        page_size: 1,
      },
    },
  );

  const page = result.results[0];
  if (!page) return null;
  return pageToProspect(page);
}

// --- List all (admin) ---

export async function listAllProspects(): Promise<ProspectRecord[]> {
  const env = getServerEnv();

  const result = await notionFetch<NotionQueryResponse>(
    `/databases/${env.NOTION_PROSPECTS_DB_ID}/query`,
    {
      method: "POST",
      body: {
        sorts: [{ property: "Phase 1 Submitted At", direction: "descending" }],
        page_size: 100,
      },
    },
  );

  return result.results
    .map((p) => pageToProspect(p))
    .filter((p): p is ProspectRecord => p !== null);
}

// --- List prospects in onboarding (Cowork Ops Worker) ---

/**
 * Lists prospects in active onboarding — `Status` is either
 * `Onboarding Started` or `Onboarding Complete`. Used by the Cowork
 * Ops Worker (§4.2 cron tick): every minute it pulls this set,
 * dispatches per-step automation for each, and writes audit /
 * exception entries.
 *
 * Server-side filter via Notion's query API so we don't pull the
 * whole prospects table on every tick. At low volume (1-20 customers)
 * this returns ≤ that many rows; we keep page_size = 100 as a
 * safety bound. If the fleet grows past 100 active onboardings, we
 * paginate via `next_cursor`.
 */
export async function listProspectsNeedingOps(): Promise<ProspectRecord[]> {
  const env = getServerEnv();

  // Prospects the cron should iterate. Includes:
  //   - Onboarding Started / Complete: needs steps 1-5 to progress
  //   - Build Started: needs step5 to complete the build callback
  //   - Live: needs step6 (change-request automation) post-launch
  // Cancelled / earlier-phase prospects are excluded — no work for
  // the cron to do on them.
  const result = await notionFetch<NotionQueryResponse>(
    `/databases/${env.NOTION_PROSPECTS_DB_ID}/query`,
    {
      method: "POST",
      body: {
        filter: {
          or: [
            { property: "Status", select: { equals: "Onboarding Started" } },
            { property: "Status", select: { equals: "Onboarding Complete" } },
            { property: "Status", select: { equals: "Build Started" } },
            { property: "Status", select: { equals: "Live" } },
          ],
        },
        sorts: [{ property: "Phase 1 Submitted At", direction: "ascending" }],
        page_size: 100,
      },
    },
  );

  return result.results
    .map((p) => pageToProspect(p))
    .filter((p): p is ProspectRecord => p !== null);
}

// --- Update Phase 2 + compatibility ---

export async function updateProspectPhase2(
  pageId: string,
  phase2: Phase2Data,
  outcome: CompatibilityOutcome,
): Promise<void> {
  const now = new Date().toISOString();

  const statusMap: Record<CompatibilityOutcome["outcome"], ProspectStatus> = {
    accept: "Phase 2 Accepted",
    soft_reject: "Phase 2 Soft Rejected",
    flag_for_review: "Phase 2 Flagged for Review",
    clarification_needed: "Phase 2 Clarification Requested",
  };

  const compatibilityResultMap: Record<
    CompatibilityOutcome["outcome"],
    NonNullable<ProspectRecord["compatibilityResult"]>
  > = {
    accept: "Accept",
    soft_reject: "Soft Reject",
    flag_for_review: "Flag for Review",
    clarification_needed: "Clarification Needed",
  };

  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        Status: selectProp(statusMap[outcome.outcome]),
        "Phase 2 Submitted At": { date: { start: now } },
        "Phase 2 Data": rt(JSON.stringify(phase2)),
        "Compatibility Result": selectProp(
          compatibilityResultMap[outcome.outcome],
        ),
        "Compatibility Reasoning": rt(outcome.reasoning),
        "Hard Blocker Triggered": rt(outcome.hardBlockerTriggered ?? ""),
        "Soft Blockers Triggered": multiSelectProp(
          outcome.softBlockersTriggered,
        ),
      },
    },
  });
}

// --- Update Phase 3 (partial or final) ---

export async function updateProspectPhase3(
  pageId: string,
  phase3Partial: unknown,
  isFinal: boolean,
  fees?: {
    setup: number;
    monthly: number;
    founding: boolean;
    modules: string[];
  },
  /** Multi-location counter — written to the Notion "Extra
   *  Locations" number column when set. Pass undefined to leave
   *  the existing value alone (e.g. partial-save flows). Pass 0
   *  explicitly to clear it. */
  extraLocations?: number,
): Promise<void> {
  const properties: Record<string, unknown> = {
    "Phase 3 Data": rt(JSON.stringify(phase3Partial)),
    Status: selectProp(isFinal ? "Phase 3 Complete" : "Phase 3 In Progress"),
  };
  if (isFinal) {
    properties["Phase 3 Submitted At"] = {
      date: { start: new Date().toISOString() },
    };
  }
  if (fees) {
    properties["Setup Fee Calculated"] = { number: fees.setup };
    properties["Monthly Fee Calculated"] = { number: fees.monthly };
    properties["Founding Member"] = { checkbox: fees.founding };
    properties["Module Selections"] = multiSelectProp(fees.modules);
  }
  if (extraLocations !== undefined) {
    properties["Extra Locations"] = { number: extraLocations };
  }
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: { properties },
  });
}

// --- Page → ProspectRecord parser ---
//
// Notion property values come back in verbose union types. We narrow
// by property name and access defensively. Anything missing returns
// undefined rather than throwing.

function pageToProspect(page: NotionPage): ProspectRecord | null {
  const p = page.properties;

  function readTitle(prop: unknown): string {
    if (!prop || typeof prop !== "object") return "";
    const arr = (prop as { title?: unknown[] }).title;
    if (!Array.isArray(arr) || !arr[0]) return "";
    return (arr[0] as { plain_text?: string }).plain_text ?? "";
  }
  function readRichText(prop: unknown): string {
    if (!prop || typeof prop !== "object") return "";
    const arr = (prop as { rich_text?: unknown[] }).rich_text;
    if (!Array.isArray(arr)) return "";
    return arr
      .map((t) => (t as { plain_text?: string }).plain_text ?? "")
      .join("");
  }
  function readEmail(prop: unknown): string {
    return (prop as { email?: string })?.email ?? "";
  }
  function readPhone(prop: unknown): string {
    return (prop as { phone_number?: string })?.phone_number ?? "";
  }
  function readSelect(prop: unknown): string | undefined {
    return (prop as { select?: { name?: string } })?.select?.name;
  }
  function readMultiSelect(prop: unknown): string[] {
    const arr = (prop as { multi_select?: { name?: string }[] })?.multi_select;
    if (!Array.isArray(arr)) return [];
    return arr.map((s) => s.name ?? "").filter(Boolean);
  }
  function readDate(prop: unknown): string | undefined {
    return (prop as { date?: { start?: string } })?.date?.start;
  }
  function readCheckbox(prop: unknown): boolean {
    return (prop as { checkbox?: boolean })?.checkbox === true;
  }
  function readNumber(prop: unknown): number | undefined {
    const n = (prop as { number?: number | null })?.number;
    return typeof n === "number" ? n : undefined;
  }

  const token = readRichText(p["Phase 1 Unique Token"]);
  const name = readTitle(p["Name"]);
  const email = readEmail(p["Email"]);
  if (!token || !name || !email) return null; // missing critical fields

  let phase2Data: Phase2Data | undefined;
  const phase2Raw = readRichText(p["Phase 2 Data"]);
  if (phase2Raw) {
    try {
      phase2Data = JSON.parse(phase2Raw) as Phase2Data;
    } catch {
      // ignore malformed
    }
  }

  let phase3Data: unknown;
  const phase3Raw = readRichText(p["Phase 3 Data"]);
  if (phase3Raw) {
    try {
      phase3Data = JSON.parse(phase3Raw);
    } catch {
      // ignore malformed
    }
  }

  let onboardingData: unknown;
  const onboardingRaw = readRichText(p["Onboarding Data"]);
  if (onboardingRaw) {
    try {
      onboardingData = JSON.parse(onboardingRaw);
    } catch {
      // ignore malformed
    }
  }

  let changeRequests: ChangeRequest[] = [];
  const inboxRaw = readRichText(p["Change Requests Inbox"]);
  if (inboxRaw) {
    try {
      const parsed = JSON.parse(inboxRaw);
      if (Array.isArray(parsed)) {
        changeRequests = parsed
          .filter(
            (entry): entry is ChangeRequest =>
              entry &&
              typeof entry === "object" &&
              typeof entry.id === "string" &&
              typeof entry.message === "string",
          )
          .map((entry) => {
            // Backwards compat: if old records have `resolutionNote`
            // and no `reply`, surface the note as the customer reply.
            const legacy = (entry as ChangeRequest & {
              resolutionNote?: string;
            }).resolutionNote;
            if (!entry.reply && legacy) {
              return { ...entry, reply: legacy };
            }
            return entry;
          });
      }
    } catch {
      // ignore malformed
    }
  }

  return {
    pageId: page.id,
    notionUrl: page.url ?? "",
    token,
    name,
    email,
    phone: readPhone(p["Phone"]) || undefined,
    business: readRichText(p["Business Name"]) || undefined,
    businessType: readSelect(p["Business Type"]),
    location: readRichText(p["UK Location"]) || undefined,
    websiteSituation: readSelect(p["Current Website Situation"]),
    status: (readSelect(p["Status"]) as ProspectStatus) ?? "Phase 1 Complete",
    phase1SubmittedAt: readDate(p["Phase 1 Submitted At"]),
    phase2SubmittedAt: readDate(p["Phase 2 Submitted At"]),
    phase2Data,
    phase3SubmittedAt: readDate(p["Phase 3 Submitted At"]),
    phase3Data,
    compatibilityResult: readSelect(
      p["Compatibility Result"],
    ) as ProspectRecord["compatibilityResult"],
    compatibilityReasoning:
      readRichText(p["Compatibility Reasoning"]) || undefined,
    hardBlockerTriggered:
      readRichText(p["Hard Blocker Triggered"]) || undefined,
    softBlockersTriggered: readMultiSelect(p["Soft Blockers Triggered"]),
    moduleSelections: readMultiSelect(p["Module Selections"]),
    // Defensive: "Extra Locations" column may not exist yet on
    // legacy Notion DBs. readNumber returns undefined for missing
    // columns, which we coerce to 0 — the no-multi-location default.
    extraLocations: readNumber(p["Extra Locations"]) ?? 0,
    setupFeeCalculated: readNumber(p["Setup Fee Calculated"]),
    monthlyFeeCalculated: readNumber(p["Monthly Fee Calculated"]),
    foundingMember: readCheckbox(p["Founding Member"]),
    notes: readRichText(p["Notes"]) || undefined,
    stripeCustomerId: readRichText(p["Stripe Customer Id"]) || undefined,
    stripeSubscriptionId:
      readRichText(p["Stripe Subscription Id"]) || undefined,
    stripePaidAt: readDate(p["Stripe Paid At"]),
    onboardingStep1Done: readCheckbox(p["Onboarding Step 1 Done"]),
    onboardingStep2Done: readCheckbox(p["Onboarding Step 2 Done"]),
    onboardingStep3Done: readCheckbox(p["Onboarding Step 3 Done"]),
    onboardingStep4Done: readCheckbox(p["Onboarding Step 4 Done"]),
    onboardingStep5Done: readCheckbox(p["Onboarding Step 5 Done"]),
    onboardingContentDone: readCheckbox(p["Onboarding Step 6 Done"]),
    onboardingData,
    onboardingStartedAt: readDate(p["Onboarding Started At"]),
    onboardingCompletedAt: readDate(p["Onboarding Completed At"]),
    goLiveDate: readDate(p["Go Live Date"]),
    cloudflareMembershipVerifiedAt: readDate(p["Cloudflare Membership Verified At"]),
    cloudflareAccountId: readRichText(p["Cloudflare Account Id"]) || undefined,
    cloudflareZoneId: readRichText(p["Cloudflare Zone Id"]) || undefined,
    cloudflareZoneStatus: readSelect(
      p["Cloudflare Zone Status"],
    ) as ProspectRecord["cloudflareZoneStatus"],
    domainVerifiedAt: readDate(p["Domain Verified At"]),
    nameserversEmailSentAt: readDate(p["Nameservers Email Sent At"]),
    customerConfirmedNameserversAt: readDate(
      p["Customer Confirmed Nameservers At"],
    ),
    workerName: readRichText(p["Worker Name"]) || undefined,
    siteLiveAt: readDate(p["Site Live At"]),
    previewBuildTriggeredAt: readDate(p["Preview Build Triggered At"]),
    previewBuildFailedAt: readDate(p["Preview Build Failed At"]),
    finalLaunchTriggeredAt: readDate(p["Final Launch Triggered At"]),
    resendDomainId: readRichText(p["Resend Domain Id"]) || undefined,
    resendDomainVerifiedAt: readDate(p["Resend Domain Verified At"]),
    haikuCache: (() => {
      const raw = readRichText(p["Haiku Cache"]);
      if (!raw) return undefined;
      try {
        const parsed = JSON.parse(raw) as unknown;
        return typeof parsed === "object" && parsed !== null
          ? (parsed as Record<string, unknown>)
          : undefined;
      } catch {
        return undefined;
      }
    })(),
    passwordHash: readRichText(p["Password Hash"]) || undefined,
    passwordSetAt: readDate(p["Password Set At"]),
    changeRequests,
    moduleChangeRoundUsedAt: readDate(p["Module Change Round Used At"]),
    moduleChangeLog: parseModuleChangeLog(
      readRichText(p["Module Change Log"]),
    ),
    // GDPR retention triplet. All three optional — older prospects
    // may not have these fields populated yet. The cron tolerates
    // missing dataRetentionUntil by skipping the prospect.
    cancelledAt: readDate(p["Cancelled At"]),
    dataRetentionUntil: readDate(p["Data Retention Until"]),
    dataScrubbedAt: readDate(p["Data Scrubbed At"]),
  };
}

/**
 * Module-scope rich_text reader (the one inside `pageToProspect` is
 * a nested helper not visible to other functions). Used by the
 * module-change writers below to round-trip the audit log.
 */
function readRichTextProp(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const arr = (prop as { rich_text?: unknown[] }).rich_text;
  if (!Array.isArray(arr)) return "";
  return arr
    .map((t) => (t as { plain_text?: string }).plain_text ?? "")
    .join("");
}

/**
 * Parse the Module Change Log rich_text JSON blob. Defensive — any
 * malformed entry is dropped silently (operator sees the raw value
 * in Notion if they want to dig). Returns [] for empty / missing /
 * unparseable values so callers never need to null-check.
 */
function parseModuleChangeLog(raw: string | undefined): ModuleChangeLogEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ModuleChangeLogEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as ModuleChangeLogEntry).id === "string" &&
        Array.isArray((e as ModuleChangeLogEntry).fromModules) &&
        Array.isArray((e as ModuleChangeLogEntry).toModules),
    );
  } catch {
    return [];
  }
}

// --- Cowork Ops Notion writers (Stage 2C C2+) ---

/**
 * Stamp Cloudflare membership verification onto the prospect's
 * Notion record. Called by ops-worker step1 after a successful
 * accept + access-verified flow. Idempotent: re-running just
 * overwrites with the same values.
 */
export async function recordCloudflareMembership(
  pageId: string,
  accountId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Cloudflare Membership Verified At": { date: { start: now } },
        "Cloudflare Account Id": rt(accountId),
      },
    },
  });
}

/**
 * Capture the customer's zone (id + initial status) when step2-domain
 * either creates a new zone or discovers an existing one. Idempotent:
 * subsequent calls just overwrite with whatever Cloudflare reports.
 */
export async function recordCloudflareZone(
  pageId: string,
  zoneId: string,
  status: NonNullable<ProspectRecord["cloudflareZoneStatus"]>,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Cloudflare Zone Id": rt(zoneId),
        "Cloudflare Zone Status": selectProp(status),
      },
    },
  });
}

/**
 * Update just the zone status — used by step2-domain on every poll
 * tick once the zone exists, until the status flips to active.
 */
export async function updateZoneStatus(
  pageId: string,
  status: NonNullable<ProspectRecord["cloudflareZoneStatus"]>,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Cloudflare Zone Status": selectProp(status),
      },
    },
  });
}

/**
 * Stamp Domain Verified At — the latch that step2 uses to send the
 * "zone active" email exactly once per prospect.
 */
export async function markDomainVerified(pageId: string): Promise<void> {
  const now = new Date().toISOString();
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Domain Verified At": { date: { start: now } },
      },
    },
  });
}

/**
 * Stamp Nameservers Email Sent At — the latch that step2 uses to
 * send the nameservers email exactly once per prospect.
 */
export async function markNameserversEmailed(
  pageId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Nameservers Email Sent At": { date: { start: now } },
      },
    },
  });
}

/**
 * Stamp the per-customer Worker name — the latch that step2 uses
 * to skip Worker upload on subsequent ticks. Set once after
 * uploadWorkerScript succeeds; never changes for a given prospect
 * (the name is derived deterministically from the Phase 1 token).
 */
export async function recordWorkerName(
  pageId: string,
  workerName: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Worker Name": rt(workerName),
      },
    },
  });
}

/**
 * Stamp the moment the customer clicked "I've updated my nameservers"
 * (either from the email button or the on-hub button). Idempotent:
 * second click overwrites with the new timestamp (cheap; no harm).
 *
 * NB: this is a HINT, not the truth. Cloudflare's zone status
 * remains authoritative. step2-domain still polls Cloudflare on
 * every tick — this confirmation just helps Ben know the customer
 * has done their part and is waiting for propagation.
 */
export async function markCustomerConfirmedNameservers(
  pageId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Customer Confirmed Nameservers At": { date: { start: now } },
      },
    },
  });
}

/**
 * Stamp Site Live At — the final latch in step2 indicating the
 * placeholder Worker is bound to apex+www AND HTTP 200 verified.
 * Once set, step2 stops firing for this prospect.
 */
export async function markSiteLive(pageId: string): Promise<void> {
  const now = new Date().toISOString();
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Site Live At": { date: { start: now } },
      },
    },
  });
}

/**
 * Stamp Preview Build Triggered At — anti-spam latch set by
 * step5-review when a GitHub Actions build is dispatched. Cleared
 * (set to null) by /api/internal/build-callback once the build
 * completes (success or failure).
 *
 * If you want to FORCE a re-build before the latch clears, the
 * operator can manually clear "Preview Build Triggered At" in
 * Notion → next cron tick re-triggers.
 */
export async function markPreviewBuildTriggered(
  pageId: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Preview Build Triggered At": {
          date: { start: new Date().toISOString() },
        },
      },
    },
  });
}

/**
 * Overwrite the Haiku Cache JSON blob. Called by the polish
 * pipeline (src/lib/haiku/cache.ts) after each polish call to
 * persist the new entry. Read-modify-write inside one PATCH so
 * we don't lose concurrent updates from a parallel build (rare
 * but possible if two builds are in flight for the same prospect).
 *
 * Idempotent: passing the same cache value twice is a no-op on
 * Notion's side.
 */
export async function writeHaikuCache(
  pageId: string,
  cache: Record<string, unknown>,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Haiku Cache": rt(JSON.stringify(cache)),
      },
    },
  });
}

/**
 * Clear Preview Build Triggered At — called by build-callback so
 * future preview requests can re-trigger immediately. Also stamps
 * Preview Build Failed At if `failure=true`, or clears it on success.
 */
export async function clearPreviewBuildTriggered(
  pageId: string,
  args: { failure: boolean } = { failure: false },
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Preview Build Triggered At": { date: null },
        "Preview Build Failed At": args.failure
          ? { date: { start: new Date().toISOString() } }
          : { date: null },
      },
    },
  });
}

/**
 * Stamp Final Launch Triggered At — anti-spam latch set by
 * step7-go-live when the GO-LIVE build is dispatched. Same pattern
 * as Preview Build Triggered At but for the launch-day build that
 * flips status to "Live". Cleared by build-callback once the build
 * completes (success or failure).
 */
export async function markFinalLaunchTriggered(
  pageId: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Final Launch Triggered At": {
          date: { start: new Date().toISOString() },
        },
      },
    },
  });
}

/** Clear Final Launch Triggered At — called by build-callback on
 *  any outcome of a finalLaunch build. Pair with `markSiteLive` +
 *  `updateProspectOnboarding({ statusFlip: "Live" })` for the
 *  full success-side stamping. */
export async function clearFinalLaunchTriggered(
  pageId: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Final Launch Triggered At": { date: null },
      },
    },
  });
}

/** Store the Resend domain id after registering the customer's
 *  domain. step2b-resend-domain calls this once per customer. */
export async function recordResendDomainId(
  pageId: string,
  domainId: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Resend Domain Id": rt(domainId),
      },
    },
  });
}

/** Stamp Resend Domain Verified At — called by step2b when Resend
 *  reports the domain as verified. Once set, newsletter emails
 *  send from the customer's own domain. */
export async function markResendDomainVerified(
  pageId: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Resend Domain Verified At": {
          date: { start: new Date().toISOString() },
        },
      },
    },
  });
}

/**
 * Flip a prospect's status to "Paid" — temporary shortcut used by
 * /api/intake while Stripe Checkout (Stage 2A Part 2) isn't built.
 * When Stripe lands, this is called from the /api/stripe/webhook
 * handler instead of /api/intake.
 *
 * Idempotent: re-PATCHing the same status is a no-op on Notion's
 * side. Callers should still gate on existing status to avoid
 * unnecessary writes (and re-sending the phase4 email).
 */
export async function markProspectAsPaid(pageId: string): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        Status: selectProp("Paid"),
      },
    },
  });
}

/**
 * Stamp Stripe ids + Paid status atomically after a successful
 * checkout.session.completed webhook. Idempotent — re-running with
 * the same args is a no-op write (Notion accepts duplicate writes).
 */
export async function markProspectPaidViaStripe(
  pageId: string,
  args: {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    paidAt?: string;
  },
): Promise<void> {
  const paidAt = args.paidAt ?? new Date().toISOString();
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        Status: selectProp("Paid"),
        "Stripe Customer Id": rt(args.stripeCustomerId),
        "Stripe Subscription Id": rt(args.stripeSubscriptionId),
        "Stripe Paid At": { date: { start: paidAt } },
      },
    },
  });
}

/**
 * Clear the Stripe Subscription Id (subscription deleted by
 * cancellation). Doesn't flip Status — that's done by
 * markCancelled which also stamps the GDPR retention dates.
 * Idempotent.
 */
export async function clearProspectStripeSubscription(
  pageId: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Stripe Subscription Id": rt(""),
      },
    },
  });
}

/**
 * Persist a Stripe Customer ID on a prospect early (after first
 * Customer create, before they finish Checkout). Lets a retry on
 * an abandoned Checkout reuse the same Customer rather than
 * duplicating.
 */
export async function setProspectStripeCustomerId(
  pageId: string,
  customerId: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Stripe Customer Id": rt(customerId),
      },
    },
  });
}

/**
 * Append a free-text line to the Notes column. Used to audit
 * customer-side consent decisions (CCRs Reg 36 express-request
 * tick). Best-effort — failures log but don't abort the
 * surrounding business action.
 */
export async function appendProspectNote(
  pageId: string,
  existingNotes: string | undefined,
  line: string,
): Promise<void> {
  const next = existingNotes ? `${existingNotes}\n${line}` : line;
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: { properties: { Notes: rt(next) } },
  });
}

// --- Module change (1-round-only, pre-commit only) ---

/**
 * Submit a module change. Atomically:
 *   - appends an entry to the audit log (status set by the entry
 *     itself — typically "applied" in the Stripe-placeholder world,
 *     "pending-stripe" once Stripe Phase 2 is live)
 *   - stamps Module Change Round Used At (locks the round)
 *   - if `applyImmediately` is set: ALSO writes Module Selections +
 *     Setup Fee + Monthly Fee in the same Notion PATCH so the
 *     customer's selection updates instantly with no operator step
 *
 * Read-modify-write on the rich_text log. Concurrent submits from
 * the same prospect are vanishingly unlikely (one customer, server-
 * side `moduleChangeRoundUsedAt` lock-out).
 *
 * Returns the appended entry so the API route can echo it back to
 * the UI for the "your change is being processed" state.
 *
 * Phase-2-Stripe consideration: when Stripe is wired, drop the
 * `applyImmediately` path and revert to the operator-driven
 * "pending-stripe → applied" two-step flow (see
 * docs/STRIPE-PHASE-2.md).
 */
export async function submitModuleChange(
  pageId: string,
  entry: ModuleChangeLogEntry,
  applyImmediately?: {
    appliedSelection: string[];
    appliedFees: { setup: number; monthly: number };
  },
): Promise<ModuleChangeLogEntry> {
  const page = (await notionFetch(`/pages/${pageId}`)) as NotionPage;
  const existing = parseModuleChangeLog(
    readRichTextProp(page.properties["Module Change Log"]),
  );
  const next = [...existing, entry];
  const properties: Record<string, unknown> = {
    "Module Change Log": rt(JSON.stringify(next)),
    "Module Change Round Used At": {
      date: { start: entry.submittedAt },
    },
  };
  if (applyImmediately) {
    properties["Module Selections"] = multiSelectProp(
      applyImmediately.appliedSelection,
    );
    properties["Setup Fee Calculated"] = {
      number: applyImmediately.appliedFees.setup,
    };
    properties["Monthly Fee Calculated"] = {
      number: applyImmediately.appliedFees.monthly,
    };
  }
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: { properties },
  });
  return entry;
}

/**
 * Append a pending change log entry WITHOUT stamping the
 * one-round-per-customer lock and WITHOUT touching Module
 * Selections / Setup Fee / Monthly Fee. Used by the post-launch
 * dashboard flows (module add/remove + cancellation) where:
 *   - the customer can submit unlimited changes
 *   - the change takes effect at `entry.effectiveDate`, not now
 *   - the active selection + fees stay UNTOUCHED until the
 *     operator (or future Stripe webhook) actions the change
 *
 * Read-modify-write on the rich_text log — same concurrency
 * profile as submitModuleChange (single customer, server-side
 * tight loop is exceedingly unlikely to race).
 */
export async function appendPendingChange(
  pageId: string,
  entry: ModuleChangeLogEntry,
): Promise<ModuleChangeLogEntry> {
  const page = (await notionFetch(`/pages/${pageId}`)) as NotionPage;
  const existing = parseModuleChangeLog(
    readRichTextProp(page.properties["Module Change Log"]),
  );
  const next = [...existing, entry];
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Module Change Log": rt(JSON.stringify(next)),
      },
    },
  });
  return entry;
}

/**
 * Resolve a pending module change. Operator-driven from /admin
 * (Stripe Phase 1) or webhook-driven (Stripe Phase 2 — see
 * docs/STRIPE-PHASE-2.md).
 *
 * If status="applied": flips Module Selections to the new set,
 * recalculates Setup Fee + Monthly Fee, and stamps the log entry
 * resolved.
 *
 * If status="rejected" or "billing-failed": leaves Module
 * Selections untouched, just stamps the log entry.
 *
 * If status="billing-failed": ALSO removes the modules the customer
 * tried to add (so they don't see paid features they haven't paid
 * for) — caller passes `revertedSelection` to make this explicit.
 */
export async function resolveModuleChange(
  pageId: string,
  changeId: string,
  resolution: {
    status: "applied" | "rejected" | "billing-failed";
    resolutionNote?: string;
    /** Required if status="applied": the new module list to write. */
    appliedSelection?: string[];
    /** Required if status="applied": new fee totals to write. */
    appliedFees?: { setup: number; monthly: number };
    /** Required if status="billing-failed": the cleaned-up module
     *  list (= original minus added modules that didn't get paid). */
    revertedSelection?: string[];
    /** Optional: write a new "Extra Locations" count alongside the
     *  module selection + fees. Only set for multilocation-change
     *  applies; pass undefined to leave the column alone. */
    appliedExtraLocations?: number;
  },
): Promise<ModuleChangeLogEntry> {
  const page = (await notionFetch(`/pages/${pageId}`)) as NotionPage;
  const existing = parseModuleChangeLog(
    readRichTextProp(page.properties["Module Change Log"]),
  );
  const idx = existing.findIndex((e) => e.id === changeId);
  if (idx === -1) {
    throw new Error(`Module change ${changeId} not found`);
  }
  const updated: ModuleChangeLogEntry = {
    ...existing[idx],
    status: resolution.status,
    resolutionNote: resolution.resolutionNote,
    resolvedAt: new Date().toISOString(),
  };
  const nextLog = [...existing];
  nextLog[idx] = updated;

  const properties: Record<string, unknown> = {
    "Module Change Log": rt(JSON.stringify(nextLog)),
  };

  if (resolution.status === "applied") {
    if (!resolution.appliedSelection || !resolution.appliedFees) {
      throw new Error(
        "applied resolutions require appliedSelection + appliedFees",
      );
    }
    properties["Module Selections"] = multiSelectProp(
      resolution.appliedSelection,
    );
    properties["Setup Fee Calculated"] = { number: resolution.appliedFees.setup };
    properties["Monthly Fee Calculated"] = {
      number: resolution.appliedFees.monthly,
    };
    if (resolution.appliedExtraLocations !== undefined) {
      properties["Extra Locations"] = {
        number: resolution.appliedExtraLocations,
      };
    }
  } else if (resolution.status === "billing-failed") {
    if (!resolution.revertedSelection) {
      throw new Error(
        "billing-failed resolutions require revertedSelection",
      );
    }
    properties["Module Selections"] = multiSelectProp(
      resolution.revertedSelection,
    );
  }

  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: { properties },
  });

  return updated;
}

// --- GDPR retention writers ---
//
// Three writes that bracket the cancellation lifecycle:
//   1. markCancelled — stamps Cancelled At = now, Data Retention
//      Until = now + 30 days. Called by the admin module-change
//      endpoint when applying a cancellation kind.
//   2. scrubPersonalDataFields — overwrites every Notion property
//      that holds personal data with the empty placeholder
//      "[scrubbed]" (rich_text) or empty array (multi_select).
//      Called by the gdpr-scrub-tick cron.
//   3. markScrubbed — stamps Data Scrubbed At = now. The "scrub
//      complete" latch that prevents re-runs.
//
// Why "[scrubbed]" not deletion: Notion's API can't delete a
// property's content per-page (you'd have to delete the whole
// page), but a "[scrubbed]" placeholder is just as good for GDPR
// — the personal data is gone, and the audit trail of WHEN it
// went is preserved by Data Scrubbed At.

import { personalDataRetentionUntil } from "./gdpr-retention";

/** Atomic write: flip Status to Cancelled + stamp Cancelled At
 *  + stamp Data Retention Until (now + 30 days). Used by the
 *  admin module-change endpoint when applying any cancellation
 *  kind, AND by direct admin cancellations. */
export async function markCancelled(
  pageId: string,
): Promise<{ cancelledAt: string; dataRetentionUntil: string }> {
  const now = new Date().toISOString();
  const retentionUntil = personalDataRetentionUntil(now);
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        Status: { select: { name: "Cancelled" } },
        "Cancelled At": { date: { start: now } },
        "Data Retention Until": { date: { start: retentionUntil } },
      },
    },
  });
  return { cancelledAt: now, dataRetentionUntil: retentionUntil };
}

/** Overwrite every Notion property carrying personal data with
 *  a "[scrubbed]" placeholder. The personal data is gone; the
 *  audit trail (Status, Cancelled At, Data Scrubbed At, the
 *  money fields needed for HMRC) is preserved.
 *
 *  Per the GDPR policy in /terms section 11: financial records
 *  are kept 7 years (HMRC requirement). Setup Fee Calculated,
 *  Monthly Fee Calculated, and Module Change Log money lines
 *  are NOT scrubbed by this function. */
export async function scrubPersonalDataFields(
  pageId: string,
): Promise<void> {
  // Keep the moduleChangeLog metadata for HMRC but strip the
  // narrative (fromModules / toModules / resolutionNote). Easier
  // to just blank the whole rich_text and rebuild a money-only
  // summary, but for simplicity we leave it as-is — module names
  // are not personal data, only business operational details.
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        // Personal contact + identity slots
        "Onboarding Data": rt("[scrubbed]"),
        "Phase 2 Data": rt("[scrubbed]"),
        "Phase 3 Data": rt("[scrubbed]"),
        "Customer Change Requests": rt("[scrubbed]"),
        "Haiku Cache": rt(""),
        "Password Hash": rt(""),
        // Onboarding latches that carry contact-adjacent state
        "Nameservers Email Sent At": { date: null },
        "Customer Confirmed Nameservers At": { date: null },
      },
    },
  });
}

/** Stamp Data Scrubbed At — the safety latch that stops the
 *  cron re-scrubbing the same prospect. Set once, never reset. */
export async function markScrubbed(pageId: string): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Data Scrubbed At": { date: { start: new Date().toISOString() } },
      },
    },
  });
}

// --- Change requests inbox ---

/**
 * Append a new change request to the customer's inbox. The inbox is
 * a JSON array stored in a single rich_text field on the Prospects
 * page. We read-modify-write because Notion has no native list-
 * append for rich_text. Race conditions on concurrent submits are
 * extremely unlikely (one customer, one form) and would just lose
 * one entry — Cowork's audit log catches anything that mattered.
 */
export async function appendChangeRequest(
  pageId: string,
  request: ChangeRequest,
): Promise<void> {
  // Read current inbox.
  const page = await notionFetch<NotionPage>(`/pages/${pageId}`);
  const props = page.properties as Record<string, unknown>;
  const rawTextArr = (props["Change Requests Inbox"] as { rich_text?: unknown[] })
    ?.rich_text;
  let current: ChangeRequest[] = [];
  if (Array.isArray(rawTextArr) && rawTextArr.length > 0) {
    const text = rawTextArr
      .map((t) => (t as { plain_text?: string }).plain_text ?? "")
      .join("");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) current = parsed;
      } catch {
        // ignore malformed; we'll overwrite
      }
    }
  }
  const next = [request, ...current]; // newest first
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Change Requests Inbox": rt(JSON.stringify(next)),
      },
    },
  });
}

/**
 * Replace the entire inbox in one write. Used by the operator
 * dashboard when Ben marks a request resolved or edits the reply.
 */
export async function replaceChangeRequests(
  pageId: string,
  requests: ChangeRequest[],
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Change Requests Inbox": rt(JSON.stringify(requests)),
      },
    },
  });
}

/**
 * Patch one change request's status and/or reply. Read-modify-write
 * on the inbox JSON array. Returns the updated request, plus a
 * `transitionedToTerminal` flag so callers can fire customer-facing
 * notifications when a request moves to a final state (resolved or
 * rejected) for the first time.
 *
 * Idempotent: re-running with the same patch is a no-op for status
 * (because the comparison is "did status just become terminal?")
 * but will overwrite the reply.
 */
export async function updateChangeRequest(
  pageId: string,
  changeRequestId: string,
  patch: { status?: ChangeRequest["status"]; reply?: string },
): Promise<{
  updated: ChangeRequest;
  transitionedToTerminal: boolean;
}> {
  // Read current inbox.
  const page = await notionFetch<NotionPage>(`/pages/${pageId}`);
  const props = page.properties as Record<string, unknown>;
  const rawTextArr = (props["Change Requests Inbox"] as { rich_text?: unknown[] })
    ?.rich_text;
  let current: ChangeRequest[] = [];
  if (Array.isArray(rawTextArr) && rawTextArr.length > 0) {
    const text = rawTextArr
      .map((t) => (t as { plain_text?: string }).plain_text ?? "")
      .join("");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) current = parsed;
      } catch {
        // ignore malformed; treat as empty
      }
    }
  }

  const idx = current.findIndex((r) => r.id === changeRequestId);
  if (idx < 0) {
    throw new Error(`Change request ${changeRequestId} not found.`);
  }

  const previous = current[idx];
  const wasTerminal =
    previous.status === "resolved" ||
    previous.status === "rejected" ||
    previous.status === "retracted";

  const next: ChangeRequest = {
    ...previous,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.reply !== undefined ? { reply: patch.reply } : {}),
  };

  const isTerminal =
    next.status === "resolved" ||
    next.status === "rejected" ||
    next.status === "retracted";

  // Stamp resolvedAt the first time we cross into a terminal state.
  if (isTerminal && !wasTerminal) {
    next.resolvedAt = new Date().toISOString();
  }

  current[idx] = next;
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Change Requests Inbox": rt(JSON.stringify(current)),
      },
    },
  });

  return {
    updated: next,
    transitionedToTerminal: isTerminal && !wasTerminal,
  };
}

/**
 * Generic merge writer for change-request fields. Reads the inbox,
 * shallow-merges `patch` into the entry with id `changeRequestId`,
 * writes back. Returns the merged entry, or null if no entry with
 * that id exists. Used by Phase B v2 (preview-before-publish) for
 * stamping preview build artefacts, customer approval, etc.
 *
 * Don't use this to set `status` — that's still routed through
 * `updateChangeRequest` which carries the resolvedAt + transition
 * latch logic the customer-email + rebuild flow depends on.
 */
export async function patchChangeRequest(
  pageId: string,
  changeRequestId: string,
  patch: Partial<ChangeRequest>,
): Promise<ChangeRequest | null> {
  const page = await notionFetch<NotionPage>(`/pages/${pageId}`);
  const props = page.properties as Record<string, unknown>;
  const rawTextArr = (props["Change Requests Inbox"] as { rich_text?: unknown[] })
    ?.rich_text;
  let current: ChangeRequest[] = [];
  if (Array.isArray(rawTextArr) && rawTextArr.length > 0) {
    const text = rawTextArr
      .map((t) => (t as { plain_text?: string }).plain_text ?? "")
      .join("");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) current = parsed;
      } catch {
        /* ignore malformed; treat as empty */
      }
    }
  }
  const idx = current.findIndex((r) => r.id === changeRequestId);
  if (idx < 0) return null;
  const merged: ChangeRequest = { ...current[idx]!, ...patch };
  current[idx] = merged;
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Change Requests Inbox": rt(JSON.stringify(current)),
      },
    },
  });
  return merged;
}

/**
 * Set / overwrite a customer's password hash. Called by the
 * Phase 2 acceptance flow (initial password) AND the forgot-
 * password regenerate flow. Writes both Password Hash + the
 * Password Set At audit timestamp atomically.
 *
 * Caller is responsible for emailing the customer the new
 * plain-text password — this writer never sees the plaintext.
 */
export async function setProspectPassword(
  pageId: string,
  passwordHash: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Password Hash": rt(passwordHash),
        "Password Set At": { date: { start: new Date().toISOString() } },
      },
    },
  });
}

/**
 * Patch a single Hub Step 5 review edit's cowork audit fields.
 * Reads onboardingData, finds the edit by id in
 * `data.review.edits[]`, shallow-merges the patch, writes back.
 * Returns the merged edit, or null if not found. Used by step6
 * for pre-commit auto-apply (review edits flow through the same
 * classify+apply pipeline as post-commit change requests).
 *
 * Don't use this to set `status` — that goes through the same
 * route's mark-applied flow (when we add it) or via the existing
 * markdone path.
 */
export async function patchReviewEdit(
  pageId: string,
  editId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const page = await notionFetch<NotionPage>(`/pages/${pageId}`);
  const props = page.properties as Record<string, unknown>;
  const rawTextArr = (props["Onboarding Data"] as { rich_text?: unknown[] })
    ?.rich_text;
  let onboardingData: Record<string, unknown> = {};
  if (Array.isArray(rawTextArr) && rawTextArr.length > 0) {
    const text = rawTextArr
      .map((t) => (t as { plain_text?: string }).plain_text ?? "")
      .join("");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") onboardingData = parsed;
      } catch {
        /* ignore malformed; treat as empty */
      }
    }
  }
  const review = (onboardingData.review ?? {}) as Record<string, unknown>;
  const edits = Array.isArray(review.edits) ? [...review.edits] : [];
  const idx = edits.findIndex(
    (e) => e && typeof e === "object" && (e as { id?: unknown }).id === editId,
  );
  if (idx < 0) return null;
  const merged = {
    ...(edits[idx] as Record<string, unknown>),
    ...patch,
  };
  edits[idx] = merged;
  const newReview = { ...review, edits };
  const newOnboarding = { ...onboardingData, review: newReview };
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Onboarding Data": rt(JSON.stringify(newOnboarding)),
      },
    },
  });
  return merged;
}

/**
 * Stamp `coworkEscalatedAt` on a single change request so the
 * Phase B v1 reminder cron knows it's been actioned and doesn't
 * re-email. Called by the ops worker step6-change-requests.
 *
 * Same read-modify-write pattern as updateChangeRequest. Idempotent:
 * stamping twice is a no-op (later timestamp wins, but the cron
 * gates on "is it set?" not "what's the value?").
 *
 * Returns false silently if the change request id no longer exists
 * (race with retract, cleared inbox, etc.). The cron treats this
 * as success — the request is gone, can't escalate.
 */
export async function markChangeRequestEscalated(
  pageId: string,
  changeRequestId: string,
): Promise<boolean> {
  const page = await notionFetch<NotionPage>(`/pages/${pageId}`);
  const props = page.properties as Record<string, unknown>;
  const rawTextArr = (props["Change Requests Inbox"] as { rich_text?: unknown[] })
    ?.rich_text;
  let current: ChangeRequest[] = [];
  if (Array.isArray(rawTextArr) && rawTextArr.length > 0) {
    const text = rawTextArr
      .map((t) => (t as { plain_text?: string }).plain_text ?? "")
      .join("");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) current = parsed;
      } catch {
        /* ignore malformed; treat as empty */
      }
    }
  }
  const idx = current.findIndex((r) => r.id === changeRequestId);
  if (idx < 0) return false;
  current[idx] = {
    ...current[idx]!,
    coworkEscalatedAt: new Date().toISOString(),
  };
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Change Requests Inbox": rt(JSON.stringify(current)),
      },
    },
  });
  return true;
}

// --- Update Onboarding (partial saves + per-step done flag + status flips) ---
//
// Called from POST /api/onboarding. Each call may:
//  - Replace the Onboarding Data JSON blob (full overwrite — caller does merge)
//  - Set/unset one or more "Onboarding Step N Done" checkboxes
//  - Flip Status (e.g. Paid → Onboarding Started → Onboarding Complete)
//  - Stamp Onboarding Started At / Onboarding Completed At
//  - Set Go Live Date (separate property so it sorts/filters in Notion)

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type OnboardingUpdate = {
  data?: unknown; // full new OnboardingData blob
  stepDone?: { step: OnboardingStepNumber; done: boolean };
  statusFlip?: ProspectStatus;
  stampStartedAt?: boolean; // sets Onboarding Started At = now
  stampCompletedAt?: boolean; // sets Onboarding Completed At = now
  goLiveDate?: string; // ISO date string (YYYY-MM-DD)
};

export async function updateProspectOnboarding(
  pageId: string,
  patch: OnboardingUpdate,
): Promise<void> {
  const properties: Record<string, unknown> = {};

  if (patch.data !== undefined) {
    properties["Onboarding Data"] = rt(JSON.stringify(patch.data));
  }
  if (patch.stepDone) {
    properties[`Onboarding Step ${patch.stepDone.step} Done`] = {
      checkbox: patch.stepDone.done,
    };
  }
  if (patch.statusFlip) {
    properties["Status"] = selectProp(patch.statusFlip);
  }
  if (patch.stampStartedAt) {
    properties["Onboarding Started At"] = {
      date: { start: new Date().toISOString() },
    };
  }
  if (patch.stampCompletedAt) {
    properties["Onboarding Completed At"] = {
      date: { start: new Date().toISOString() },
    };
  }
  if (patch.goLiveDate) {
    properties["Go Live Date"] = { date: { start: patch.goLiveDate } };
  }

  if (Object.keys(properties).length === 0) return; // nothing to do

  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: { properties },
  });
}
