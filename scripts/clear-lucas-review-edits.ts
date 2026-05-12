import { getProspectByToken, updateProspectOnboarding } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const obBefore = (lucas.onboardingData ?? {}) as { review?: { edits?: unknown[] } };
  console.log(`Before: review.edits count = ${obBefore.review?.edits?.length ?? 0}`);

  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const review = (ob.review ?? {}) as Record<string, unknown>;
  const newReview = { ...review, edits: [] };
  const newOnboarding = { ...ob, review: newReview };

  await updateProspectOnboarding(lucas.pageId, {
    data: newOnboarding as Parameters<typeof updateProspectOnboarding>[1]["data"],
  });

  const after = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  const obAfter = (after?.onboardingData ?? {}) as { review?: { edits?: unknown[] } };
  console.log(`After:  review.edits count = ${obAfter.review?.edits?.length ?? 0}`);
  console.log("\n✓ Pre-commit edits cleared. Lucas can submit fresh Step 5 review edits.");
}
main().catch((e) => { console.error(e); process.exit(1); });
