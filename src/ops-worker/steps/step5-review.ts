// Step 5 — Review & launch (preview build + apply revisions + go-live).
//
// Stage 2C C1: STUB. Real implementation in Stage 2C C5:
//   - Build customer's site Worker with their data → preview URL
//   - Email customer the preview URL (templated per §11)
//   - Apply each `submitted` revision per the §11.2 risk-tier gate
//     (Low/Medium auto-apply; High routes via Cowork Drafts)
//   - On go-live date: production deploy + Custom Domain bind →
//     status flips to Live
// Per §4.3 Step 5.

import type { Step } from "../types";

export const step5Review: Step = {
  id: "step5",
  shouldRun: (p) => p.onboardingStep5Done === true,
  run: async () => ({
    status: "skip",
    reason:
      "stub: Step 5 (Review build + go-live) lands in Stage 2C C5",
  }),
};
