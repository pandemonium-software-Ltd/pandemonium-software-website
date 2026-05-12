// One-off: unlock Step 4 (Content) on Lucas's Hub so the new
// Offers section is editable.
//
// Run with: npx tsx --env-file=.dev.vars scripts/unlock-lucas-step4.ts

import {
  getProspectByToken,
  updateProspectOnboarding,
} from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  console.log("Step 4 (content) done before:", lucas.onboardingStep4Done);
  await updateProspectOnboarding(lucas.pageId, {
    stepDone: { step: 6, done: false }, // content's done flag = step 6 in Notion
  });
  const after = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  console.log("Step 4 (content) done after: ", after?.onboardingContentDone);
  console.log("\n✓ Step 4 Content unlocked — Lucas can re-edit it + see the new Offers section.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
