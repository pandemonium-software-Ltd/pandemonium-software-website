// Hash-based cache for Haiku-polished copy.
//
// Why cache: re-builds happen often (every preview request rebuilds
// the site). Polishing the same text twice wastes tokens. The cache
// is keyed on a hash of (kind + raw_input), so when a customer edits
// their about blurb and re-builds, only the changed text gets re-
// polished — every other field is a cache hit.
//
// Storage: `Haiku Cache` rich_text column on the prospect's Notion
// page, JSON-stringified. Read at adapter time, mutated in-memory
// by the polish pipeline, written back atomically at the end of
// enrichment.
//
// Cache value shape:
//   { polished: string, model: string, polishedAt: ISO string }
// Storing model + polishedAt makes it possible to bulk-invalidate
// later if we change the model name or want to force re-polish
// after, e.g., 90 days. Not used yet — present so we don't have to
// migrate the cache shape later.
//
// Hash algorithm: SHA-256 of `${kind}:${trimmed_input}`. We use the
// Web Crypto SubtleCrypto API (available in both Workers and
// Node 20+ runtime) so this works in every environment the build
// pipeline can run in.

const CACHE_VERSION = 1;

export type CacheValue = {
  polished: string;
  model: string;
  polishedAt: string;
  /** Bumped manually when we change the prompt enough that old
   *  cache entries should be invalidated. */
  v: number;
};

export type HaikuCache = Record<string, CacheValue>;

/**
 * Compute the cache key for a given polish kind + raw input.
 * Same input → same key, every time.
 *
 * `kind` is "tagline", "about-blurb", "service-desc", "faq-answer"
 * etc. — distinct namespaces so the same string polished as different
 * kinds doesn't collide.
 */
export async function cacheKey(
  kind: string,
  rawInput: string,
): Promise<string> {
  const normalised = `${kind}:${rawInput.trim()}`;
  const bytes = new TextEncoder().encode(normalised);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  // First 16 bytes (32 hex chars) is plenty for collision avoidance
  // at our scale (max ~100 entries per prospect).
  return bytesToHex(new Uint8Array(digest).slice(0, 16));
}

/**
 * Read a cache entry by key. Returns the polished text on hit, null
 * on miss or shape mismatch (which forces a re-polish). Validates the
 * version + presence of `polished` so partially-corrupted cache
 * entries don't silently serve stale or wrong data.
 */
export function readCache(cache: HaikuCache, key: string): string | null {
  const entry = cache[key];
  if (!entry || typeof entry !== "object") return null;
  if (entry.v !== CACHE_VERSION) return null;
  if (typeof entry.polished !== "string" || entry.polished.length === 0) {
    return null;
  }
  return entry.polished;
}

/**
 * Set a cache entry. Mutates the cache object in place; the caller
 * is responsible for persisting the cache via writeHaikuCache once
 * the whole enrichment pass is done (one Notion write per build,
 * not per polish).
 */
export function writeCache(
  cache: HaikuCache,
  key: string,
  polished: string,
  model: string,
): void {
  cache[key] = {
    polished,
    model,
    polishedAt: new Date().toISOString(),
    v: CACHE_VERSION,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, "0");
  }
  return s;
}
