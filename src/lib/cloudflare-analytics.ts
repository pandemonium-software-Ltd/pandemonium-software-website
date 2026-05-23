// Cloudflare Analytics GraphQL client.
//
// Pulls daily aggregates for a single zone via the official
// Analytics API: https://developers.cloudflare.com/analytics/graphql-api/
//
// Why GraphQL (not REST): the REST analytics endpoint is deprecated
// since 2023 + capped at 30 days. GraphQL gives us:
//   - longer historical windows (free plan: ~30 days detailed,
//     90+ days aggregates — but we snapshot daily into D1 so this
//     doesn't matter for our use case)
//   - per-dataset breakdowns (top URIs, top referrers) in one query
//   - free for all zones, all plans
//
// We query at the EDGE level (`httpRequests1dGroups` for the daily
// totals and `httpRequestsAdaptiveGroups` for the breakdowns). This
// counts every request Cloudflare proxies for the zone — no client-
// side JS beacon required, which means no cookie banner overhead
// for the customer + no missed pageviews from ad-blockers.
//
// Auth: same BEN_CLOUDFLARE_API_TOKEN as the REST client, but the
// token needs `Account Analytics: Read` + `Zone Analytics: Read` on
// top of the existing scopes. The token has account-level access to
// every customer account Ben is a member of, so we don't pass any
// customer-specific credentials.

import { getServerEnv } from "./env";

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const TIMEOUT_MS = 15_000;

export class CloudflareAnalyticsError extends Error {
  constructor(message: string) {
    super(`Cloudflare Analytics: ${message}`);
    this.name = "CloudflareAnalyticsError";
  }
}

/** Top entry — list of items with their pageview count, descending. */
export type TopEntry = { name: string; count: number };

export type DailySnapshot = {
  /** ISO date (YYYY-MM-DD), UTC. The day this snapshot represents. */
  date: string;
  /** Total requests Cloudflare served for the zone that day (proxied). */
  pageviews: number;
  /** Estimated unique visitors. Cloudflare's edge-level estimate
   *  based on client IP fingerprinting — not as precise as a cookie
   *  beacon but no banner needed + works with ad-blockers. */
  uniques: number;
  /** Top requested paths (max 10). */
  topPages: TopEntry[];
  /** Top referring hosts (max 10). Empty string = direct/no referrer. */
  topReferrers: TopEntry[];
};

/**
 * Run a GraphQL query against the Cloudflare Analytics API.
 *
 * Throws CloudflareAnalyticsError on any error path (HTTP non-2xx,
 * GraphQL `errors` array, timeout, network failure). Caller catches
 * + decides whether to skip-with-exception or propagate.
 */
async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const env = getServerEnv();
  if (!env.BEN_CLOUDFLARE_API_TOKEN) {
    throw new CloudflareAnalyticsError(
      "BEN_CLOUDFLARE_API_TOKEN is not set",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.BEN_CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new CloudflareAnalyticsError(
      `HTTP ${res.status}: ${await res.text().catch(() => "")}`,
    );
  }
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors && json.errors.length > 0) {
    throw new CloudflareAnalyticsError(
      json.errors.map((e) => e.message).join("; "),
    );
  }
  if (!json.data) {
    throw new CloudflareAnalyticsError("empty data");
  }
  return json.data;
}

/**
 * Fetch one day of analytics for a single customer zone.
 *
 * `date` is the ISO UTC date (YYYY-MM-DD) we want — usually
 * "yesterday" when called from the nightly cron. Three GraphQL
 * queries fanned out in parallel (totals, top pages, top referrers)
 * because Cloudflare returns them from different datasets.
 *
 * If a zone has zero traffic for the day, returns a snapshot with
 * pageviews=0, uniques=0, and empty top arrays. We still write that
 * row to D1 so the dashboard can show "0 visits" rather than a gap.
 */
export async function fetchDailySnapshot(
  zoneId: string,
  date: string,
): Promise<DailySnapshot> {
  const [totals, topPages, topReferrers] = await Promise.all([
    fetchTotals(zoneId, date),
    fetchTopPages(zoneId, date),
    fetchTopReferrers(zoneId, date),
  ]);
  return {
    date,
    pageviews: totals.pageviews,
    uniques: totals.uniques,
    topPages,
    topReferrers,
  };
}

