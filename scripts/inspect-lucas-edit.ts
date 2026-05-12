// Inspect a single review-edit on Lucas (id prefix). Shows the
// request text, classification, proposed patch, and applied state
// so we can tell whether a "didn't change anything" deploy was
// because Cowork escalated without applying or the build itself
// missed something.
//
// Run with: npx tsx --env-file=.dev.vars scripts/inspect-lucas-edit.ts <id-prefix>

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const prefix = process.argv[2] ?? "96b4d5b3";
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = lucas.onboardingData as {
    review?: { edits?: Array<Record<string, unknown>> };
    siteContent?: Record<string, unknown>;
    business?: Record<string, unknown>;
  };
  const edit = (ob?.review?.edits ?? []).find((e) =>
    String(e.id).startsWith(prefix),
  );
  if (!edit) {
    console.error(`No edit found with id prefix ${prefix}`);
    process.exit(1);
  }
  console.log(JSON.stringify(edit, null, 2));
  console.log("\n---");
  console.log("Current siteContent:");
  console.log(JSON.stringify(ob?.siteContent ?? {}, null, 2));
  console.log("\nCurrent business:");
  console.log(JSON.stringify(ob?.business ?? {}, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
