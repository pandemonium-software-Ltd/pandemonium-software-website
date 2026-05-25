-- Sentry alerts inbox.
-- Receives webhook POSTs from Sentry Internal Integrations.
-- One row per Sentry issue (unique by sentry_issue_id) — re-alerts
-- bump count + last_seen_at via UPSERT rather than duplicating.
--
-- Admin UI on /admin lists unresolved alerts; operator clicks
-- Resolve to mark them done locally. Sentry-side resolution is
-- independent (we don't sync back today — keep it simple).
CREATE TABLE IF NOT EXISTS sentry_alerts (
  -- Sentry's stable issue id (string, e.g. "5824012345"). Primary
  -- key so repeats UPSERT cleanly.
  sentry_issue_id   TEXT PRIMARY KEY,
  -- e.g. "Cannot read property 'foo' of undefined"
  title             TEXT NOT NULL,
  -- "fatal" / "error" / "warning" / "info" / "debug"
  level             TEXT NOT NULL,
  -- e.g. "production", "development"
  environment       TEXT,
  -- Sentry project slug, e.g. "ops-worker"
  project_slug      TEXT,
  -- Permalink into Sentry UI for "Open in Sentry" button.
  sentry_url        TEXT NOT NULL,
  -- ISO-8601 timestamps from the Sentry payload.
  first_seen_at     TEXT,
  last_seen_at      TEXT NOT NULL,
  -- How many times the issue has fired (across the whole life of
  -- the issue, not just since we started capturing). Sentry
  -- maintains this; we just store the latest value on each
  -- webhook.
  event_count       INTEGER NOT NULL DEFAULT 1,
  -- "open" or "resolved". Operator flips via /api/admin/sentry/resolve.
  status            TEXT NOT NULL DEFAULT 'open',
  resolved_at       TEXT,
  resolved_by       TEXT,
  resolution_note   TEXT,
  -- When we first saw this issue via webhook.
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- When the last webhook for this issue arrived (updated on every
  -- repeat). Drives the admin list's sort order.
  updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sentry_alerts_status
  ON sentry_alerts(status, updated_at DESC);
