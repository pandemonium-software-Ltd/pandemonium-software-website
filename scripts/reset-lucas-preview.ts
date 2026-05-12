// One-off: reset Lucas's Step 6 (Review/preview) so the
// "Request site preview" button is available again.
//
// Clears:
//   - onboardingData.review.previewSubmittedAt (so step5-review cron
//     stops thinking a preview was already requested)
//   - onboardingData.review.previewUrl (so the customer-facing
//     preview iframe doesn't show stale content)
//   - onboardingData.review.finalSignOff (already false from the
//     earlier revert, but defensive)
//   - "Onboarding Step 5 Done" Notion column (review step's
//     done flag — Notion column 5 = review)
//   - Preview Build Triggered At + Preview Build Failed At latches
//     so step5 can re-trigger the build cleanly
//
// KEEPS:
//   - All review.edits[] history (so previously-applied edits stay
//     visible in /admin for context)
//   - Status (stays at Onboarding Started)
//   - Everything else
//
// Run with: npx tsx --env-file=.dev.vars scripts/reset-lucas-preview.ts

import {
  getProspectByToken,
  updateProspectOnboarding,
  clearPreviewBuildTriggered,
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
  console.log(`  step5 (review) done: ${lucas.onboardingStep5Done}`);
  console.log(
    `  previewBuildTriggeredAt: ${lucas.previewBuildTriggeredAt ?? "(empty)"}`,
  );
  const obBefore = (lucas.onboardingData ?? {}) as {
    review?: {
      previewSubmittedAt?: string;
      previewUrl?: string;
      finalSignOff?: boolean;
      edits?: unknown[];
    };
  };
  console.log(
    `  review.previewSubmittedAt: ${obBefore.review?.previewSubmittedAt ?? "(empty)"}`,
  );
  console.log(
    `  review.previewUrl: ${obBefore.review?.previewUrl ?? "(empty)"}`,
  );
  console.log(
    `  review.finalSignOff: ${obBefore.review?.finalSignOff ?? false}`,
  );
  console.log(
    `  review.edits count (preserved): ${obBefore.review?.edits?.length ?? 0}`,
  );

  // Clear preview-related fields from review slice without trashing
  // the edits history (operator wants to see past Cowork audit).
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const review = (ob.review ?? {}) as Record<string, unknown>;
  const newReview: Record<string, unknown> = { ...review };
  delete newReview.previewSubmittedAt;
  delete newReview.previewUrl;
  newReview.finalSignOff = false;
  const newOnboarding = { ...ob, review: newReview };

  await updateProspectOnboarding(lucas.pageId, {
    data: newOnboarding as Parameters<typeof updateProspectOnboarding>[1]["data"],
    stepDone: { step: 5, done: false }, // Notion column 5 = review
  });

  // Clear preview-build latches via the dedicated writer.
  await clearPreviewBuildTriggered(lucas.pageId, { failure: false }).catch(
    (e) => {
      console.warn(
        `[reset-preview] couldn't clear build latches: ${e instanceof Error ? e.message : String(e)}`,
      );
    },
  );

  const after = await getProspectByToken(LUCAS_TOKEN);
  console.log("\nAfter:");
  console.log(`  step5 (review) done: ${after?.onboardingStep5Done}`);
  console.log(
    `  previewBuildTriggeredAt: ${after?.previewBuildTriggeredAt ?? "(empty)"}`,
  );
  const obAfter = (after?.onboardingData ?? {}) as {
    review?: {
      previewSubmittedAt?: string;
      previewUrl?: string;
      finalSignOff?: boolean;
      edits?: unknown[];
    };
  };
  console.log(
    `  review.previewSubmittedAt: ${obAfter.review?.previewSubmittedAt ?? "(empty)"}`,
  );
  console.log(
    `  review.previewUrl: ${obAfter.review?.previewUrl ?? "(empty)"}`,
  );
  console.log(
    `  review.finalSignOff: ${obAfter.review?.finalSignOff ?? false}`,
  );
  console.log(
    `  review.edits count: ${obAfter.review?.edits?.length ?? 0}`,
  );
  console.log(
    "\n✓ Step 6 (Review) reset. Lucas can hit 'Request site preview' again.",
  );
  console.log(
    "  step5-review cron will rebuild within 15 min (or next manual dispatch).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
