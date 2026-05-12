// One-off: roll Lucas back from "Onboarding Complete" to a pre-
// signoff state so the Hub is mutable again for further testing.
//
// What it does:
//   - Flips status "Onboarding Complete" → "Onboarding Started"
//     (re-unlocks the Hub for editing)
//   - Clears onboardingData.review.finalSignOff so the signoff
//     checkbox is unchecked
//   - Clears Onboarding Step 5 Done so the Review step shows as
//     in-progress again
//   - Clears Final Launch Triggered At latch (if it was somehow set)
//
// What it KEEPS:
//   - All onboarding data (content, business, assets, etc.)
//   - The customer's chosen goLiveDate
//   - previewSubmittedAt / previewUrl (so the preview iframe still
//     renders if they re-open Step 5 — saves re-building)
//   - Per-step done flags for steps 1-4 (cloudflare/domain/tools/
//     content/assets — those are still validated)
//   - Site Live At (legacy stamp from step2; doesn't break anything)
//
// Run with: npx tsx --env-file=.dev.vars scripts/revert-lucas-signoff.ts

import {
  getProspectByToken,
  updateProspectOnboarding,
  clearFinalLaunchTriggered,
  type ProspectStatus,
} from "../src/lib/notion-prospects";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }

  console.log("Before:");
  console.log(`  status: ${lucas.status}`);
  console.log(`  goLiveDate: ${lucas.goLiveDate ?? "(none)"}`);
  console.log(`  step5Done: ${lucas.onboardingStep5Done}`);
  console.log(
    `  finalLaunchTriggeredAt: ${lucas.finalLaunchTriggeredAt ?? "(empty)"}`,
  );

  // Clear finalSignOff in the review slice without trashing the
  // rest of onboardingData (preview metadata, edits history, etc.).
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const review = (ob.review ?? {}) as Record<string, unknown>;
  const newReview = { ...review, finalSignOff: false };
  const newOnboarding = { ...ob, review: newReview };

  await updateProspectOnboarding(lucas.pageId, {
    data: newOnboarding as Parameters<typeof updateProspectOnboarding>[1]["data"],
    statusFlip: "Onboarding Started" as ProspectStatus,
    stepDone: { step: 5, done: false },
  });

  // Clear the launch latch separately (in case any retry attempted it).
  await clearFinalLaunchTriggered(lucas.pageId).catch(() => {});

  const after = await getProspectByToken(LUCAS_TOKEN);
  console.log("\nAfter:");
  console.log(`  status: ${after?.status}`);
  console.log(`  step5Done: ${after?.onboardingStep5Done}`);
  console.log(
    `  finalLaunchTriggeredAt: ${after?.finalLaunchTriggeredAt ?? "(empty)"}`,
  );
  console.log(
    "\n✓ Lucas rolled back to mutable Hub. He can re-edit Step 5 + re-sign-off when ready.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
