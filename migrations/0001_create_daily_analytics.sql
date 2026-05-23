-- One row per (customer, day). Re-runs of the nightly cron are
-- idempotent via the PRIMARY KEY — if Cloudflare returns updated
-- numbers for the same day (rare but possible during the few hours
-- after midnight UTC when aggregates are still settling), we
-- overwrite with the latest.

CREATE TABLE IF NOT EXISTS daily_analytics (
  -- Prospect token from Notion (the same UUID the customer uses
  -- everywhere — /account/[token], /onboarding/[token], etc.).
  -- Lets us join back to Notion without storing zoneId per row.
  token         TEXT NOT NULL,

  -- ISO date (YYYY-MM-DD), UTC. The day this snapshot represents.
  date          TEXT NOT NULL,

  -- Total pageviews (Cloudflare's HTML-only count, falls back to
  -- total requests when the zone is too low-traffic for the
  -- pageview sampler).
  pageviews     INTEGER NOT NULL DEFAULT 0,

  -- Estimated unique visitors. Cloudflare edge fingerprint —
  -- approximate, but no cookie banner needed.
  uniques       INTEGER NOT NULL DEFAULT 0,

  -- JSON arrays of {name, count} entries, max 10 each.
  -- Stored as JSON (not separate tables) because:
  --   1. The list is small + only ever read together with the row
  --   2. We don't query INTO top_pages — only render it whole
  --   3. Saves us 20× more rows in the prune sweep
  top_pages     TEXT NOT NULL DEFAULT '[]',
  top_referrers TEXT NOT NULL DEFAULT '[]',

  -- When we actually wrote the row (for debugging stale data).
  captured_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (token, date)
);

-- The window-read query is `WHERE token = ? AND date >= ?` — the
-- PK index already covers it (leftmost prefix), so no extra index
-- needed. The prune sweep is `WHERE date < ?` across all tokens,
-- which scans — fine for our scale (1k customers × 730 days =
-- 730k rows, scan completes in <1s).
