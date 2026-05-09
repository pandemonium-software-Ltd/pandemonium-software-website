// Step 2 — Domain (DNS-ready + zone activation) + optional Resend.
//
// Stage 2C C1: STUB. Real implementations land in:
//   - C2 (Cloudflare): zone create, nameserver email, status poll,
//                      Worker Custom Domain binding per §4.3 Step 2.A
//   - C3 (Resend):     team accept, domain add, DNS apply via
//                      Cloudflare, sending-key gen + AES-GCM encrypt
//                      per §4.3 Step 2.B

import type { Step } from "../types";

export const step2Domain: Step = {
  id: "step2",
  shouldRun: (p) => p.onboardingStep2Done === true,
  run: async () => ({
    status: "skip",
    reason:
      "stub: Step 2 (Domain DNS + Resend) lands in Stage 2C C2 (Cloudflare) + C3 (Resend)",
  }),
};
