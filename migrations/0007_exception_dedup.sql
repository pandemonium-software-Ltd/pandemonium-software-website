-- Dedup table for ops-worker exception emails.
-- Prevents the same prospect+step failure from spamming hundreds of
-- emails when the cron retries every minute.  The Notion exception
-- is still written every time for the audit trail; only the email
-- is suppressed within a 24-hour window.
CREATE TABLE IF NOT EXISTS exception_dedup (
  token      TEXT NOT NULL,
  step       TEXT NOT NULL,
  emailed_at TEXT NOT NULL,
  error_hash TEXT NOT NULL,
  PRIMARY KEY (token, step)
);
