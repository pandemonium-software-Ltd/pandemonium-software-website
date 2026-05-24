-- One row per customer holding the latest snapshot of their
-- Google Business Profile reviews. Populated by the daily ops
-- worker cron (gbp-reviews-tick.ts) for every Live customer with
-- the GBP module + a resolved place_id.
--
-- Why per-customer (not per-review) rows: the customer site only
-- ever shows the top 3-5 reviews + aggregate rating. Storing the
-- whole snapshot in one JSON column keeps the read path one
-- statement and the table 1 row per customer (1k rows max, ever).
--
-- Place_id is the stable Google identifier — we resolve it once
-- in step3-tools when the customer pastes their GBP URL, then
-- never have to parse the URL again on subsequent fetches.

CREATE TABLE IF NOT EXISTS gbp_reviews (
  -- Customer token = PK. One row per customer; cron does
  -- INSERT OR REPLACE on every refresh.
  token            TEXT NOT NULL PRIMARY KEY,

  -- Google Places place_id (ChIJ... or similar). Stable identifier
  -- — used by every fetch call to the Places Details API.
  place_id         TEXT NOT NULL,

  -- Aggregate rating (e.g. 4.7) — Google returns a float.
  rating           REAL,

  -- Total review count Google has on file (not just the top-N
  -- we display). Customer dashboard surfaces this as "Based on
  -- 142 Google reviews".
  total_reviews    INTEGER,

  -- Top reviews JSON array. Shape: [{authorName, rating, text,
  -- relativeTimeDescription, profilePhotoUrl?}]. Capped at 5
  -- entries (Places API caps at 5 too).
  top_reviews      TEXT NOT NULL DEFAULT '[]',

  -- When the cron last fetched. ISO-8601. Surfaced on the
  -- customer dashboard as "Reviews refreshed 4 hours ago" so
  -- the customer knows the data is live.
  fetched_at       TEXT NOT NULL,

  -- Last error message from the Places API if the most recent
  -- fetch failed (rate limit, invalid place_id after the customer
  -- merged their listing, etc.). Cleared on the next successful
  -- fetch. NULL = healthy.
  last_error       TEXT
);
