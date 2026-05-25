// Daily GDPR scrub tick — enforces the 30-day personal-data
// retention policy stated in /terms section 11.
//
// Triggered by the "0 3 * * *" cron entry in wrangler-ops.jsonc
// (03:00 UTC, sat after analytics + reviews so we don't stack
// outbound load).
//
// For every prospect whose:
//   - Status === "Cancelled"
//   - Data Retention Until <= today
//   - Data Scrubbed At is NOT set
// the tick:
//   1. Deletes their D1 rows (gbp_reviews, newsletter_events,
//      daily_analytics) — keyed by token.
//   2. Replaces their personal-data Notion properties with
//      "[scrubbed]" placeholders. Money fields + business name
//      preserved (HMRC 7-year requirement).
//   3. Stamps Data Scrubbed At = now (safety latch — prevents
//      re-runs).
//
// Errors per-prospect are caught and logged; the loop continues
// so one bad scrub doesn't block the rest. The Data Scrubbed At
// latch only stamps after ALL writes succeed, so a failure leaves
// the prospect re-scheduled for tomorrow's tick.
//
// R2 brand assets: TODO — when R2 client is wired into the ops
// worker, delete every object under
// `prospects/<token>/` prefix. For now we log the intent.

import { getServerEnv } from "../lib/env";
import {
  listAllProspects,
  markScrubbed,
  scrubPersonalDataFields,
  type ProspectRecord,
} from "../lib/notion-prospects";
import { isDueForScrub } from "../lib/gdpr-retention";
import type { D1Database } from "../lib/d1-analytics";

export async function runGdprScrubTick(args: {
  db: D1Database;
}): Promise<void> {
  const tickId = new Date().toISOString();
  console.log(`[gdpr-scrub:${tickId}] starting`);

  // We rely on getServerEnv() only to assert the worker is wired
  // correctly; the scrub itself doesn't need any specific secret.
  try {
    getServerEnv();
  } catch (e) {
    console.error(
      `[gdpr-scrub:${tickId}] env validation failed — refusing to scrub: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  let prospects: ProspectRecord[];
  try {
    prospects = await listAllProspects();
  } catch (e) {
    console.error(
      `[gdpr-scrub:${tickId}] failed to list prospects: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const due = prospects.filter((p) =>
    isDueForScrub(p, p.dataRetentionUntil, p.dataScrubbedAt),
  );
  console.log(
    `[gdpr-scrub:${tickId}] ${due.length} prospect(s) due for scrub today (of ${prospects.length} total)`,
  );

  let ok = 0;
  let failed = 0;
  for (const prospect of due) {
    try {
      // ---- D1 deletes ----
      // Three tables, one DELETE each. SQLite raises no error if
      // there are no rows to delete — safe to call regardless.
      await args.db
        .prepare(`DELETE FROM daily_analytics WHERE token = ?`)
        .bind(prospect.token)
        .run();
      await args.db
        .prepare(`DELETE FROM newsletter_events WHERE token = ?`)
        .bind(prospect.token)
        .run();
      await args.db
        .prepare(`DELETE FROM gbp_reviews WHERE token = ?`)
        .bind(prospect.token)
        .run();

      // ---- Notion personal-data scrub ----
      await scrubPersonalDataFields(prospect.pageId);

      // ---- Latch the scrub timestamp (ONLY after writes succeed) ----
      await markScrubbed(prospect.pageId);

      // ---- R2 deletes (TODO when R2 binding is added) ----
      console.log(
        `[gdpr-scrub:${tickId}] ${prospect.token} (${prospect.name}) — scrubbed Notion + D1. R2 brand-asset deletion still manual until R2 binding is wired into the ops worker.`,
      );
      ok++;
    } catch (e) {
      console.error(
        `[gdpr-scrub:${tickId}] ${prospect.token} (${prospect.name}) FAILED: ${e instanceof Error ? e.message : String(e)}`,
      );
      failed++;
    }
  }

  console.log(
    `[gdpr-scrub:${tickId}] complete — scrubbed=${ok}, failed=${failed}`,
  );
}
