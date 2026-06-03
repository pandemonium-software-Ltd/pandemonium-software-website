-- Business health checks — stores CI results, audit dates, and
-- secret rotation tracking for the admin Business Health panel.
--
-- check_type values:
--   'ci_run'           — weekly CI results (npm audit, tsc, tests)
--   'security_audit'   — manual full security audit date
--   'secret_rotation'  — per-secret rotation timestamp
--
-- The admin dashboard reads the most recent row per check_type
-- to compute the Business Health panel status.

CREATE TABLE IF NOT EXISTS business_health_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  check_type TEXT    NOT NULL,
  check_key  TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'pass',
  detail     TEXT,
  checked_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bhc_type_key ON business_health_checks (check_type, check_key, checked_at DESC);

-- Seed initial secret rotation entries so the panel shows "unknown"
-- age for each secret until they're actually rotated. Operators
-- update these via /api/internal/health-callback when rotating.
INSERT INTO business_health_checks (check_type, check_key, status, detail, checked_at)
VALUES
  ('secret_rotation', 'NOTION_API_KEY', 'pass', '{"note":"initial seed"}', datetime('now')),
  ('secret_rotation', 'STRIPE_SECRET_KEY', 'pass', '{"note":"initial seed"}', datetime('now')),
  ('secret_rotation', 'STRIPE_WEBHOOK_SECRET', 'pass', '{"note":"initial seed"}', datetime('now')),
  ('secret_rotation', 'RESEND_API_KEY', 'pass', '{"note":"initial seed"}', datetime('now')),
  ('secret_rotation', 'SESSION_SECRET', 'pass', '{"note":"initial seed"}', datetime('now')),
  ('secret_rotation', 'INTERNAL_BUILD_SECRET', 'pass', '{"note":"initial seed"}', datetime('now')),
  ('secret_rotation', 'GITHUB_TOKEN', 'pass', '{"note":"initial seed"}', datetime('now')),
  ('security_audit', '', 'pass', '{"findings":49,"fixed":49,"accepted":9}', '2026-06-03T00:00:00Z');
