// GET /api/account/analytics/[token] — customer dashboard analytics read.
//
// Backs the AnalyticsCard tile on /account/[token]. Returns a
// rolling N-day window (default 30) of daily snapshots plus
// aggregated top pages / top referrers across that window.
//
// Data source: the pandemonium_analytics D1, populated nightly by
// the ops Worker's analytics-tick at 02:00 UTC. For a customer
// who's been Live < 24h, this will return an empty `days` array —
// the dashboard component renders a "No data yet" state.
//
// Auth: same customer-session check as the rest of /api/account/*.
// A customer can only read their own analytics.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  readWindow,
  type D1Database,
} from "@/lib/d1-analytics";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_WINDOW = 30;
const MAX_WINDOW = 365;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  // Optional ?window=<days> for future "last 90 days" / "last 365"
  // toggles. Clamp to [1, 365] — the tile currently only renders 7
  // and 30 day views but the underlying API supports more.
  const url = new URL(request.url);
  const rawWindow = Number.parseInt(
    url.searchParams.get("window") ?? "",
    10,
  );
  const windowDays = Number.isFinite(rawWindow)
    ? Math.min(MAX_WINDOW, Math.max(1, rawWindow))
    : DEFAULT_WINDOW;

  const cfCtx = getCloudflareContext();
  const env = cfCtx.env as Record<string, unknown>;
  const db = env.pandemonium_analytics as D1Database | undefined;
  if (!db) {
    // Binding misconfigured. Return an empty window rather than 500
    // so the dashboard tile shows "No data yet" instead of breaking
    // the whole page.
    console.error(
      "[analytics-api] pandemonium_analytics D1 binding is missing on the main Worker",
    );
    return NextResponse.json({
      windowDays,
      days: [],
      topPages: [],
      topReferrers: [],
    });
  }

  try {
    const window = await readWindow(db, { token, windowDays });
    return NextResponse.json(window);
  } catch (e) {
    console.error(
      `[analytics-api] readWindow failed for ${token}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json(
      { error: "Couldn't load analytics. Try again shortly." },
      { status: 500 },
    );
  }
}
