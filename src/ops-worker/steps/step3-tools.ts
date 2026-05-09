// Step 3 — Modules (Cal.com booking URL + GBP URL capture).
//
// Stage 2C C1: STUB. Real implementation lands in Stage 2C C4:
// validate Cal.com URL points at a real Cal.com booking page;
// validate GBP URL is a Google Maps profile (heuristic + browser
// fallback via claude-in-chrome MCP if needed) per §4.3 Step 3.

import type { Step } from "../types";

export const step3Tools: Step = {
  id: "step3",
  shouldRun: (p) => p.onboardingStep3Done === true,
  run: async () => ({
    status: "skip",
    reason: "stub: Step 3 (Tools — Cal.com / GBP) lands in Stage 2C C4",
  }),
};
