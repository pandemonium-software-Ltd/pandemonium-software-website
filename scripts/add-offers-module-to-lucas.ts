// One-off: add the Offers module to Lucas's Module Selections in
// Notion so the new module surfaces in his onboarding hub for
// testing.
//
// Idempotent — if Offers is already in his selections, this is a
// no-op (write completes, set membership unchanged).
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/add-offers-module-to-lucas.ts

import { getProspectByToken } from "../src/lib/notion-prospects";
import { notionFetch } from "../src/lib/notion";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const current = new Set(lucas.moduleSelections);
  console.log("Current Module Selections:", [...current].join(", ") || "(none)");
  if (current.has("Offers")) {
    console.log("✓ Already has Offers — nothing to do.");
    return;
  }
  current.add("Offers");

  // Patch Notion's Module Selections multi_select property. Notion
  // requires us to send the FULL replacement list, not a delta.
  await notionFetch(`/pages/${lucas.pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Module Selections": {
          multi_select: [...current].map((name) => ({ name })),
        },
      },
    },
  });

  const after = await getProspectByToken(LUCAS_TOKEN);
  console.log("Now: ", after?.moduleSelections.join(", "));
  console.log("\n✓ Offers added. Lucas's hub will show the module on next page load.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
