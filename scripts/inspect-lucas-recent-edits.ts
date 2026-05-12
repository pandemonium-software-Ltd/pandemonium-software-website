// Full dump of Lucas's most recent review.edits — message body,
// classifier output, applied patch. Used to diagnose why a free-text
// change request didn't apply word-for-word.
//
// Run with: npx tsx --env-file=.dev.vars scripts/inspect-lucas-recent-edits.ts

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken(
    "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9",
  );
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = lucas.onboardingData as {
    review?: { edits?: Array<Record<string, unknown>> };
  };
  const edits = ob?.review?.edits ?? [];
  console.log(`Total edits: ${edits.length}\n`);
  // Show last 5 with FULL raw JSON so we see every field including
  // classifier output and applied patches under whatever key names
  // the schema uses.
  const recent = [...edits].slice(-5).reverse();
  for (const e of recent) {
    console.log("─".repeat(70));
    console.log(JSON.stringify(e, null, 2));
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
