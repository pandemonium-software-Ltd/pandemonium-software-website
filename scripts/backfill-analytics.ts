// One-off: backfill the last 3 days of Cloudflare analytics for a
// single customer (or @self) into the pandemonium_analytics D1, so
// we can verify the dashboard tile without waiting for the 02:00
// UTC cron.
//
// Usage:
//   npx tsx scripts/backfill-analytics.ts                  # Lucas-MyGem
//   npx tsx scripts/backfill-analytics.ts <prospect-uuid>  # other customer
//   npx tsx scripts/backfill-analytics.ts @self            # modu-forge.co.uk
//
// For @self we hardcode the zone id; for any other token we look
// up the prospect record in Notion to read its cloudflareZoneId.
// Inserts via `wrangler d1 execute --remote` so the same DB the
// live ops Worker + main Worker read from gets populated.

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProspectByToken } from "../src/lib/notion-prospects";
import { fetchDailySnapshot } from "../src/lib/cloudflare-analytics";

const DEFAULT_TOKEN = "d930bdb5-f015-44e5-afcc-f741a3c98d8a"; // Lucas-MyGem

// Reserved token mapped to a hardcoded zone (kept in lock-step with
// SELF in src/ops-worker/analytics-tick.ts). Lets us populate self-
// stats without inventing a fake Notion prospect.
const SELF_TOKEN = "@self";
const SELF_ZONE_ID = "7d59a1613bd3d93e59552ebadcc3a53f";
const SELF_NAME = "modu-forge.co.uk";

async function main() {
  const token = process.argv[2] ?? DEFAULT_TOKEN;
  let zoneId: string;
  let displayName: string;
  if (token === SELF_TOKEN) {
    zoneId = SELF_ZONE_ID;
    displayName = SELF_NAME;
  } else {
    const prospect = await getProspectByToken(token);
    if (!prospect) {
      console.error(`No prospect with token=${token}`);
      process.exit(1);
    }
    if (!prospect.cloudflareZoneId) {
      console.error(`${prospect.name} has no cloudflareZoneId on record`);
      process.exit(1);
    }
    zoneId = prospect.cloudflareZoneId;
    displayName = prospect.name;
  }
  console.log(`Backfilling for ${displayName} (zone=${zoneId})`);

  // Last 3 UTC days: yesterday, day before, day before that.
  const dates: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  for (const date of dates) {
    try {
      const snap = await fetchDailySnapshot(zoneId, date);
      console.log(
        `  ${date}: ${snap.pageviews} pageviews, ${snap.uniques} uniques, ${snap.topPages.length} top pages, ${snap.topReferrers.length} top referrers`,
      );

      // Write via `wrangler d1 execute --file=...`. We shell out
      // (rather than bind D1 directly) because this is a local
      // Node script — going through the CLI avoids setting up
      // miniflare. We use --file rather than --command to dodge
      // multi-level shell-escaping with the JSON columns.
      const sql = `INSERT OR REPLACE INTO daily_analytics
        (token, date, pageviews, uniques, top_pages, top_referrers, captured_at)
       VALUES
        ('${token}', '${date}', ${snap.pageviews}, ${snap.uniques},
         '${JSON.stringify(snap.topPages).replace(/'/g, "''")}',
         '${JSON.stringify(snap.topReferrers).replace(/'/g, "''")}',
         CURRENT_TIMESTAMP);`;
      const tmpFile = join(tmpdir(), `backfill-${token}-${date}.sql`);
      writeFileSync(tmpFile, sql);
      try {
        execSync(
          `npx wrangler d1 execute pandemonium-analytics --remote --file=${tmpFile}`,
          { stdio: ["ignore", "pipe", "pipe"] },
        );
      } finally {
        try {
          unlinkSync(tmpFile);
        } catch {
          /* ignore */
        }
      }
      console.log(`  ${date}: written to D1`);
    } catch (e) {
      console.error(
        `  ${date}: failed — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
