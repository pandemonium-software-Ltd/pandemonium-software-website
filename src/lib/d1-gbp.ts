// D1 storage for GBP review snapshots.
//
// Wraps the `gbp_reviews` table — see
// migrations/0004_gbp_reviews.sql for the schema. One row per
// customer; cron upserts on every refresh.
//
// Two surfaces:
//   - upsertSnapshot(): writes the latest fetch. Cron path.
//   - readSnapshot(): public-API read. /api/public/gbp-reviews
//     serves this directly to the customer-site widget.

import type { D1Database } from "./d1-analytics";
import type { PlaceDetailsSnapshot, StoredReview } from "./google-places";

export type GbpReviewsRow = {
  token: string;
  placeId: string;
  rating: number | null;
  totalReviews: number | null;
  topReviews: StoredReview[];
  fetchedAt: string;
  lastError: string | null;
  /** Resolved listing's display name (e.g. "Lucas Luxe Car Wash").
   *  Captured on every fetch so /admin can verify we picked the
   *  right listing and the customer email can quote it back. */
  displayName: string | null;
  /** Resolved listing's formatted street address. Same rationale
   *  as displayName — anchor what we resolved to a real place. */
  formattedAddress: string | null;
};

/** Insert-or-replace a snapshot for one customer. Last write wins
 *  — the cron is the only writer, so there is no concurrent-update
 *  scenario worth defending against. `lastError` defaults to NULL
 *  on success; pass an error string from the catch path when the
 *  fetch failed and you want to surface why to the dashboard. */
export async function upsertSnapshot(
  db: D1Database,
  args: {
    token: string;
    placeId: string;
    snapshot: PlaceDetailsSnapshot;
    lastError?: string | null;
  },
): Promise<void> {
  const { token, placeId, snapshot, lastError = null } = args;
  await db
    .prepare(
      `INSERT OR REPLACE INTO gbp_reviews
         (token, place_id, rating, total_reviews, top_reviews,
          fetched_at, last_error, display_name, formatted_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      token,
      placeId,
      snapshot.rating,
      snapshot.totalReviews,
      JSON.stringify(snapshot.topReviews),
      new Date().toISOString(),
      lastError,
      snapshot.displayName,
      snapshot.formattedAddress,
    )
    .run();
}

/** Read the latest snapshot for one customer. Returns null when no
 *  row exists yet — the customer just signed up for the GBP module
 *  and the next cron tick will populate. Caller (public API) returns
 *  a 404 in that case so the widget renders its empty state. */
export async function readSnapshot(
  db: D1Database,
  token: string,
): Promise<GbpReviewsRow | null> {
  type Row = {
    token: string;
    place_id: string;
    rating: number | null;
    total_reviews: number | null;
    top_reviews: string;
    fetched_at: string;
    last_error: string | null;
    display_name: string | null;
    formatted_address: string | null;
  };
  const row = await db
    .prepare(
      `SELECT token, place_id, rating, total_reviews,
              top_reviews, fetched_at, last_error,
              display_name, formatted_address
         FROM gbp_reviews
        WHERE token = ?`,
    )
    .bind(token)
    .first<Row>();
  if (!row) return null;
  let topReviews: StoredReview[] = [];
  try {
    const parsed = JSON.parse(row.top_reviews);
    if (Array.isArray(parsed)) topReviews = parsed as StoredReview[];
  } catch {
    // Malformed JSON in storage = treat as no reviews. The cron's
    // next tick will overwrite with a fresh, well-formed snapshot.
  }
  return {
    token: row.token,
    placeId: row.place_id,
    rating: row.rating,
    totalReviews: row.total_reviews,
    topReviews,
    fetchedAt: row.fetched_at,
    lastError: row.last_error,
    displayName: row.display_name,
    formattedAddress: row.formatted_address,
  };
}

/** Admin-only listing of every GBP-module customer + their latest
 *  snapshot. Powers the /admin GBP overview card. Returns rows
 *  ordered by fetched_at desc so freshest float to the top. */
export async function listAllSnapshots(
  db: D1Database,
): Promise<GbpReviewsRow[]> {
  type Row = {
    token: string;
    place_id: string;
    rating: number | null;
    total_reviews: number | null;
    top_reviews: string;
    fetched_at: string;
    last_error: string | null;
    display_name: string | null;
    formatted_address: string | null;
  };
  const { results } = await db
    .prepare(
      `SELECT token, place_id, rating, total_reviews,
              top_reviews, fetched_at, last_error,
              display_name, formatted_address
         FROM gbp_reviews
        ORDER BY fetched_at DESC`,
    )
    .all<Row>();
  return results.map((row) => {
    let topReviews: StoredReview[] = [];
    try {
      const parsed = JSON.parse(row.top_reviews);
      if (Array.isArray(parsed)) topReviews = parsed as StoredReview[];
    } catch {
      /* treat as empty — same rationale as readSnapshot */
    }
    return {
      token: row.token,
      placeId: row.place_id,
      rating: row.rating,
      totalReviews: row.total_reviews,
      topReviews,
      fetchedAt: row.fetched_at,
      lastError: row.last_error,
      displayName: row.display_name,
      formattedAddress: row.formatted_address,
    };
  });
}
