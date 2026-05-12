// Quick check: does Lucas have the required fields (vibe + brand
// colors + services) in his Phase 3 intake that the adapter needs?
// Without these, adaptProspect() throws AdapterError at build time.
//
// Run with: npx tsx --env-file=.dev.vars scripts/check-lucas-phase3.ts

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken(
    "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9",
  );
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const p3 = (lucas.phase3Data ?? {}) as Record<string, unknown>;
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const branding = (ob.branding ?? {}) as Record<string, unknown>;
  console.log("Phase 3 required fields (adapter must find these):");
  console.log(`  vibe:                ${p3.vibe ?? "(missing)"} (or branding.vibe: ${branding.vibe ?? "(missing)"})`);
  console.log(`  brandColorPrimary:   ${p3.brandColorPrimary ?? "(missing)"} (or branding: ${branding.brandColorPrimary ?? "(missing)"})`);
  console.log(`  brandColorSecondary: ${p3.brandColorSecondary ?? "(missing)"} (or branding: ${branding.brandColorSecondary ?? "(missing)"})`);
  const services = Array.isArray(p3.services) ? p3.services : [];
  console.log(`  intake.services:     ${services.length} entries`);
  console.log(`  tagline (intake):    ${p3.tagline ?? "(missing — fine, content has it)"}`);
  console.log(`  aboutBlurb (intake): ${p3.aboutBlurb ?? "(missing — fine, content has it)"}`);
  console.log(`\nModule selections:   ${JSON.stringify(lucas.moduleSelections)}`);
  console.log(`Onboarding status:   ${lucas.status}`);
  console.log(`Step5 (review) done: ${lucas.onboardingStep5Done}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
