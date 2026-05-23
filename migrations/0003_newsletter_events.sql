-- One row per (Resend email, event type). Stores Resend webhook
-- callbacks so we can compute open / click / bounce / unsubscribe
-- rates per send for the customer dashboard's newsletter
-- analytics tab.
--
-- Why we don't dedupe by (token, send_id, recipient): some
-- customers will send to a recipient multiple times across sends,
-- and we want to count those independently. We DO dedupe by
-- (resend_email_id, event_type) so a single email opened five
-- times still counts as 1 open. Resend re-fires opens — without
-- this PK constraint they'd inflate.

CREATE TABLE IF NOT EXISTS newsletter_events (
  -- Resend's unique email id (one per recipient per send). Look
  -- up via content.newsletter.history[i].recipients[].resendEmailId
  -- on the prospect record to get back to the customer + send.
  resend_email_id TEXT NOT NULL,

  -- delivered / opened / clicked / bounced / complained / unsubscribed.
  -- (Free-text rather than CHECK constraint — Resend may add new
  -- event types and we'd rather log them than reject.)
  event_type      TEXT NOT NULL,

  -- Customer token + their internal send id — denormalised here
  -- so the aggregation query doesn't have to JOIN against Notion.
  token           TEXT NOT NULL,
  send_id         TEXT NOT NULL,

  -- When Resend reported the event (their timestamp, not ours).
  created_at      TEXT NOT NULL,

  PRIMARY KEY (resend_email_id, event_type)
);

-- The dashboard read is `WHERE token = ? AND send_id IN (...)`
-- ordered by created_at. Without this index that scans the whole
-- table. At expected scale (1k customers × 12 sends/year × 100
-- recipients × ~3 events each = 3.6M rows) the scan is still
-- < 1s but the index brings it to single-digit ms.
CREATE INDEX IF NOT EXISTS idx_newsletter_events_token_send
  ON newsletter_events (token, send_id);
