// Diagnostic: dump Lucas's current review-edit state.
// Run with: npx tsx --env-file=.dev.vars scripts/check-lucas-edits.ts

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = lucas.onboardingData as {
    review?: { edits?: Array<Record<string, unknown>> };
  };
  const edits = ob?.review?.edits ?? [];
  console.log(`Lucas: ${edits.length} edit(s)`);
  for (const e of edits) {
    console.log(
      `  ${String(e.id).slice(0, 8)} status=${e.status} resolvedAt=${e.resolvedAt ?? "(none)"} coworkPatchAppliedAt=${e.coworkPatchAppliedAt ?? "(none)"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
