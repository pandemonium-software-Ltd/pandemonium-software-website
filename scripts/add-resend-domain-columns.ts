// One-off: add the Resend domain verification columns to the
// Prospects DB. Used by step2b-resend-domain to track per-customer
// Resend domain registration + verification status.
//
// Idempotent: PATCH with the same property name re-applies the
// schema without changing existing rows. Safe to run multiple times.
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/add-resend-domain-columns.ts

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
        "Resend Domain Id": { rich_text: {} },
        "Resend Domain Verified At": { date: {} },
      },
    },
  });

  console.log(
    "✓ Columns added:\n" +
      "  - 'Resend Domain Id' (rich_text) — Resend UUID after domain registration\n" +
      "  - 'Resend Domain Verified At' (date) — stamped when Resend verifies the domain\n" +
      "  Existing rows are unaffected — both columns are null on them.",
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
