// Print Lucas's snapshot as Cowork sees it — useful for debugging
// rebuildOnly misfires (e.g. "I updated my logo" classified as
// out_of_scope because the assets slice is empty in Notion).
//
// Run with: npx tsx --env-file=.dev.vars scripts/inspect-lucas-snapshot.ts

import { getProspectByToken } from "../src/lib/notion-prospects";
import { buildSiteSnapshot } from "../src/lib/change-requests/site-snapshot";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const snapshot = buildSiteSnapshot(lucas);
  console.log("=== Snapshot (what Haiku sees) ===");
  console.log(JSON.stringify(snapshot, null, 2));
  console.log("\n=== Raw onboardingData.assets ===");
  const ob = lucas.onboardingData as Record<string, unknown>;
  console.log(JSON.stringify(ob?.assets ?? null, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
