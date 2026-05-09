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
  setupFeeCalculated?: number;
  monthlyFeeCalculated?: number;
  foundingMember: boolean;
  notes?: string;
  // --- Onboarding Hub (Stage 2B) ---
  onboardingStep1Done: boolean;
  onboardingStep2Done: boolean;
  onboardingStep3Done: boolean;
  onboardingStep4Done: boolean;
  onboardingStep5Done: boolean;
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
  /** Per-customer Worker name, captured by step2-domain after the placeholder Worker is uploaded. Latches "Worker exists in customer's CF account". */
  workerName?: string;
  /** ISO-8601, set when step2-domain has bound apex+www to the per-customer Worker AND verified the placeholder responds with HTTP 200. The "site is reachable" latch. */
  siteLiveAt?: string;
  // --- Customer dashboard (Stage 2D) ---
  changeRequests: ChangeRequest[];
  notionUrl: string;
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
export const MONTHLY_CHANGE_REQUEST_LIMIT = 3;

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
};

// --- Property helpers ---

function rt(text: string | undefined) {
  return text
    ? { rich_text: [{ type: "text" as const, text: { content: text } }] }
    : { rich_text: [] };
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

  const result = await notionFetch<NotionQueryResponse>(
    `/databases/${env.NOTION_PROSPECTS_DB_ID}/query`,
    {
      method: "POST",
      body: {
        filter: {
          or: [
            {
              property: "Status",
              select: { equals: "Onboarding Started" },
            },
            {
              property: "Status",
              select: { equals: "Onboarding Complete" },
            },
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
    setupFeeCalculated: readNumber(p["Setup Fee Calculated"]),
    monthlyFeeCalculated: readNumber(p["Monthly Fee Calculated"]),
    foundingMember: readCheckbox(p["Founding Member"]),
    notes: readRichText(p["Notes"]) || undefined,
    onboardingStep1Done: readCheckbox(p["Onboarding Step 1 Done"]),
    onboardingStep2Done: readCheckbox(p["Onboarding Step 2 Done"]),
    onboardingStep3Done: readCheckbox(p["Onboarding Step 3 Done"]),
    onboardingStep4Done: readCheckbox(p["Onboarding Step 4 Done"]),
    onboardingStep5Done: readCheckbox(p["Onboarding Step 5 Done"]),
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
    workerName: readRichText(p["Worker Name"]) || undefined,
    siteLiveAt: readDate(p["Site Live At"]),
    changeRequests,
  };
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

// --- Update Onboarding (partial saves + per-step done flag + status flips) ---
//
// Called from POST /api/onboarding. Each call may:
//  - Replace the Onboarding Data JSON blob (full overwrite — caller does merge)
//  - Set/unset one or more "Onboarding Step N Done" checkboxes
//  - Flip Status (e.g. Paid → Onboarding Started → Onboarding Complete)
//  - Stamp Onboarding Started At / Onboarding Completed At
//  - Set Go Live Date (separate property so it sorts/filters in Notion)

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5;

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
