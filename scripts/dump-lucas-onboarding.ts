// Dump Lucas's full onboardingData blob so we can find where
// phone + email actually live in the schema before applying the
// edit 96b4d5b3 patch by hand.
//
// Run with: npx tsx --env-file=.dev.vars scripts/dump-lucas-onboarding.ts

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  // Strip the review.edits noise and dump the rest.
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ob)) {
    if (k === "review") {
      // Just keep edit count + statuses, omit message bodies.
      const r = v as { edits?: Array<Record<string, unknown>> };
      summary.review = {
        editCount: r.edits?.length ?? 0,
        editStatuses: (r.edits ?? []).map((e) => `${String(e.id).slice(0, 8)}/${e.status}`),
      };
    } else {
      summary[k] = v;
    }
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
