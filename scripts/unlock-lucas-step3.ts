import { updateProspectOnboarding, getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  console.log("Step 3 (tools/modules) done before:", lucas.onboardingStep3Done);
  await updateProspectOnboarding(lucas.pageId, {
    stepDone: { step: 3, done: false },
  });
  const after = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  console.log("Step 3 done after:        ", after?.onboardingStep3Done);
  console.log("\n✓ Modules step unlocked — Lucas can re-edit it from the Hub.");
}
main().catch((e) => { console.error(e); process.exit(1); });
