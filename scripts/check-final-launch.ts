// Sanity check: confirm the Final Launch Triggered At field reads
// back from a prospect record after the column was added.
//
// Run with: npx tsx --env-file=.dev.vars scripts/check-final-launch.ts

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  console.log({
    status: lucas.status,
    goLiveDate: lucas.goLiveDate ?? "(not set)",
    siteLiveAt: lucas.siteLiveAt ?? "(not yet)",
    finalLaunchTriggeredAt: lucas.finalLaunchTriggeredAt ?? "(empty — good)",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
