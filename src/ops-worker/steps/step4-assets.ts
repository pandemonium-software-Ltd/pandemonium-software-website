// Step 4 — Brand assets (R2 normalisation + WebP derivatives).
//
// Stage 2C C1: STUB. Real implementation:
//   - Read uploaded R2 keys from prospect.onboardingData.assets
//   - For each: resize, optimise, convert to WebP, store derivatives
//     back to R2
//   - Update Notion with derivative R2 keys for the build step
// Per §4.3 Step 4 + §6.9. Likely lands in Stage 2C C5 alongside the
// notification pipeline since it touches similar primitives (image
// transform on Cloudflare).

import type { Step } from "../types";

export const step4Assets: Step = {
  id: "step4",
  shouldRun: (p) => p.onboardingStep4Done === true,
  run: async () => ({
    status: "skip",
    reason:
      "stub: Step 4 (Asset normalisation) lands in Stage 2C C5 alongside notifications",
  }),
};
