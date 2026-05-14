// Quick peek at Lucas's full state — used after a master-reset to
// confirm what's in Notion. Run with:
//   npx tsx --env-file=.dev.vars scripts/peek-lucas-state.ts

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  console.log("status:                  ", lucas.status);
  console.log("phase1SubmittedAt:       ", lucas.phase1SubmittedAt);
  console.log("phase2SubmittedAt:       ", lucas.phase2SubmittedAt);
  console.log("phase3SubmittedAt:       ", lucas.phase3SubmittedAt);
  console.log("compatibilityResult:     ", lucas.compatibilityResult);
  console.log("moduleSelections:        ", lucas.moduleSelections);
  console.log("setupFee:                ", lucas.setupFeeCalculated);
  console.log("monthlyFee:              ", lucas.monthlyFeeCalculated);
  console.log("passwordHash:            ", lucas.passwordHash ? "[set]" : "[unset]");
  console.log("step flags (1-6):        ", [
    lucas.onboardingStep1Done, lucas.onboardingStep2Done, lucas.onboardingStep3Done,
    lucas.onboardingStep4Done, lucas.onboardingStep5Done, lucas.onboardingContentDone,
  ]);
  console.log("goLiveDate:              ", lucas.goLiveDate);
  console.log("cloudflareAccountId:     ", lucas.cloudflareAccountId);
  console.log("cloudflareZoneId:        ", lucas.cloudflareZoneId);
  console.log("cloudflareZoneStatus:    ", lucas.cloudflareZoneStatus);
  console.log("workerName:              ", lucas.workerName);
  console.log("siteLiveAt:              ", lucas.siteLiveAt);
  console.log("onboardingData keys:     ", Object.keys((lucas.onboardingData ?? {}) as Record<string, unknown>));
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  if (ob.domain) {
    console.log("\nonboardingData.domain:");
    console.log(JSON.stringify(ob.domain, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
