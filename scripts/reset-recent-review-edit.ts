// One-off: reset the most-recently-actioned review edit on Lucas's
// onboardingData.review.edits[] back to status="submitted" so the
// user can re-test the admin Approve & deploy flow from a clean
// state. Clears resolvedAt + adminReply but PRESERVES the
// coworkClassification / coworkReasoning / coworkPatch audit fields
// (those came from the cron, not the operator action being reset).
//
// Picks the edit with the most recent resolvedAt — that's the one
// Ben just approved.
//
// Run with: npx tsx --env-file=.dev.vars scripts/reset-recent-review-edit.ts

import { getProspectByToken, patchReviewEdit } from "../src/lib/notion-prospects";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = (lucas.onboardingData ?? {}) as {
    review?: { edits?: Array<Record<string, unknown>> };
  };
  const edits = ob.review?.edits ?? [];
  if (edits.length === 0) {
    console.log("No review edits to reset.");
    return;
  }

  console.log(`Lucas has ${edits.length} review edit(s):`);
  for (const e of edits) {
    console.log(
      `  ${String(e.id).slice(0, 8)} status=${e.status} resolvedAt=${e.resolvedAt ?? "(none)"}`,
    );
  }

  // Prefer the edit with the most recent resolvedAt. If none have
  // one (the merge writer drops `undefined` so reset edits end up
  // with no resolvedAt, which is what we want for the next reset
  // pass too) fall back to the last "applied" entry — chronological
  // order in the array matches creation order in this app's writers.
  const dated = edits
    .filter((e): e is { id: string; resolvedAt: string } & Record<string, unknown> =>
      typeof e.resolvedAt === "string" && e.resolvedAt.length > 0,
    )
    .sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt));
  let target: (Record<string, unknown> & { id: string }) | undefined =
    dated[0];
  if (!target) {
    const applied = edits.filter(
      (e) => e.status === "applied" || e.status === "rejected",
    );
    target = applied[applied.length - 1] as
      | (Record<string, unknown> & { id: string })
      | undefined;
  }
  if (!target) {
    console.log("\nNo actioned edits to reset.");
    return;
  }

  console.log(
    `\nResetting edit ${target.id.slice(0, 8)} (was ${target.status}, resolved ${target.resolvedAt ?? "(none)"})...`,
  );

  // Reset operator-action fields AND Cowork's audit. Setting fields
  // to undefined causes patchReviewEdit's merge → JSON.stringify
  // → Notion write to drop the keys entirely (undefined values
  // serialise to absent), giving step6 a fresh slate to re-classify
  // + auto-apply on the next cron tick. Without clearing the audit
  // fields the cron treats the edit as already-classified and skips
  // it, leaving you with a stale escalation that won't progress.
  await patchReviewEdit(lucas.pageId, target.id, {
    status: "submitted",
    resolvedAt: undefined,
    adminReply: undefined,
    coworkClassification: undefined,
    coworkConfidence: undefined,
    coworkReasoning: undefined,
    coworkPatch: undefined,
    coworkPatches: undefined,
    coworkPatchAppliedAt: undefined,
    coworkEscalatedAt: undefined,
  });

  console.log(`✓ Reset.`);
  console.log(
    `\nGo to /admin/${LUCAS_TOKEN} and the edit should be back in submitted state with the Approve & deploy button available.`,
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
