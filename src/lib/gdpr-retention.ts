// GDPR retention policy enforcement.
//
// Policy (matches /terms section 11):
//   - Personal data: deleted 30 days after Status flips to Cancelled.
//   - Financial records: kept 7 years from cancellation for HMRC
//     (VATA 1994 Sch 11 + Companies Act 2006 s388).
//
// "Personal data" here means everything that could identify or be
// linked to a person or their business operations:
//   - Notion onboardingData JSON (intake answers, contact, brand)
//   - Notion Phase 2 / Phase 3 data JSON
//   - Notion changeRequests + their messages
//   - Notion moduleChangeLog narrative fields (status + money
//     totals retained for HMRC)
//   - R2 brand assets (logos, photos, gallery)
//   - D1 gbp_reviews row for the customer
//   - D1 newsletter_events rows for the customer
//   - D1 daily_analytics rows for the customer
//
// "Financial records" (RETAINED for 7y):
//   - Setup Fee Calculated, Monthly Fee Calculated (Notion)
//   - Module Change Log money lines (id, submittedAt, deltas,
//     status, resolvedAt — NOT fromModules/toModules narrative)
//   - Customer business name (so the operator can answer
//     HMRC/Stripe queries about historical invoices)
//
// All logic here is pure where possible — the cron file
// (gdpr-scrub-tick.ts) orchestrates the actual writes.

import type { ProspectRecord } from "./notion-prospects";

export const PERSONAL_DATA_RETENTION_DAYS = 30;
export const FINANCIAL_RECORD_RETENTION_YEARS = 7;

/** Returns the ISO date (YYYY-MM-DD) personal data should be
 *  scrubbed by, given a cancellation date. Adds 30 days in UTC.
 *  Used both by the writer that stamps Notion at cancellation
 *  time AND by the cron that decides whether to scrub today. */
export function personalDataRetentionUntil(
  cancelledAt: string,
  retentionDays = PERSONAL_DATA_RETENTION_DAYS,
): string {
  const start = new Date(cancelledAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`invalid cancelledAt: ${cancelledAt}`);
  }
  const until = new Date(start);
  until.setUTCDate(until.getUTCDate() + retentionDays);
  return until.toISOString().slice(0, 10);
}

/** Customer is due to be scrubbed if:
 *    - Status is Cancelled
 *    - Personal data retention date has passed
 *    - They haven't been scrubbed already (no Data Scrubbed At)
 *
 *  Pure predicate so the cron tick can filter prospects without
 *  another Notion round-trip. */
export function isDueForScrub(
  prospect: ProspectRecord,
  retentionUntil: string | undefined,
  scrubbedAt: string | undefined,
  now: Date = new Date(),
): boolean {
  if (prospect.status !== "Cancelled") return false;
  if (scrubbedAt) return false; // already done — safety latch
  if (!retentionUntil) return false; // no date stamped = bail
  const today = now.toISOString().slice(0, 10);
  return today >= retentionUntil;
}

/** The Notion property names this module reads + writes. Centralised
 *  so a future column rename is one-line. */
export const RETENTION_FIELDS = {
  retentionUntil: "Data Retention Until",
  cancelledAt: "Cancelled At",
  scrubbedAt: "Data Scrubbed At",
} as const;
