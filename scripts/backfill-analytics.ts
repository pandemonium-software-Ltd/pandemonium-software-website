// One-off: backfill the last 3 days of Cloudflare analytics for a
// single customer into the pandemonium_analytics D1, so we can
// verify the dashboard tile without waiting for tomorrow's 02:00
// UTC cron.
//
// Usage:
//   node --env-file=.dev.vars --import tsx scripts/backfill-analytics.ts <token>
//
// Default token = Lucas-MyGem if none provided. Inserts via
// `wrangler d1 execute --remote` so the same DB the live ops Worker
// + main Worker read from gets populated.

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProspectByToken } from "../src/lib/notion-prospects";
import { fetchDailySnapshot } from "../src/lib/cloudflare-analytics";

const DEFAULT_TOKEN = "d930bdb5-f015-44e5-afcc-f741a3c98d8a"; // Lucas-MyGem

async function main() {
  const token = process.argv[2] ?? DEFAULT_TOKEN;
  const prospect = await getProspectByToken(token);
  if (!prospect) {
    console.error(`No prospect with token=${token}`);
    process.exit(1);
  }
  if (!prospect.cloudflareZoneId) {
    console.error(`${prospect.name} has no cloudflareZoneId on record`);
    process.exit(1);
  }
  console.log(
    `Backfilling for ${prospect.name} (zone=${prospect.cloudflareZoneId})`,
  );

  // Last 3 UTC days: yesterday, day before, day before that.
  const dates: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  for (const date of dates) {
    try {
      const snap = await fetchDailySnapshot(prospect.cloudflareZoneId, date);
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
