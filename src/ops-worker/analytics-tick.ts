// Daily analytics tick.
//
// Triggered by the "0 2 * * *" cron entry in wrangler-ops.jsonc.
// Once a day at 02:00 UTC we:
//   1. List every Live customer with a cloudflareZoneId set
//   2. For each: fetch yesterday's analytics from Cloudflare's
//      GraphQL Analytics API, write/replace a row in D1
//   3. After the loop: prune anything older than 730 days (24-month
//      rolling window — bounded growth regardless of customer count)
//
// Errors are logged + the loop continues. The job is idempotent so
// re-runs are safe — if a customer's fetch fails one night, the
// next night's run will still write their fresh row (just missing
// one day of history). We don't write Notion exception entries here
// because the volume could be noisy + the data isn't time-critical.

import { listProspectsNeedingOps } from "../lib/notion-prospects";
import {
  fetchDailySnapshot,
  yesterdayUtc,
  CloudflareAnalyticsError,
} from "../lib/cloudflare-analytics";
import {
  insertDailySnapshot,
  pruneOlderThan,
  type D1Database,
} from "../lib/d1-analytics";

// Marketing site (modu-forge.co.uk) lives on the same Cloudflare
// account as Ben's other zones but has no prospect record. We
// snapshot it alongside customers using a reserved token "@self" —
// the @ prefix can't collide with a UUID token, so the D1 PK is
// safe. Read back via /api/admin/analytics on the admin dashboard.
const SELF = {
  token: "@self",
  zoneId: "7d59a1613bd3d93e59552ebadcc3a53f",
  name: "modu-forge.co.uk",
} as const;

export async function runAnalyticsTick(args: {
  db: D1Database;
}): Promise<void> {
  const tickId = new Date().toISOString();
  const date = yesterdayUtc();
  console.log(`[analytics:${tickId}] starting for date=${date}`);

  let prospects;
  try {
    prospects = await listProspectsNeedingOps();
  } catch (e) {
    console.error(
      `[analytics:${tickId}] failed to list prospects: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  // Only Live customers with a zone we can query. Pre-launch
  // prospects don't have a site to measure; Cancelled ones we
  // explicitly stop tracking.
  const customerTargets = prospects.filter(
    (p) => p.status === "Live" && !!p.cloudflareZoneId,
  );
  // Add the marketing site as a virtual target. Same fetch + insert
  // path as customers — keeps the storage layer uniform.
  const targets = [
    ...customerTargets.map((p) => ({
      token: p.token,
      zoneId: p.cloudflareZoneId!,
      name: p.name,
    })),
    SELF,
  ];
  console.log(
    `[analytics:${tickId}] ${customerTargets.length} live customer(s) + self to snapshot`,
  );

  let ok = 0;
  let failed = 0;
  for (const target of targets) {
    try {
      const snapshot = await fetchDailySnapshot(target.zoneId, date);
      await insertDailySnapshot(args.db, {
        token: target.token,
        snapshot,
      });
      ok++;
      console.log(
        `[analytics:${tickId}] ${target.name} (${target.token}): ${snapshot.pageviews} pageviews, ${snapshot.uniques} uniques`,
      );
    } catch (e) {
      failed++;
      // Cloudflare analytics errors are usually transient (rate
      // limit) or scope-related (token missing Analytics:Read).
      // Log + carry on — re-runs are idempotent.
      const msg =
        e instanceof CloudflareAnalyticsError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      console.error(
        `[analytics:${tickId}] ${target.name} (${target.token}): ${msg}`,
      );
    }
  }

  // Prune at the end regardless — even if some inserts failed,
  // anything past the 24-month window should still go.
  try {
    const { deleted } = await pruneOlderThan(args.db, 730);
    if (deleted > 0) {
      console.log(
        `[analytics:${tickId}] pruned ${deleted} row(s) older than 730 days`,
      );
    }
  } catch (e) {
    console.error(
      `[analytics:${tickId}] prune failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  console.log(
    `[analytics:${tickId}] complete: ${ok} ok, ${failed} failed`,
  );
}
