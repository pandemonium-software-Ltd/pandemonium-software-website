// One-off: apply the tagline patch from Lucas's edit 9e2c0a87 that
// got DROPPED by the pre-fix step6 (rebuildOnly + patches were
// treated as exclusive instead of additive, so the tagline patch
// got thrown away while only the asset rebuild proceeded).
//
// Customer requested: tagline → "New tagline test 11/05/2026"
// Run with: npx tsx --env-file=.dev.vars scripts/apply-lucas-tagline.ts

import {
  getProspectByToken,
  updateProspectOnboarding,
  patchReviewEdit,
} from "../src/lib/notion-prospects";
import { applyChangeRequestPatches } from "../src/lib/change-requests/apply-patch";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  console.log("Current tagline:", content.tagline);

  const res = await applyChangeRequestPatches({
    prospect: lucas,
    patches: [
      { target: "copy.tagline", newValue: "New tagline test 11/05/2026" },
    ],
  });
  if (!res.ok) {
    console.error("Apply failed:", res.reason);
    process.exit(1);
  }
  console.log("✓ Applied:", res.applied);

  // Backfill the audit on edit 9e2c0a87 so /admin shows the patch.
  await patchReviewEdit(
    lucas.pageId,
    "9e2c0a87-3987-49df-b828-4b99189bf4a5",
    {
      coworkPatches: res.applied.map((p) => ({
        target: p.target,
        newValue: p.newValue as unknown,
        previousValue: p.previousValue,
      })),
    },
  );

  console.log(
    "\nTagline is now patched in Notion. The next build (manual or via re-approve from /admin) will ship it.",
  );
  console.log(
    "Suppress unused import warning:",
    typeof updateProspectOnboarding === "function" ? "ok" : "wat",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
