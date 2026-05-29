import { notionFetch } from "./notion";
import { getServerEnv } from "./env";

// --------------- Types ---------------

export type OpsException = {
  id: string;
  step: string;
  errorMessage: string;
  detectedAt: string;
  resolved: boolean;
  resolutionNotes: string;
  prospectName: string;
  prospectPageId: string;
};

export type OpsAuditEntry = {
  id: string;
  step: string;
  status: "ok" | "skip" | "fail";
  notes: string;
  durationMs: number;
  timestamp: string;
  prospectName: string;
};

type NotionPage = {
  id: string;
  properties: Record<string, unknown>;
};

type NotionQueryResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

// --------------- Notion property readers ---------------

function readTitle(prop: unknown): string {
  const p = prop as { title?: Array<{ plain_text?: string }> } | undefined;
  return p?.title?.[0]?.plain_text ?? "";
}

function readRichText(prop: unknown): string {
  const p = prop as {
    rich_text?: Array<{ plain_text?: string }>;
  } | undefined;
  return p?.rich_text?.[0]?.plain_text ?? "";
}

function readSelect(prop: unknown): string {
  const p = prop as { select?: { name?: string } | null } | undefined;
  return p?.select?.name ?? "";
}

function readCheckbox(prop: unknown): boolean {
  const p = prop as { checkbox?: boolean } | undefined;
  return p?.checkbox ?? false;
}

function readNumber(prop: unknown): number {
  const p = prop as { number?: number | null } | undefined;
  return p?.number ?? 0;
}

function readDate(prop: unknown): string {
  const p = prop as { date?: { start?: string } | null } | undefined;
  return p?.date?.start ?? "";
}

function readRelationName(prop: unknown): string {
  const p = prop as {
    relation?: Array<{ id?: string }>;
  } | undefined;
  return p?.relation?.[0]?.id ?? "";
}

// --------------- Exceptions ---------------

export async function listExceptions(opts?: {
  prospectPageId?: string;
  unresolvedOnly?: boolean;
  limit?: number;
}): Promise<OpsException[]> {
  const env = getServerEnv();
  const dbId = env.NOTION_EXCEPTIONS_DB_ID;
  if (!dbId) return [];

  const filters: unknown[] = [];
  if (opts?.prospectPageId) {
    filters.push({
      property: "Prospect",
      relation: { contains: opts.prospectPageId },
    });
  }
  if (opts?.unresolvedOnly) {
    filters.push({
      property: "Resolved",
      checkbox: { equals: false },
    });
  }

  const filter =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : { and: filters };

  const body: Record<string, unknown> = {
    sorts: [{ property: "Detected at", direction: "descending" }],
    page_size: opts?.limit ?? 50,
  };
  if (filter) body.filter = filter;

  const res = await notionFetch<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    { method: "POST", body },
  );

  return res.results.map((page) => {
    const p = page.properties;
    return {
      id: page.id,
      step: readSelect(p["Step"]),
      errorMessage: readRichText(p["Error message"]),
      detectedAt: readDate(p["Detected at"]),
      resolved: readCheckbox(p["Resolved"]),
      resolutionNotes: readRichText(p["Resolution notes"]),
      prospectName: readTitle(p["Name"]),
      prospectPageId: readRelationName(p["Prospect"]),
    };
  });
}

export async function countUnresolvedExceptions(): Promise<number> {
  const env = getServerEnv();
  const dbId = env.NOTION_EXCEPTIONS_DB_ID;
  if (!dbId) return 0;

  const res = await notionFetch<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: {
        filter: { property: "Resolved", checkbox: { equals: false } },
        page_size: 100,
      },
    },
  );
  return res.results.length;
}

// --------------- Audit Log ---------------

export async function listAuditEntries(opts?: {
  prospectPageId?: string;
  limit?: number;
}): Promise<OpsAuditEntry[]> {
  const env = getServerEnv();
  const dbId = env.NOTION_AUDIT_LOG_DB_ID;
  if (!dbId) return [];

  const filter = opts?.prospectPageId
    ? {
        property: "Prospect",
        relation: { contains: opts.prospectPageId },
      }
    : undefined;

  const body: Record<string, unknown> = {
    sorts: [{ property: "Timestamp", direction: "descending" }],
    page_size: opts?.limit ?? 50,
  };
  if (filter) body.filter = filter;

  const res = await notionFetch<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    { method: "POST", body },
  );

  return res.results.map((page) => {
    const p = page.properties;
    return {
      id: page.id,
      step: readSelect(p["Step"]),
      status: readSelect(p["Status"]) as "ok" | "skip" | "fail",
      notes: readRichText(p["Notes"]),
      durationMs: readNumber(p["Duration ms"]),
      timestamp: readDate(p["Timestamp"]),
      prospectName: readTitle(p["Name"]),
    };
  });
}

// --------------- Exception resolution ---------------

export async function resolveException(
  pageId: string,
  resolutionNotes: string,
): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        Resolved: { checkbox: true },
        "Resolution notes": {
          rich_text: [{ text: { content: resolutionNotes.slice(0, 2000) } }],
        },
      },
    },
  });
}

// --------------- Pending admin actions ---------------

export type PendingAdminAction = {
  type: "change-request" | "review-edit";
  prospectName: string;
  prospectToken: string;
  id: string;
  message: string;
  submittedAt: string;
};

export async function countRecentActions(hoursBack = 24): Promise<{
  total: number;
  ok: number;
  skip: number;
  fail: number;
}> {
  const env = getServerEnv();
  const dbId = env.NOTION_AUDIT_LOG_DB_ID;
  if (!dbId) return { total: 0, ok: 0, skip: 0, fail: 0 };

  const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString();

  const res = await notionFetch<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: {
        filter: {
          property: "Timestamp",
          date: { on_or_after: since },
        },
        page_size: 100,
      },
    },
  );

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const page of res.results) {
    const status = readSelect(page.properties["Status"]);
    if (status === "ok") ok++;
    else if (status === "skip") skip++;
    else if (status === "fail") fail++;
  }

  return { total: res.results.length, ok, skip, fail };
}
