// One-off: add the C5.7+ auth columns to the Prospects DB.
//
// Adds:
//   - "Password Hash"  → rich_text
//   - "Password Set At" → date
//
// Idempotent: PATCH-ing a database with the same property names
// re-applies the schema without changing existing rows. Safe to
// run multiple times.
//
// Run with: npx tsx --env-file=.dev.vars scripts/add-password-columns.ts

import { notionFetch } from "../src/lib/notion";
import { getServerEnv } from "../src/lib/env";

async function main() {
  const env = getServerEnv();
  console.log(`Patching Prospects DB (${env.NOTION_PROSPECTS_DB_ID})...`);

  await notionFetch(`/databases/${env.NOTION_PROSPECTS_DB_ID}`, {
    method: "PATCH",
    body: {
      properties: {
        "Password Hash": { rich_text: {} },
        "Password Set At": { date: {} },
      },
    },
  });

  console.log("✓ Columns added. Re-run set-lucas-password.ts to backfill.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
