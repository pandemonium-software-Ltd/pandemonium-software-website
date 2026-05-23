// Aggregate per-customer monthly digest data for the cron + email
// template. Pulls last-month + month-before-that from the analytics
// D1 (website rows + newsletter event rows), computes
// month-over-month deltas, returns a tight payload the template
// turns into HTML.
//
// "Last month" = the calendar month that JUST ended, in UTC. The
// cron fires on the 1st so "last month" is the previous month
// (e.g. fire on 2026-06-01 → digest covers 2026-05-01..2026-05-31).

import type { D1Database } from "./d1-analytics";
import type { ProspectRecord } from "./notion-prospects";

export type DigestMonth = {
  /** YYYY-MM, the month the digest covers. */
  monthKey: string;
  /** Display name "May 2026". */
  monthLabel: string;
};

export type DigestPayload = {
  month: DigestMonth;
  /** Has anything to report (any pageviews OR any newsletter
   *  send)? Caller may decide to send a "quiet month" variant
   *  instead, or skip the customer entirely. */
  hasActivity: boolean;
  /** Website headline numbers + delta vs the month before. */
  website: {
    pageviews: number;
    uniques: number;
    pageviewsDeltaPct: number | null;
    /** Top 5 paths over the month, by raw request count. JSON
     *  shape from the daily snapshots' top_pages arrays. */
    topPages: Array<{ name: string; count: number }>;
    /** Top 5 countries (two-letter ISO). */
    topCountries: Array<{ name: string; count: number }>;
  };
  /** Newsletter stats — only present when the customer has the
   *  Newsletter module AND sent at least one in the digest month. */
  newsletter:
    | {
        sendsCount: number;
        recipientCount: number;
        opened: number;
        clicked: number;
        openRatePct: number | null;
        clickRatePct: number | null;
      }
    | null;
};

/** Compute the last-completed calendar month given a "now" date.
 *  Used by the cron — fires on the 1st so this returns the just-
 *  ended month. Exposed for testing. */
export function lastCompletedMonth(now: Date = new Date()): DigestMonth {
  const d = new Date(now);
  d.setUTCDate(0); // last day of previous month
  const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthLabel = d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { monthKey, monthLabel };
}

/** Half-open UTC window for a YYYY-MM key. Returns ISO date
 *  strings YYYY-MM-DD so they slot directly into the D1 SELECT. */
