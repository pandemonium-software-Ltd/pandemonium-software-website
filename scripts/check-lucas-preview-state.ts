// Inspect Lucas's preview build state so we can see whether the
// most recent auto-applied change request dispatched a fresh
// preview AND what the resulting preview URL is.
//
// Run with: npx tsx --env-file=.dev.vars scripts/check-lucas-preview-state.ts

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken(
    "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9",
  );
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const review = (ob.review ?? {}) as Record<string, unknown>;

  console.log("Lucas — preview state:");
  console.log(`  Status (Notion):            ${lucas.status}`);
  console.log(`  Step5 (review) done:        ${lucas.onboardingStep5Done}`);
  console.log(
    `  previewBuildTriggeredAt:    ${lucas.previewBuildTriggeredAt ?? "(empty)"}`,
  );
  console.log(
    `  previewBuildFailedAt:       ${lucas.previewBuildFailedAt ?? "(empty)"}`,
  );
  console.log(
    `  review.previewSubmittedAt:  ${review.previewSubmittedAt ?? "(empty)"}`,
  );
  console.log(
    `  review.previewUrl:          ${review.previewUrl ?? "(empty)"}`,
  );
  console.log(
    `  review.finalSignOff:        ${review.finalSignOff ?? false}`,
  );

  console.log("\nLucas — current copy + business:");
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const business = (content.business ?? {}) as Record<string, unknown>;
  console.log(`  content.tagline:            ${content.tagline ?? "(empty)"}`);
  console.log(
    `  content.business.phoneDisplay:   ${business.phoneDisplay ?? "(empty)"}`,
  );
  console.log(
    `  content.business.publicEmail:    ${business.publicEmail ?? "(empty)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
