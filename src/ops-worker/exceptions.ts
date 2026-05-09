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

export async function writeException(
  env: ServerEnv,
  entry: ExceptionEntry,
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

  // Then page Ben via gmail (§9.0 — gmail is one of his two surfaces).
  // Inline the email send rather than importing email.ts so we keep
  // this module's dependencies tight; uses Resend's REST API directly.
  await pageBen(env, entry).catch((e) => {
    console.error(
      `[exception:email-failed] ${e instanceof Error ? e.message : String(e)}`,
    );
  });
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
      from: "ModuForge Notifications <onboarding@resend.dev>",
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
