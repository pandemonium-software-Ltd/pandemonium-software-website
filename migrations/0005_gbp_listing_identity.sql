-- Add the resolved listing's display name + formatted address to
-- gbp_reviews. Captured on every fetch so:
--   - /admin can prove we picked the right listing for each
--     customer at a glance (no need to click into Google).
--   - The gbp-module-ready customer email can quote the name +
--     address back so the customer immediately spots a mis-match.
--   - The customer dashboard can render "Showing reviews for
--     <Name>, <Address>" for transparency.
--
-- Both nullable — older rows (written before this migration) keep
-- working; the next cron tick populates them.

ALTER TABLE gbp_reviews ADD COLUMN display_name TEXT;
ALTER TABLE gbp_reviews ADD COLUMN formatted_address TEXT;