function monthWindow(monthKey: string): { startIso: string; endIso: string } {
  const [year, month] = monthKey.split("-").map((s) => Number.parseInt(s, 10));
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

/** Previous month relative to a given month. e.g. 2026-05 → 2026-04. */
function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map((s) => Number.parseInt(s, 10));
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Read + assemble one customer's digest payload. Does TWO D1
 *  reads (the digest month + the previous month) so the delta is
 *  meaningful even at customers with sparse data. Pure read —
 *  no writes, idempotent. */
export async function readDigestPayload(args: {
  db: D1Database;
  prospect: ProspectRecord;
  month: DigestMonth;
}): Promise<DigestPayload> {
  const { db, prospect, month } = args;
  const win = monthWindow(month.monthKey);
  const prevWin = monthWindow(previousMonthKey(month.monthKey));

  // --- Website analytics: digest month + prior month totals ---
  type WebRow = {
    pageviews: number;
    uniques: number;
    top_pages: string | null;
    top_countries: string | null;
  };
  const { results: thisMonthRows } = await db
    .prepare(
      `SELECT pageviews, uniques, top_pages, top_countries
         FROM daily_analytics
        WHERE token = ? AND date >= ? AND date < ?`,
    )
    .bind(prospect.token, win.startIso, win.endIso)
    .all<WebRow>();
  const { results: prevMonthRows } = await db
    .prepare(
      `SELECT pageviews, uniques
         FROM daily_analytics
        WHERE token = ? AND date >= ? AND date < ?`,
    )
    .bind(prospect.token, prevWin.startIso, prevWin.endIso)
    .all<{ pageviews: number; uniques: number }>();

  const thisMonth = thisMonthRows.reduce(
    (acc, r) => ({
      pageviews: acc.pageviews + r.pageviews,
      uniques: acc.uniques + r.uniques,
    }),
    { pageviews: 0, uniques: 0 },
  );
  const prevMonth = prevMonthRows.reduce(
    (acc, r) => ({
      pageviews: acc.pageviews + r.pageviews,
      uniques: acc.uniques + r.uniques,
    }),
    { pageviews: 0, uniques: 0 },
  );

  const topPages = mergeTopN(
    thisMonthRows.map((r) => r.top_pages ?? "[]"),
    5,
  );
  const topCountries = mergeTopN(
    thisMonthRows.map((r) => r.top_countries ?? "[]"),
    5,
  );

  // --- Newsletter stats: only meaningful when module bought AND
  // at least one send landed in the digest month. ---
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const hasNewsletter = prospect.moduleSelections.includes("Newsletter");
  let newsletter: DigestPayload["newsletter"] = null;
  if (hasNewsletter) {
    const content = (ob.content ?? {}) as Record<string, unknown>;
    const newsletterSlice = (content.newsletter ?? {}) as {
      history?: Array<{
        id?: string;
        sentAt?: string;
        recipientCount?: number;
      }>;
    };
    // Sends whose sentAt falls inside the month window. The send
    // ids are needed for the event aggregation query.
    const monthStartTs = `${win.startIso}T00:00:00Z`;
    const monthEndTs = `${win.endIso}T00:00:00Z`;
    const sendsInMonth = (newsletterSlice.history ?? []).filter(
      (h) =>
        typeof h.id === "string" &&
        typeof h.sentAt === "string" &&
        h.sentAt >= monthStartTs &&
        h.sentAt < monthEndTs,
    );
    if (sendsInMonth.length > 0) {
      const sendIds = sendsInMonth.map((h) => h.id as string);
      const placeholders = sendIds.map(() => "?").join(",");
      const { results } = await db
        .prepare(
          `SELECT event_type, COUNT(*) AS cnt
             FROM newsletter_events
            WHERE token = ? AND send_id IN (${placeholders})
            GROUP BY event_type`,
        )
        .bind(prospect.token, ...sendIds)
        .all<{ event_type: string; cnt: number }>();
      const byType = Object.fromEntries(
        results.map((r) => [r.event_type, r.cnt]),
      );
      const opened = byType.opened ?? 0;
      const clicked = byType.clicked ?? 0;
      const delivered = byType.delivered ?? 0;
      const recipientCount = sendsInMonth.reduce(
        (acc, h) => acc + (h.recipientCount ?? 0),
        0,
      );
      newsletter = {
        sendsCount: sendsInMonth.length,
        recipientCount,
        opened,
        clicked,
        openRatePct:
          delivered > 0 ? Math.round((opened / delivered) * 100) : null,
        clickRatePct:
          delivered > 0 ? Math.round((clicked / delivered) * 100) : null,
      };
    }
  }

  const hasActivity =
    thisMonth.pageviews > 0 || (newsletter?.sendsCount ?? 0) > 0;

  return {
    month,
    hasActivity,
    website: {
      pageviews: thisMonth.pageviews,
      uniques: thisMonth.uniques,
      pageviewsDeltaPct:
        prevMonth.pageviews > 0
          ? Math.round(
              ((thisMonth.pageviews - prevMonth.pageviews) /
                prevMonth.pageviews) *
                100,
            )
          : null,
      topPages,
      topCountries,
    },
    newsletter,
  };
}

function mergeTopN(
  jsonRows: string[],
  limit: number,
): Array<{ name: string; count: number }> {
  const acc = new Map<string, number>();
  for (const raw of jsonRows) {
    let arr: Array<{ name: string; count: number }>;
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
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
