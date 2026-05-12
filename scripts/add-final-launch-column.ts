// One-off: add the "Final Launch Triggered At" date column to the
// Prospects DB. Used by step7-go-live as an anti-spam latch — set
// when the launch-day build is dispatched, cleared by the build
// callback once it completes (success or failure).
//
// Idempotent: PATCH with the same property name re-applies the
// schema without changing existing rows. Safe to run multiple times.
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/add-final-launch-column.ts

import { notionFetch } from "../src/lib/notion";
import { getServerEnv } from "../src/lib/env";

async function main() {
  const env = getServerEnv();
  console.log(
    `Patching Prospects DB (${env.NOTION_PROSPECTS_DB_ID})...`,
  );

  await notionFetch(`/databases/${env.NOTION_PROSPECTS_DB_ID}`, {
    method: "PATCH",
    body: {
      properties: {
        "Final Launch Triggered At": { date: {} },
      },
    },
  });

  console.log(
    "✓ Column 'Final Launch Triggered At' added.\n" +
      "  step7-go-live can now stamp + clear this latch.\n" +
      "  Existing rows are unaffected — the column is null on them.",
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
