// Google Places API client (Places API v1 — the New version,
// places.googleapis.com).
//
// Responsibilities:
//   - extractPlaceIdFromMapsUrl(url) — heuristic parser, no
//     network. Handles the common Google Maps share formats.
//   - findPlaceByQuery(query, key) — fallback when the URL parse
//     fails. Single Places API text-search call.
//   - fetchPlaceDetails(placeId, key) — the workhorse, called
//     once per customer per cron tick. Returns rating + total +
//     top reviews shaped exactly as we store them in D1.
//
// API key: GOOGLE_PLACES_API_KEY env var. Cloudflare Workers
// fetch() is fine for these JSON endpoints — no SDK needed.
//
// All errors thrown as PlacesApiError so callers can distinguish
// "Google said no" from "the URL didn't parse" cleanly.

/** Review shape we persist in D1's top_reviews JSON column. Matches
 *  the customer-site widget's read path 1:1 — keep it stable. */
export type StoredReview = {
  authorName: string;
  rating: number;
  text: string;
  /** Google-formatted "3 weeks ago" / "a month ago" string. */
  relativeTimeDescription: string;
  /** Optional Google profile photo URL. Empty/missing tolerated. */
  profilePhotoUrl?: string;
};

/** The full snapshot one fetchPlaceDetails call resolves. Matches
 *  the gbp_reviews D1 columns 1:1 so the storage path is dumb. */
export type PlaceDetailsSnapshot = {
  rating: number | null;
  totalReviews: number | null;
  topReviews: StoredReview[];
};

export class PlacesApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

/**
 * Try to pull a place_id out of a Google Maps URL the customer
 * pastes. Returns null when the URL does not contain one (caller
 * falls back to findPlaceByQuery).
 *
 * Handles the formats Google produces in practice:
 *   1. /place/<name>/data=!3m1!4b1!4m6!...!1s0x48761c...:0xABC
 *      The `!1s<hex>:<hex>` segment encodes a place_id derivative;
 *      we can extract the colon-separated id but Google's text
 *      search resolves names more reliably, so we treat this as a
 *      "soft" signal — return null and let the fallback fire.
 *   2. Short link /maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4
 *      The explicit place_id= prefix is the gold standard.
 *   3. Full /place URL with !1s prefix but no readable place_id.
 *
 * Only returns a value for case 2 (explicit place_id). Everything
 * else falls back to text search.
 */
export function extractPlaceIdFromMapsUrl(raw: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Direct param: ?q=place_id:ChIJ...
  for (const [, value] of url.searchParams) {
    const m = value.match(/place_id:([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
  }
  // Direct param: ?cid=12345 — older format, not a place_id, skip.
  // Pathname: /maps/place/place_id:ChIJ...
  const pathMatch = url.pathname.match(/place_id:([A-Za-z0-9_-]{10,})/);
  if (pathMatch) return pathMatch[1];
  return null;
}

/**
 * Resolve a free-text query like "Bens Cafe, Oxford" to a place_id
 * using the Places API Text Search endpoint. One call, returns the
 * first result's id.
 *
 * Throws PlacesApiError on non-200 or zero results — caller decides
 * how to surface that to the customer (we email them with a
 * "couldn't find your listing, please paste a Google Maps link
 * with place_id" follow-up).
 */
export async function findPlaceByQuery(
  query: string,
  apiKey: string,
): Promise<string> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Field mask is REQUIRED for Places API v1 — empty mask = 400.
      // We only need the id from this call.
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({ textQuery: query }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new PlacesApiError(
      res.status,
      `Places searchText ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { places?: Array<{ id?: string }> };
  const first = json.places?.[0]?.id;
  if (!first) {
    throw new PlacesApiError(404, `No place found for query: ${query}`);
  }
  return first;
}

/**
 * Fetch full place details — rating, total review count, top 5
 * reviews. One call. Reviews come back in Google's "most helpful"
 * order, which is exactly what we want to surface on the site.
 *
 * Throws PlacesApiError on 4xx/5xx. Returns null fields where Google
 * has no data (a brand-new listing with zero reviews returns
 * { rating: null, totalReviews: null, topReviews: [] }).
 */
export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetailsSnapshot> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      // Only ask for what we render — keeps the bill down (Places API
      // v1 bills per field group).
      "X-Goog-FieldMask": "rating,userRatingCount,reviews",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new PlacesApiError(
      res.status,
      `Places details(${placeId}) ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  type Raw = {
    rating?: number;
    userRatingCount?: number;
    reviews?: Array<{
      rating?: number;
      text?: { text?: string };
      relativePublishTimeDescription?: string;
      authorAttribution?: {
        displayName?: string;
        photoUri?: string;
      };
    }>;
  };
  const json = (await res.json()) as Raw;
  const topReviews: StoredReview[] = (json.reviews ?? [])
    .slice(0, 5)
    .map((r) => ({
      authorName: r.authorAttribution?.displayName ?? "Google reviewer",
      rating: typeof r.rating === "number" ? r.rating : 5,
      text: r.text?.text ?? "",
      relativeTimeDescription: r.relativePublishTimeDescription ?? "",
      profilePhotoUrl: r.authorAttribution?.photoUri,
    }))
    // Drop reviews with no text — they add no signal on the site,
    // just a star.
    .filter((r) => r.text.length > 0);
  return {
    rating: typeof json.rating === "number" ? json.rating : null,
    totalReviews:
      typeof json.userRatingCount === "number" ? json.userRatingCount : null,
    topReviews,
  };
}
