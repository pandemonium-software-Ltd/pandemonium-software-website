// One-off smoke test for createProspect — runs the same code path as
// the live /api/enquiry route, but locally with full error visibility.
//
// Run with:  npx tsx --env-file=.dev.vars scripts/test-create-prospect.ts

import { createProspect } from "../src/lib/notion-prospects";

async function main() {
  const token = crypto.randomUUID();
  console.log("Token:", token);
  console.log("Calling createProspect...");
  try {
    const result = await createProspect(
      {
        name: "Local Smoke Test",
        email: "local-smoke@pandemoniumsoftware.test",
        phone: "07700 900999",
        business: "Local Smoke Test Ltd",
        businessType: "Plumber",
        location: "Oxford",
        websiteSituation: "Not sure",
      },
      token,
    );
    console.log("✓ SUCCESS:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("✗ FAILED:", e);
    if (e instanceof Error && e.stack) {
      console.error(e.stack);
    }
    process.exit(1);
  }
}

main();
