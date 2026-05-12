// Reset a SPECIFIC review-edit on Lucas by id-prefix. Same nuke
// of cowork audit fields as reset-recent-review-edit but you pick
// which one (useful when there are several recent edits and you
// only want to re-classify one).
//
// Usage:
//   npx tsx --env-file=.dev.vars scripts/reset-edit-by-prefix.ts <id-prefix>

import {
  getProspectByToken,
  patchReviewEdit,
} from "../src/lib/notion-prospects";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  const prefix = process.argv[2];
  if (!prefix) {
    console.error("Usage: ... reset-edit-by-prefix.ts <id-prefix>");
    process.exit(1);
  }
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = (lucas.onboardingData ?? {}) as {
    review?: { edits?: Array<Record<string, unknown>> };
  };
  const edits = ob.review?.edits ?? [];
  const target = edits.find((e) =>
    String(e.id).startsWith(prefix),
  ) as (Record<string, unknown> & { id: string }) | undefined;
  if (!target) {
    console.error(`No edit found with id prefix ${prefix}`);
    process.exit(1);
  }

  console.log(
    `Resetting edit ${target.id.slice(0, 8)} (was status=${target.status}, classification=${target.coworkClassification ?? "(none)"})…`,
  );

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

  console.log("✓ Reset. Next cron tick (within ~5 min) will re-classify.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
