// Cowork audit log writer.
//
// Each Step result (per dispatch.ts) gets one audit entry. Entries
// power Ben's `/admin/[token]` "Recent activity" feed (§9.3 #3) +
// the audit-feed enhancement on `/admin` (§9.2 — D3 work).
//
// Storage: a Notion DB called "Cowork Audit Log" with the schema
// below. The user creates this DB out-of-band and sets
// NOTION_AUDIT_LOG_DB_ID. If the env var is unset, this writer
// gracefully degrades to a stdout log line (visible in
// `wrangler tail`) so the ops worker still ticks while the user
// gets the DB set up.
//
// Notion schema for "Cowork Audit Log":
//   Title              (text, auto: "<step> <status> for <prospect.name>")
//   Prospect           (relation → Prospects DB)
//   Step               (select: step1 / step2 / step3 / step4 / step5)
//   Status             (select: ok / skip / fail)
//   Notes              (rich text, free-form)
//   Duration ms        (number)
//   Timestamp          (date with time)

import { notionFetch } from "../lib/notion";
import type { ServerEnv } from "../lib/env";
import type { AuditEntry } from "./types";

export async function writeAudit(
  env: ServerEnv,
  entry: AuditEntry,
): Promise<void> {
  const dbId = env.NOTION_AUDIT_LOG_DB_ID;
  if (!dbId) {
    // Graceful degradation: log to stdout so wrangler tail shows it.
    // Ben sees the message and knows to set NOTION_AUDIT_LOG_DB_ID.
    console.log(
      `[audit:no-db] ${entry.timestamp} ${entry.step} ${entry.result.status} prospect=${entry.prospect.name} (${entry.prospect.token}): ${noteFromResult(entry.result)} (${entry.durationMs}ms)`,
    );
    return;
  }

  const title = `${entry.step} ${entry.result.status} for ${entry.prospect.name}`;
  const notes = noteFromResult(entry.result);

  await notionFetch("/pages", {
    method: "POST",
    body: {
      parent: { database_id: dbId },
      properties: {
        Title: {
          title: [{ type: "text", text: { content: title } }],
        },
        Prospect: {
          relation: [{ id: entry.prospect.pageId }],
        },
        Step: {
          select: { name: entry.step },
        },
        Status: {
          select: { name: entry.result.status },
        },
        Notes: {
          rich_text: [{ type: "text", text: { content: notes } }],
        },
        "Duration ms": {
          number: entry.durationMs,
        },
        Timestamp: {
          date: { start: entry.timestamp },
        },
      },
    },
  });
}

function noteFromResult(r: AuditEntry["result"]): string {
  if (r.status === "ok") return r.notes ?? "(no notes)";
  if (r.status === "skip") return r.reason;
  return r.error.message;
}
