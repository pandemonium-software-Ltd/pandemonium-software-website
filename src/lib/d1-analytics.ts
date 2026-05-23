// D1 analytics storage layer.
//
// Wraps the `daily_analytics` table — see
// migrations/0001_create_daily_analytics.sql for the schema.
//
// Why D1 (not Notion): time-series query patterns ("last 30 days",
// "compare month vs month") are painful in Notion JSON. D1 gives us
// a real SQL `WHERE date >= ?` with the primary-key index.
//
// Cost: D1 free tier covers 5 GB storage, 5M reads/day, 100k
// writes/day. At 1k customers × 730 days = 730k rows × ~500 bytes
// each ≈ 350 MB. We're comfortably inside the free tier for years
// even at 10× our current scale, but the prune sweep keeps us
// bounded regardless of customer count.
//
// All functions take a D1 binding as the first argument rather
// than reading from a global, so the same module works in the ops
// Worker (cron writes) and the Next.js Worker (dashboard reads).

import type { DailySnapshot, TopEntry } from "./cloudflare-analytics";

/** Minimal D1 binding shape — we don't pull in @cloudflare/workers-types
 *  for the same reason as cloudflare.ts: thin surface. These are the
 *  methods we actually use. */
export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
};
type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
};
type D1Result<T = unknown> = {
  success: boolean;
  meta: { duration: number; changes: number; last_row_id: number };
  results?: T[];
};

/**
 * Insert (or replace) one daily snapshot for one customer. Safe to
 * re-run for the same (token, date) — the PK + REPLACE means the
 * row gets overwritten with the latest numbers. The cron relies on
 * this for partial-failure recovery: if yesterday's snapshot wrote
 * for some customers and then died, we can re-run the same tick
 * without dupes.
 */
export async function insertDailySnapshot(
  db: D1Database,
  args: { token: string; snapshot: DailySnapshot },
): Promise<void> {
  const { token, snapshot } = args;
  await db
    .prepare(
      `INSERT OR REPLACE INTO daily_analytics
         (token, date, pageviews, uniques, top_pages, top_referrers, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      token,
      snapshot.date,
      snapshot.pageviews,
      snapshot.uniques,
      JSON.stringify(snapshot.topPages),
      JSON.stringify(snapshot.topReferrers),
    )
    .run();
}

/**
 * Drop any row older than `days` days. Runs once at the end of the
 * nightly cron — bounded growth regardless of how many customers
 * we have. Default 730 (24 months) gives every customer
 * year-over-year comparison once they hit month 13.
 */
export async function pruneOlderThan(
  db: D1Database,
  days = 730,
): Promise<{ deleted: number }> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const result = await db
    .prepare(`DELETE FROM daily_analytics WHERE date < ?`)
    .bind(cutoffIso)
    .run();
  return { deleted: result.meta.changes };
}

export type AnalyticsWindow = {
  /** Days requested (e.g. 30). */
  windowDays: number;
  /** One row per day in the window, sorted by date asc. Includes
   *  days with zero traffic (the cron writes those). Will be empty
   *  for new customers (< 24h since launch) since the cron hasn't
   *  written any rows for them yet. */
  days: Array<{ date: string; pageviews: number; uniques: number }>;
  /** Top pages aggregated across the whole window, max 10. */
  topPages: TopEntry[];
  /** Top referrers aggregated across the whole window, max 10. */
  topReferrers: TopEntry[];
};

/**
 * Read a rolling N-day window of analytics for one customer.
 * Used by /api/account/analytics/[token] — returns daily series
 * for the sparkline plus aggregated top-N for the lists.
 *
 * Aggregation happens in JS (not SQL) because the top_pages /
 * top_referrers columns are JSON arrays — D1 doesn't have a great
 * way to GROUP BY across JSON values. Window sizes top out at
 * 365 days × 10 entries = 3650 entries — sub-millisecond merge.
 */
export async function readWindow(
  db: D1Database,
  args: { token: string; windowDays?: number },
): Promise<AnalyticsWindow> {
  const windowDays = args.windowDays ?? 30;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  type Row = {
    date: string;
    pageviews: number;
    uniques: number;
    top_pages: string;
    top_referrers: string;
  };
  const { results } = await db
    .prepare(
      `SELECT date, pageviews, uniques, top_pages, top_referrers
         FROM daily_analytics
        WHERE token = ? AND date >= ?
        ORDER BY date ASC`,
    )
    .bind(args.token, cutoffIso)
    .all<Row>();

  const days = results.map((r) => ({
    date: r.date,
    pageviews: r.pageviews,
    uniques: r.uniques,
  }));

  // Sum each (name → count) across all days in the window, then
  // sort descending + take top 10. Safe parse on the JSON column —
  // malformed rows just contribute nothing.
  const topPages = mergeTopN(results.map((r) => r.top_pages));
  const topReferrers = mergeTopN(results.map((r) => r.top_referrers));

  return { windowDays, days, topPages, topReferrers };
}

function mergeTopN(rawJsonRows: string[], limit = 10): TopEntry[] {
  const acc = new Map<string, number>();
  for (const raw of rawJsonRows) {
    let arr: TopEntry[];
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? (parsed as TopEntry[]) : [];
    } catch {
      continue;
    }
    for (const e of arr) {
      if (typeof e?.name !== "string" || typeof e?.count !== "number") continue;
      acc.set(e.name, (acc.get(e.name) ?? 0) + e.count);
    }
  }
  return Array.from(acc.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
