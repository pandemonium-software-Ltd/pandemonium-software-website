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
import { getServerEnv } from "../lib/env";
import {
  listAllProspects,
  markScrubbed,
  scrubPersonalDataFields,
  type ProspectRecord,
} from "../lib/notion-prospects";
import { isDueForScrub } from "../lib/gdpr-retention";
import type { D1Database } from "../lib/d1-analytics";

type R2Bucket = {
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  delete(keys: string | string[]): Promise<unknown>;
};

export async function runGdprScrubTick(args: {
  db: D1Database;
  r2?: R2Bucket;
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

      // ---- R2 brand-asset deletion ----
      const r2Deleted = await deleteR2Prefix(args.r2, `assets/${prospect.token}/`, tickId);

      // ---- Latch the scrub timestamp (ONLY after writes succeed) ----
      await markScrubbed(prospect.pageId);

      console.log(
        `[gdpr-scrub:${tickId}] ${prospect.token.slice(0, 8)} — scrubbed Notion + D1 + R2 (${r2Deleted} objects deleted).`,
      );
      ok++;
    } catch (e) {
      console.error(
        `[gdpr-scrub:${tickId}] ${prospect.token.slice(0, 8)} FAILED: ${e instanceof Error ? e.message : String(e)}`,
      );
      failed++;
    }
  }

  console.log(
    `[gdpr-scrub:${tickId}] complete — scrubbed=${ok}, failed=${failed}`,
  );
}

async function deleteR2Prefix(
  r2: R2Bucket | undefined,
  prefix: string,
  tickId: string,
): Promise<number> {
  if (!r2) {
    console.warn(`[gdpr-scrub:${tickId}] ASSETS_BUCKET R2 binding not available — skipping R2 cleanup for ${prefix}`);
    return 0;
  }

  let deleted = 0;
  let cursor: string | undefined;

  do {
    const result = await r2.list({ prefix, cursor });
    const keys = result.objects.map((o) => o.key);

    if (keys.length > 0) {
      await r2.delete(keys);
      deleted += keys.length;
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return deleted;
}
