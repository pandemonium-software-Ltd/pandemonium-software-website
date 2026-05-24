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
 *  the gbp_reviews D1 columns 1:1 so the storage path is dumb.
 *  `displayName` + `formattedAddress` are captured so /admin can
 *  verify we picked the correct listing, and the gbp-module-ready
 *  email can quote them back to the customer for a sanity check. */
export type PlaceDetailsSnapshot = {
  rating: number | null;
  totalReviews: number | null;
  topReviews: StoredReview[];
  displayName: string | null;
  formattedAddress: string | null;
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

/** Structured hints we can lift directly out of a Google Maps
 *  share URL without an API call. The text-search fallback uses
 *  `name` + `lat`/`lng` together to bias the result to the right
 *  region — turns "Bens Cafe" (3 in Oxford) into a single correct
 *  resolution every time. */
export type MapsUrlHints = {
  /** Explicit place_id when the URL carries one — gold-standard
   *  resolution, skip the text-search call entirely. */
  placeId?: string;
  /** Business name lifted from /place/<name>/... path segment.
   *  URL-decoded + `+` → space. */
  name?: string;
  /** Decimal lat/lng lifted from /@lat,lng,zoom path segment. */
  lat?: number;
  lng?: number;
};

/**
 * Resolve a Google Maps short link (maps.app.goo.gl/XXXX) to the
 * full canonical URL by following the redirect chain. Returns the
 * original input if it is not a short link OR the resolution fails
 * (network blip, link expired) — caller falls back to parsing what
 * they pasted.
 *
 * One HEAD fetch with redirect: "manual" per hop so we can chain
 * up to 3 redirects without burning Workers CPU on a large body.
 */
export async function resolveMapsShortUrl(raw: string): Promise<string> {
  if (!raw) return raw;
  if (!isMapsShortUrl(raw)) return raw;
  let current = raw;
  for (let hop = 0; hop < 3; hop++) {
    let res: Response;
    try {
      res = await fetch(current, { method: "GET", redirect: "manual" });
    } catch {
      return raw;
    }
    const loc = res.headers.get("location");
    if (!loc) return current;
    // Resolve relative redirects against the previous URL.
    current = new URL(loc, current).toString();
    if (!isMapsShortUrl(current)) return current;
  }
  return current;
}

/** Helper used by resolveMapsShortUrl — hostname check via URL
 *  parser, NOT regex. The regex approach failed for `https://...`
 *  prefixed URLs because the host is preceded by `//` rather than
 *  start-of-string or a dot. */
function isMapsShortUrl(u: string): boolean {
  try {
    return new URL(u).hostname === "maps.app.goo.gl";
  } catch {
    return false;
  }
}

/**
 * Lift everything we can out of a Google Maps URL without calling
 * the Places API. Handles the formats Google produces in practice:
 *
 *   - /maps/place/?q=place_id:ChIJ...                — explicit id
 *   - /maps/place/<Business+Name>/@lat,lng,zoom/data=! — share link
 *   - /maps/?q=<query>                                 — search link
 *
 * Returns whatever it could parse. Caller combines `name` + `lat`/
 * `lng` into a Places API locationBias for the text search.
 */
export function parseMapsUrl(raw: string): MapsUrlHints {
  if (!raw) return {};
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {};
  }
  const hints: MapsUrlHints = {};

  // 1. Explicit place_id in query or path.
  for (const [, value] of url.searchParams) {
    const m = value.match(/place_id:([A-Za-z0-9_-]{10,})/);
    if (m) hints.placeId = m[1];
  }
  if (!hints.placeId) {
    const pathMatch = url.pathname.match(/place_id:([A-Za-z0-9_-]{10,})/);
    if (pathMatch) hints.placeId = pathMatch[1];
  }

  // 2. Business name from /place/<name>/... segment.
  const placeMatch = url.pathname.match(/\/place\/([^/]+)\//);
  if (placeMatch) {
    hints.name = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
  }

  // 3. lat/lng from /@lat,lng,zoom segment.
  const atMatch = url.pathname.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  if (atMatch) {
    hints.lat = Number.parseFloat(atMatch[1]);
    hints.lng = Number.parseFloat(atMatch[2]);
  }

  // 4. Plain ?q=Business+Name search link with no /place segment.
  if (!hints.name) {
    const q = url.searchParams.get("q");
    if (q && !q.startsWith("place_id:")) hints.name = q;
  }

  return hints;
}

/**
 * Back-compat shim — old extractPlaceIdFromMapsUrl semantics, now
 * implemented in terms of parseMapsUrl. Kept so older tests keep
 * passing; new callers should use parseMapsUrl directly.
 */
export function extractPlaceIdFromMapsUrl(raw: string): string | null {
  return parseMapsUrl(raw).placeId ?? null;
}

/**
 * Resolve a free-text query like "Bens Cafe Oxford" to a place_id
 * using the Places API Text Search endpoint. One call, returns the
 * first result's id.
 *
 * When `locationBias` is provided (always preferred — extracted
 * from the lat/lng in the customer's pasted Maps URL), the search
 * is biased to a 500m-radius circle around it, which turns
 * "Bens Cafe" from a coin-flip across 3 hits into a deterministic
 * single correct result for the actual business the customer
 * meant. Without bias we fall back to plain text — works but
 * less reliable for common names.
 *
 * Throws PlacesApiError on non-200 or zero results.
 */
export async function findPlaceByQuery(
  query: string,
  apiKey: string,
  locationBias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<string> {
  const body: Record<string, unknown> = { textQuery: query };
  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: locationBias.radiusMeters ?? 500,
      },
    };
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Field mask is REQUIRED for Places API v1 — empty mask = 400.
      // We only need the id from this call.
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new PlacesApiError(
      res.status,
      `Places searchText ${res.status}: ${text.slice(0, 200)}`,
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
      // displayName + formattedAddress are captured so we can prove
      // we resolved the right listing (admin panel + customer email).
      // rating + userRatingCount + reviews are the actual payload.
      "X-Goog-FieldMask":
        "displayName,formattedAddress,rating,userRatingCount,reviews",
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
    displayName?: { text?: string };
    formattedAddress?: string;
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
    displayName:
      typeof json.displayName?.text === "string" ? json.displayName.text : null,
    formattedAddress:
      typeof json.formattedAddress === "string"
        ? json.formattedAddress
        : null,
  };
}
