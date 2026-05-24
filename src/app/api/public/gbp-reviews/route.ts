// GET /api/public/gbp-reviews?token=<customer-token>
//
// Public read endpoint called by GbpReviewsWidget on customer
// sites. Returns the latest snapshot (rating + total + top reviews
// + fetched-at) from the gbp_reviews D1 table.
//
// Permissive CORS — anyone can GET (we want the widget to work
// from any customer's site, served on their own domain). The token
// in the URL couples the response to a specific customer; nothing
// sensitive in the payload (it is all already public on Google).
//
// Caching: s-maxage=3600 (one hour) lets Cloudflare's edge cache
// absorb the bulk of the traffic. The cron only refreshes once a
// day so anything more aggressive would be wasted; less than that
// would just put more load on D1 for no user-visible benefit.
//
// Status codes:
//   200 — snapshot returned. Body matches the public shape below.
//   400 — token missing or wrong format
//   404 — no snapshot yet (customer hasn't completed step 3 OR
//         the first cron hasn't run yet). Widget renders empty.
//   503 — D1 binding missing on this deployment

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readSnapshot } from "@/lib/d1-gbp";
import type { D1Database } from "@/lib/d1-analytics";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public response shape — keep stable, the customer-site widget
 *  depends on it. `null` fields = Google has no data yet (brand
 *  new listing with zero reviews). */
export type PublicGbpReviewsPayload = {
  rating: number | null;
  totalReviews: number | null;
  topReviews: Array<{
    authorName: string;
    rating: number;
    text: string;
    relativeTimeDescription: string;
    profilePhotoUrl?: string;
  }>;
  fetchedAt: string;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!TOKEN_RE.test(token)) {
    return cors(
      NextResponse.json(
        { error: "token query parameter required (UUID format)" },
        { status: 400 },
      ),
    );
  }

  const cfCtx = getCloudflareContext();
  const env = cfCtx.env as Record<string, unknown>;
  const db = env.pandemonium_analytics as D1Database | undefined;
  if (!db) {
    return cors(
      NextResponse.json(
        { error: "Reviews storage not configured on this deployment" },
        { status: 503 },
      ),
    );
  }

  const snapshot = await readSnapshot(db, token);
  if (!snapshot) {
    return cors(
      NextResponse.json(
        { error: "No reviews snapshot yet for this customer" },
        { status: 404 },
      ),
    );
  }

  const payload: PublicGbpReviewsPayload = {
    rating: snapshot.rating,
    totalReviews: snapshot.totalReviews,
    topReviews: snapshot.topReviews,
    fetchedAt: snapshot.fetchedAt,
  };
  const res = NextResponse.json(payload, {
    headers: {
      // One-hour edge cache. The cron refreshes once a day so this
      // is the tightest window that still gives every customer a
      // current view within an hour of the next refresh.
      "Cache-Control": "public, s-maxage=3600",
    },
  });
  return cors(res);
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function cors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders())) {
    res.headers.set(k, v as string);
  }
  return res;
}
