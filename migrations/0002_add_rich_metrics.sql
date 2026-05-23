-- Extends daily_analytics with the richer breakdowns that
-- httpRequests1dGroups exposes on every Cloudflare plan (free
-- included). All come from the same single GraphQL query as the
-- existing totals — zero extra API cost.
--
-- Columns added:
--   top_countries     JSON array of {name, count} — visitor source
--                     countries from sum.countryMap.
--   status_codes      JSON array of {name, count} — HTTP response
--                     status breakdown from sum.responseStatusMap.
--                     Useful for spotting broken-link spikes (404s).
--   threats           Total requests Cloudflare classified as
--                     threats and blocked. Nice "we protected your
--                     site from N attacks" gauge.
--   bandwidth_bytes   sum.bytes — total bandwidth Cloudflare served
--                     for the zone. Display in MB/GB.
--   cached_requests   sum.cachedRequests — used to compute cache
--                     hit rate vs total pageviews.
--
-- All columns default-empty so the migration is non-breaking — old
-- rows simply have empty/zero values, the dashboard renders gracefully.

ALTER TABLE daily_analytics ADD COLUMN top_countries TEXT NOT NULL DEFAULT '[]';
ALTER TABLE daily_analytics ADD COLUMN status_codes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE daily_analytics ADD COLUMN threats INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_analytics ADD COLUMN bandwidth_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_analytics ADD COLUMN cached_requests INTEGER NOT NULL DEFAULT 0;
