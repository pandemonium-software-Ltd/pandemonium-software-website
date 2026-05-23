// GET /api/admin/analytics — admin "self view" analytics for
// modu-forge.co.uk (the marketing site).
//
// Auth: basic auth via src/middleware.ts (matches /api/admin/*).
// By the time this handler runs, the caller is authenticated.
//
// Returns the same payload shape as /api/account/analytics/[token]
// so AnalyticsCard can consume it via the apiPath prop with no
// per-call branching.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readWindow, type D1Database } from "@/lib/d1-analytics";

export const runtime = "nodejs";

const DEFAULT_WINDOW = 30;
const MAX_WINDOW = 365;

// Same reserved token the ops-worker analytics tick writes under
// for the marketing site. Kept in lock-step with SELF.token in
// src/ops-worker/analytics-tick.ts.
const SELF_TOKEN = "@self";

export async function GET(request: Request) {
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
    console.error(
      "[admin-analytics] pandemonium_analytics D1 binding is missing",
    );
    return NextResponse.json({
      windowDays,
      days: [],
      topPages: [],
      topReferrers: [],
    });
  }

  try {
    const window = await readWindow(db, { token: SELF_TOKEN, windowDays });
    return NextResponse.json(window);
  } catch (e) {
    console.error(
      `[admin-analytics] readWindow failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json(
      { error: "Couldn't load analytics. Try again shortly." },
      { status: 500 },
    );
  }
}
