// Sentry alerts inbox storage layer.
//
// Wraps the `sentry_alerts` table (migration 0006). One row per
// Sentry issue (PK sentry_issue_id) — re-alerts UPSERT to bump
// event_count + last_seen_at rather than duplicating rows.
//
// Reader (admin page) lives in the marketing-site Worker; writer
// (webhook receiver) lives there too. No ops-worker access.

import type { D1Database } from "./d1-analytics";

export type SentryAlertRow = {
  sentry_issue_id: string;
  title: string;
  level: "fatal" | "error" | "warning" | "info" | "debug" | string;
  environment: string | null;
  project_slug: string | null;
  sentry_url: string;
  first_seen_at: string | null;
  last_seen_at: string;
  event_count: number;
  status: "open" | "resolved";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

/** Insert-or-update an alert. Webhook calls this on every payload
 *  Sentry sends for the same issue (subsequent fires bump event
 *  count + last_seen_at; row stays open if it was open). */
export async function upsertSentryAlert(
  db: D1Database,
  alert: Omit<
    SentryAlertRow,
    "status" | "resolved_at" | "resolved_by" | "resolution_note" | "created_at" | "updated_at"
  >,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO sentry_alerts (
        sentry_issue_id, title, level, environment, project_slug,
        sentry_url, first_seen_at, last_seen_at, event_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sentry_issue_id) DO UPDATE SET
        title = excluded.title,
        level = excluded.level,
        environment = excluded.environment,
        project_slug = excluded.project_slug,
        sentry_url = excluded.sentry_url,
        last_seen_at = excluded.last_seen_at,
        event_count = excluded.event_count,
        updated_at = excluded.updated_at`,
    )
    .bind(
      alert.sentry_issue_id,
      alert.title,
      alert.level,
      alert.environment ?? null,
      alert.project_slug ?? null,
      alert.sentry_url,
      alert.first_seen_at ?? null,
      alert.last_seen_at,
      alert.event_count,
      now,
      now,
    )
    .run();
}

/** List the N most-recently-updated alerts in a given status.
 *  Default: open alerts, newest first. Admin UI uses this. */
export async function listSentryAlerts(
  db: D1Database,
  args: { status?: "open" | "resolved"; limit?: number } = {},
): Promise<SentryAlertRow[]> {
  const status = args.status ?? "open";
  const limit = args.limit ?? 50;
  const res = await db
    .prepare(
      `SELECT * FROM sentry_alerts
       WHERE status = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .bind(status, limit)
    .all<SentryAlertRow>();
  return res.results ?? [];
}

/** Count open alerts — drives the small badge on /admin. */
export async function countOpenSentryAlerts(
  db: D1Database,
): Promise<number> {
  const res = await db
    .prepare(`SELECT COUNT(*) AS c FROM sentry_alerts WHERE status = 'open'`)
    .first<{ c: number }>();
  return res?.c ?? 0;
}

/** Mark an alert resolved. Local-only — doesn't sync to Sentry. */
export async function resolveSentryAlert(
  db: D1Database,
  args: {
    sentry_issue_id: string;
    resolved_by: string;
    note?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE sentry_alerts SET
        status = 'resolved',
        resolved_at = ?,
        resolved_by = ?,
        resolution_note = ?,
        updated_at = ?
       WHERE sentry_issue_id = ?`,
    )
    .bind(
      now,
      args.resolved_by,
      args.note ?? null,
      now,
      args.sentry_issue_id,
    )
    .run();
}
