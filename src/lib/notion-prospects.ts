// Notion CRUD for the Prospects database.
//
// Uses notionFetch (REST) rather than @notionhq/client — see notion.ts
// for the rationale. Property payloads are constructed in Notion's
// standard JSON shape, exactly as the SDK would have built them.
//
// Schema (must match the Notion database exactly — Cowork created the
// schema via DDL in Phase B Checkpoint 2):
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
  notionUrl: string;
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
  };
}
