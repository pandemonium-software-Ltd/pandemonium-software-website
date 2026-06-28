// Unit tests for d1-analytics aggregation logic.
//
// We don't spin up an actual D1 binding here — that needs the
// Workers runtime via miniflare and would dominate the test suite's
// runtime. Instead we exercise mergeTopN via readWindow's behaviour
// against an in-memory fake binding that implements just enough of
// the D1 surface to drive the assertions.
//
// The cron path (fetch from CF + insert) is covered indirectly via
// the smoke test we'll run after deploying — re-running the same
// snapshot insert twice should yield exactly one row, not two.

import { describe, expect, test } from "vitest";
import {
  insertDailySnapshot,
  pruneOlderThan,
  readWindow,
  type D1Database,
} from "@/lib/d1-analytics";

type FakeRow = {
  token: string;
  date: string;
  pageviews: number;
  uniques: number;
  top_pages: string;
  top_referrers: string;
  top_countries: string;
  status_codes: string;
  threats: number;
  bandwidth_bytes: number;
  cached_requests: number;
};

// Shared helper to spread the new defaults into each fixture so
// individual tests stay readable.
const baseEmpty = {
  topPages: [] as { name: string; count: number }[],
  topReferrers: [] as { name: string; count: number }[],
  topCountries: [] as { name: string; count: number }[],
  statusCodes: [] as { name: string; count: number }[],
  threats: 0,
  bandwidthBytes: 0,
  cachedRequests: 0,
};

// Tiny in-memory D1 stand-in. Stores rows as objects keyed by
// `${token}|${date}` so INSERT OR REPLACE works correctly.
function makeFakeD1(): D1Database & { _rows: Map<string, FakeRow> } {
  const rows = new Map<string, FakeRow>();

  function prepare(query: string) {
    let boundValues: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) {
        boundValues = values;
        return stmt;
      },
      async run() {
        if (query.startsWith("INSERT OR REPLACE")) {
          const [
            token,
            date,
            pageviews,
            uniques,
            top_pages,
            top_referrers,
            top_countries,
            status_codes,
            threats,
            bandwidth_bytes,
            cached_requests,
          ] = boundValues as [
            string, string, number, number,
            string, string, string, string,
            number, number, number,
          ];
          rows.set(`${token}|${date}`, {
            token,
            date,
            pageviews,
            uniques,
            top_pages,
            top_referrers,
            top_countries,
            status_codes,
            threats,
            bandwidth_bytes,
            cached_requests,
          });
          return { success: true, meta: { duration: 0, changes: 1, last_row_id: 0 } };
        }
        if (query.startsWith("DELETE")) {
          const [cutoff] = boundValues as [string];
          let deleted = 0;
          for (const [key, row] of rows) {
            if (row.date < cutoff) {
              rows.delete(key);
              deleted++;
            }
          }
          return { success: true, meta: { duration: 0, changes: deleted, last_row_id: 0 } };
        }
        throw new Error(`unexpected query: ${query}`);
      },
      async first<T>() {
        return null as T | null;
      },
      async all<T>() {
        const [token, cutoff] = boundValues as [string, string];
        const filtered = Array.from(rows.values())
          .filter((r) => r.token === token && r.date >= cutoff)
          .sort((a, b) => a.date.localeCompare(b.date));
        return { results: filtered as T[] };
      },
    };
    return stmt;
  }

  return {
    prepare,
    batch: async () => [],
    _rows: rows,
  } as unknown as D1Database & { _rows: Map<string, FakeRow> };
}

const TOKEN = "abc-123";

// Fixture dates MUST stay inside readWindow's rolling 30-day window,
// so they're expressed relative to "now" rather than hardcoded —
// otherwise the fixtures silently rot once wall-clock time advances
// past the window (which is exactly what happened with the old
// hardcoded May-2026 dates).
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

