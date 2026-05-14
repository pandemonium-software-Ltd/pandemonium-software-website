// Quick peek at any prospect's state by token. Used for debugging
// "customer X can't do Y" issues without writing a one-off each time.
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/peek-prospect-state.ts <token>

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error("Usage: npx tsx --env-file=.dev.vars scripts/peek-prospect-state.ts <token>");
    process.exit(1);
  }
  const p = await getProspectByToken(token);
  if (!p) {
    console.error(`Prospect ${token} not found.`);
    process.exit(1);
  }
  console.log("name:                    ", p.name);
  console.log("business:                ", p.business);
  console.log("email:                   ", p.email);
  console.log("status:                  ", p.status);
  console.log("phase1SubmittedAt:       ", p.phase1SubmittedAt);
  console.log("phase2SubmittedAt:       ", p.phase2SubmittedAt);
  console.log("phase3SubmittedAt:       ", p.phase3SubmittedAt);
  console.log("compatibilityResult:     ", p.compatibilityResult);
  console.log("moduleSelections:        ", p.moduleSelections);
  console.log("setupFee:                ", p.setupFeeCalculated);
  console.log("monthlyFee:              ", p.monthlyFeeCalculated);
  console.log("foundingMember:          ", p.foundingMember);
  console.log("passwordHash:            ", p.passwordHash ? "[set]" : "[unset]");
  console.log("step flags (1-6):        ", [
    p.onboardingStep1Done, p.onboardingStep2Done, p.onboardingStep3Done,
    p.onboardingStep4Done, p.onboardingStep5Done, p.onboardingContentDone,
  ]);
  console.log("goLiveDate:              ", p.goLiveDate);
  console.log("cloudflareAccountId:     ", p.cloudflareAccountId);
  console.log("cloudflareZoneId:        ", p.cloudflareZoneId);
  console.log("cloudflareZoneStatus:    ", p.cloudflareZoneStatus);
  console.log("workerName:              ", p.workerName);
  console.log("siteLiveAt:              ", p.siteLiveAt);
  console.log("moduleChangeRoundUsedAt: ", p.moduleChangeRoundUsedAt);
  console.log("moduleChangeLog count:   ", p.moduleChangeLog.length);
  if (p.moduleChangeLog.length > 0) {
    console.log("most-recent module change:");
    const last = p.moduleChangeLog[p.moduleChangeLog.length - 1];
    console.log(JSON.stringify(last, null, 2));
  }
  console.log("onboardingData keys:     ", Object.keys((p.onboardingData ?? {}) as Record<string, unknown>));
}

main().catch((e) => { console.error(e); process.exit(1); });
