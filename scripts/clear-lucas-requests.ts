// One-off cleanup: clears ALL change requests + Hub Step 5 review
// edits + the Cowork preview-build latches for Lucas, so we can
// re-test the change-request automation flow from scratch.
//
// Clears:
//   1. Change Requests Inbox (post-commit /account requests)
//   2. onboardingData.review.edits[] (pre-commit Hub Step 5 edits)
//   3. previewBuildTriggeredAt + previewBuildFailedAt latches
//      so step5/step6 can dispatch fresh builds
//
// Does NOT touch onboarding step state (Cloudflare account id,
// Worker name, etc.) — only the change-request and review-edit
// queues.
//
// Run with: npx tsx --env-file=.dev.vars scripts/clear-lucas-requests.ts

import { getProspectByToken } from "../src/lib/notion-prospects";
import { notionFetch } from "../src/lib/notion";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  console.log(`Fetching Lucas (${LUCAS_TOKEN.slice(0, 8)})...`);
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found by token");
    process.exit(1);
  }

  console.log(`Found Lucas: pageId=${lucas.pageId}`);
  console.log(`Current state:`);
  console.log(
    `  changeRequests (inbox): ${lucas.changeRequests.length} entries`,
  );
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const review = (ob.review ?? {}) as Record<string, unknown>;
  const edits = Array.isArray(review.edits) ? review.edits : [];
  console.log(`  review.edits (Hub Step 5): ${edits.length} entries`);
  console.log(
    `  previewBuildTriggeredAt: ${lucas.previewBuildTriggeredAt ?? "(none)"}`,
  );
  console.log(
    `  previewBuildFailedAt: ${lucas.previewBuildFailedAt ?? "(none)"}`,
  );

  // Build the clean onboardingData blob (review.edits[] = [] but
  // keep the rest of review intact, so previewSubmittedAt /
  // goLiveDate / etc. survive).
  const cleanReview = { ...review, edits: [] };
  const cleanOnboarding = { ...ob, review: cleanReview };

  console.log("\nClearing all change-request state...");
  await notionFetch(`/pages/${lucas.pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        // Inbox: empty array → empty rich_text
        "Change Requests Inbox": { rich_text: [] },
        // Hub Step 5 edits: rewrite the onboarding-data blob with
        // edits cleared. Notion enforces 2000-char chunks; relying
        // on the rt() chunker would mean importing from
        // notion-prospects, but it's simpler to manually chunk
        // here.
        "Onboarding Data": chunkRichText(JSON.stringify(cleanOnboarding)),
        // Latches — clear so the next preview request can fire fresh.
        "Preview Build Triggered At": { date: null },
        "Preview Build Failed At": { date: null },
      },
    },
  });
  console.log("✓ Done.");

  // Verify
  const after = await getProspectByToken(LUCAS_TOKEN);
  if (!after) {
    console.error("Lucas not found post-clear (??)");
    process.exit(1);
  }
  console.log(`\nVerified state:`);
  console.log(
    `  changeRequests (inbox): ${after.changeRequests.length} entries`,
  );
  const ob2 = (after.onboardingData ?? {}) as Record<string, unknown>;
  const review2 = (ob2.review ?? {}) as Record<string, unknown>;
  const edits2 = Array.isArray(review2.edits) ? review2.edits : [];
  console.log(`  review.edits (Hub Step 5): ${edits2.length} entries`);
  console.log(
    `  previewBuildTriggeredAt: ${after.previewBuildTriggeredAt ?? "(none)"}`,
  );
  console.log(
    `  previewBuildFailedAt: ${after.previewBuildFailedAt ?? "(none)"}`,
  );
}

/** Slice a long string into Notion's 2000-char rich_text blocks. */
function chunkRichText(text: string): {
  rich_text: { type: "text"; text: { content: string } }[];
} {
  const max = 2000;
  if (text.length === 0) return { rich_text: [] };
  const chunks: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < text.length; i += max) {
    chunks.push({
      type: "text",
      text: { content: text.slice(i, i + max) },
    });
  }
  return { rich_text: chunks };
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
