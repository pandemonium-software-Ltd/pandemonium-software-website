// Cowork exceptions writer.
//
// Fires when a Step's run() throws or returns { status: "fail" }
// (per dispatch.ts). Two side effects:
//   1. Write a Notion `Exceptions` DB entry (§4.6 + §6.6 schema)
//   2. Email Ben at OPS_EMAIL via the existing internal-notification
//      pipeline so he sees it in gmail (§9.0 two-surface rule)
//
// Both are best-effort: if either fails, we log to stdout and
// proceed so the cron tick still completes for other prospects.
//
// Notion schema for "Exceptions" — matches the live DB at
// NOTION_EXCEPTIONS_DB_ID (data source 340d3f31-e943-807a-bb6b-000ba1d39596):
//   Name               (title, auto: "[<step>] <prospect.name>: <error message head>")
//   Prospect           (relation → Prospects DB)
//   Step               (select: step1 / step2 / step3 / step4 / step5)
//   Action             (rich text — describes what was being attempted)
//   Error message      (rich text)
//   Stack trace        (rich text)
//   Resolved           (checkbox, default false)
//   Resolution notes   (rich text, filled by Ben on resolution)
//   Detected at        (date with time)

import { notionFetch } from "../lib/notion";
import type { ServerEnv } from "../lib/env";
import type { ExceptionEntry } from "./types";
import type { D1Database } from "../lib/d1-analytics";

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function writeException(
  env: ServerEnv,
  entry: ExceptionEntry,
  d1?: D1Database,
): Promise<void> {
  // First the Notion write (always attempted; degrades to stdout
  // if NOTION_EXCEPTIONS_DB_ID is unset so the ops worker doesn't
  // crash before the user finishes setup).
  const dbId = env.NOTION_EXCEPTIONS_DB_ID;
  if (!dbId) {
    console.error(
      `[exception:no-db] ${entry.timestamp} ${entry.step} prospect=${entry.prospect.name} (${entry.prospect.token}): ${entry.errorMessage}`,
    );
  } else {
    try {
      const titleHead = entry.errorMessage.slice(0, 80);
      await notionFetch("/pages", {
        method: "POST",
        body: {
          parent: { database_id: dbId },
          properties: {
            Name: {
              title: [
                {
                  type: "text",
                  text: {
                    content: `[${entry.step}] ${entry.prospect.name}: ${titleHead}`,
                  },
                },
              ],
            },
            Prospect: {
              relation: [{ id: entry.prospect.pageId }],
            },
            Step: {
              select: { name: entry.step },
            },
            Action: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: `${entry.step} run() — automatic dispatch from Cowork Ops Worker`,
                  },
                },
              ],
            },
            "Error message": {
              rich_text: [
                {
                  type: "text",
                  text: { content: entry.errorMessage },
                },
              ],
            },
            "Stack trace": {
              rich_text: [
                {
                  type: "text",
                  text: { content: entry.stackTrace ?? "(no stack)" },
                },
              ],
            },
            Resolved: { checkbox: false },
            "Detected at": { date: { start: entry.timestamp } },
          },
        },
      });
    } catch (e) {
      // Don't let a failure to write the Exception kill the tick —
      // we still want the email to go out, and the next prospect
      // to be processed.
      console.error(
        `[exception:write-failed] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Dedup: only email Ben if we haven't emailed for this
  // prospect+step within the last 24 hours. The Notion entry above
  // is the audit trail; the email is a pager that shouldn't flood.
  const shouldEmail = await checkDedup(d1, entry);
  if (shouldEmail) {
    await pageBen(env, entry).catch((e) => {
      console.error(
        `[exception:email-failed] ${e instanceof Error ? e.message : String(e)}`,
      );
    });
    await stampDedup(d1, entry);
  } else {
    console.log(
      `[exception:dedup] suppressed email for ${entry.prospect.token}/${entry.step} — already emailed within 24h`,
    );
  }
}

async function pageBen(
  env: ServerEnv,
  entry: ExceptionEntry,
): Promise<void> {
  const opsEmail =
    env.BEN_OPS_EMAIL ?? "pandamoniumsoftwareltd@gmail.com";
  const subject = `[INCIDENT] ${entry.step} — ${entry.prospect.name}: ${entry.errorMessage.slice(0, 80)}`;
  const body = `Cowork hit an exception during a scheduled tick.

Prospect:    ${entry.prospect.name} (${entry.prospect.business ?? "(no business name)"})
Token:       ${entry.prospect.token}
Step:        ${entry.step}
Detected at: ${entry.timestamp}

Error:
${entry.errorMessage}

Stack:
${entry.stackTrace ?? "(no stack)"}

Open the prospect in /admin: /admin/${entry.prospect.token}
Open the Notion Exceptions DB to triage and mark resolved.

— Cowork Ops Worker`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Ben @ ModuForge <ben@modu-forge.co.uk>",
      to: opsEmail,
      reply_to: opsEmail,
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
}

async function checkDedup(
  d1: D1Database | undefined,
  entry: ExceptionEntry,
): Promise<boolean> {
  if (!d1) return true;
  try {
    const row = await d1
      .prepare(
        `SELECT emailed_at FROM exception_dedup WHERE token = ? AND step = ?`,
      )
      .bind(entry.prospect.token, entry.step)
      .first<{ emailed_at: string }>();
    if (!row) return true;
    const elapsed = Date.now() - new Date(row.emailed_at).getTime();
    return elapsed > DEDUP_WINDOW_MS;
  } catch {
    return true;
  }
}

async function stampDedup(
  d1: D1Database | undefined,
  entry: ExceptionEntry,
): Promise<void> {
  if (!d1) return;
  try {
    const hash = entry.errorMessage.slice(0, 120);
    await d1
      .prepare(
        `INSERT OR REPLACE INTO exception_dedup (token, step, emailed_at, error_hash)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(entry.prospect.token, entry.step, new Date().toISOString(), hash)
      .run();
  } catch (e) {
    console.error(
      `[exception:dedup-write] ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