// ---------- Internal queries ----------

const TOTALS_QUERY = `
  query Totals($zoneTag: String!, $date: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(
          limit: 1
          filter: { date: $date }
        ) {
          sum { requests pageViews }
          uniq { uniques }
        }
      }
    }
  }
`;

async function fetchTotals(
  zoneId: string,
  date: string,
): Promise<{ pageviews: number; uniques: number }> {
  type Resp = {
    viewer: {
      zones: Array<{
        httpRequests1dGroups: Array<{
          sum: { requests: number; pageViews: number };
          uniq: { uniques: number };
        }>;
      }>;
    };
  };
  const data = await gql<Resp>(TOTALS_QUERY, { zoneTag: zoneId, date });
  const row = data.viewer.zones[0]?.httpRequests1dGroups[0];
  if (!row) return { pageviews: 0, uniques: 0 };
  // pageViews is the HTML-only count Cloudflare computes; falls back
  // to total requests if the zone is too low-traffic for the
  // sampler to compute it (Cloudflare returns 0 in that case).
  return {
    pageviews: row.sum.pageViews || row.sum.requests || 0,
    uniques: row.uniq.uniques || 0,
  };
}

const TOP_PAGES_QUERY = `
  query TopPages($zoneTag: String!, $start: String!, $end: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequestsAdaptiveGroups(
          limit: 10
          filter: {
            datetime_geq: $start
            datetime_lt: $end
            edgeResponseContentTypeName: "html"
          }
          orderBy: [count_DESC]
        ) {
          count
          dimensions { clientRequestPath }
        }
      }
    }
  }
`;

async function fetchTopPages(
  zoneId: string,
  date: string,
): Promise<TopEntry[]> {
  type Resp = {
    viewer: {
      zones: Array<{
        httpRequestsAdaptiveGroups: Array<{
          count: number;
          dimensions: { clientRequestPath: string };
        }>;
      }>;
    };
  };
  const { start, end } = dayWindow(date);
  const data = await gql<Resp>(TOP_PAGES_QUERY, {
    zoneTag: zoneId,
    start,
    end,
  });
  const rows = data.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
  return rows.map((r) => ({
    name: r.dimensions.clientRequestPath || "/",
    count: r.count,
  }));
}

const TOP_REFERRERS_QUERY = `
  query TopReferrers($zoneTag: String!, $start: String!, $end: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequestsAdaptiveGroups(
          limit: 10
          filter: {
            datetime_geq: $start
            datetime_lt: $end
            edgeResponseContentTypeName: "html"
          }
          orderBy: [count_DESC]
        ) {
          count
          dimensions { refererHost }
        }
      }
    }
  }
`;

async function fetchTopReferrers(
  zoneId: string,
  date: string,
): Promise<TopEntry[]> {
  type Resp = {
    viewer: {
      zones: Array<{
        httpRequestsAdaptiveGroups: Array<{
          count: number;
          dimensions: { refererHost: string };
        }>;
      }>;
    };
  };
  const { start, end } = dayWindow(date);
  const data = await gql<Resp>(TOP_REFERRERS_QUERY, {
    zoneTag: zoneId,
    start,
    end,
  });
  const rows = data.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
  return rows.map((r) => ({
    name: r.dimensions.refererHost || "",
    count: r.count,
  }));
}

/** Cloudflare's adaptive groups want ISO timestamps, not bare
 *  YYYY-MM-DD. Convert a date to a half-open UTC day window. */
function dayWindow(date: string): { start: string; end: string } {
  const start = `${date}T00:00:00Z`;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const end = d.toISOString().replace(/\.\d{3}Z$/, "Z");
  return { start, end };
}

/** Yesterday's UTC date (YYYY-MM-DD). Convenience for the nightly
 *  cron — by the time 02:00 UTC hits, yesterday's data is fully
 *  flushed in Cloudflare's analytics pipeline. */
export function yesterdayUtc(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