describe("d1-analytics", () => {
  test("inserts then reads back a single day", async () => {
    const db = makeFakeD1();
    const date = daysAgo(5);
    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: {
        ...baseEmpty,
        date,
        pageviews: 42,
        uniques: 18,
        topPages: [{ name: "/", count: 30 }],
        topReferrers: [{ name: "google.com", count: 25 }],
      },
    });
    const w = await readWindow(db, { token: TOKEN, windowDays: 30 });
    expect(w.days).toHaveLength(1);
    expect(w.days[0]).toEqual({ date, pageviews: 42, uniques: 18 });
    expect(w.topPages).toEqual([{ name: "/", count: 30 }]);
    expect(w.topReferrers).toEqual([{ name: "google.com", count: 25 }]);
  });

  test("INSERT OR REPLACE: same (token, date) overwrites", async () => {
    const db = makeFakeD1();
    const base = {
      ...baseEmpty,
      date: daysAgo(5),
    };
    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: { ...base, pageviews: 10, uniques: 5 },
    });
    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: { ...base, pageviews: 99, uniques: 40 },
    });
    const w = await readWindow(db, { token: TOKEN, windowDays: 30 });
    expect(w.days).toHaveLength(1);
    expect(w.days[0].pageviews).toBe(99);
  });

  test("readWindow merges top pages across days, ranks by total", async () => {
    const db = makeFakeD1();
    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: {
        ...baseEmpty,
        date: daysAgo(6),
        pageviews: 0,
        uniques: 0,
        topPages: [
          { name: "/services", count: 5 },
          { name: "/contact", count: 3 },
        ],
      },
    });
    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: {
        ...baseEmpty,
        date: daysAgo(5),
        pageviews: 0,
        uniques: 0,
        topPages: [
          { name: "/services", count: 2 },
          { name: "/about", count: 4 },
        ],
      },
    });
    const w = await readWindow(db, { token: TOKEN, windowDays: 30 });
    expect(w.topPages).toEqual([
      { name: "/services", count: 7 },
      { name: "/about", count: 4 },
      { name: "/contact", count: 3 },
    ]);
  });

  test("readWindow ignores other customers' rows", async () => {
    const db = makeFakeD1();
    const date = daysAgo(5);
    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: {
        ...baseEmpty,
        date,
        pageviews: 10,
        uniques: 5,
      },
    });
    await insertDailySnapshot(db, {
      token: "different-customer",
      snapshot: {
        ...baseEmpty,
        date,
        pageviews: 999,
        uniques: 500,
      },
    });
    const w = await readWindow(db, { token: TOKEN, windowDays: 30 });
    expect(w.days).toHaveLength(1);
    expect(w.days[0].pageviews).toBe(10);
  });

  test("pruneOlderThan drops only rows past the cutoff", async () => {
    const db = makeFakeD1();
    const today = new Date();
    const old = new Date(today);
    old.setUTCDate(old.getUTCDate() - 800);
    const recent = new Date(today);
    recent.setUTCDate(recent.getUTCDate() - 10);

    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: {
        ...baseEmpty,
        date: old.toISOString().slice(0, 10),
        pageviews: 1,
        uniques: 1,
      },
    });
    await insertDailySnapshot(db, {
      token: TOKEN,
      snapshot: {
        ...baseEmpty,
        date: recent.toISOString().slice(0, 10),
        pageviews: 2,
        uniques: 2,
      },
    });

    const { deleted } = await pruneOlderThan(db, 730);
    expect(deleted).toBe(1);
    expect(db._rows.size).toBe(1);
  });

  test("readWindow handles empty store gracefully", async () => {
    const db = makeFakeD1();
    const w = await readWindow(db, { token: "no-such-token", windowDays: 30 });
    expect(w).toEqual({
      windowDays: 30,
      days: [],
      topPages: [],
      topReferrers: [],
      topCountries: [],
      statusCodes: [],
      threatsTotal: 0,
      bandwidthBytesTotal: 0,
      cachedRequestsTotal: 0,
    });
  });
});
