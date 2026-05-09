// Step 1 — Cloudflare membership accept + verify.
//
// Stage 2C C1: STUB. Returns { status: "skip" } so the dispatch
// loop's wiring is exercised end-to-end without doing any real
// Cloudflare work. Real implementation lands in Stage 2C C2 per
// §4.3 Step 1 + §5 C2.
//
// Real-shape (C2 will replace `run`):
//   1. Poll https://api.cloudflare.com/client/v4/memberships for
//      pending invitations addressed to BEN_OPS_EMAIL whose owner
//      email matches prospect.onboardingData.cloudflare.cloudflareEmail
//   2. Accept the invitation
//   3. Verify access by listing accounts; capture the account id
//   4. Stamp `Cloudflare Membership Verified At` in Notion
//   5. Return { status: "ok", notes: "Cloudflare membership accepted" }

import type { Step } from "../types";

export const step1Cloudflare: Step = {
  id: "step1",
  shouldRun: (p) =>
    p.onboardingStep1Done === true &&
    !hasCloudflareVerifiedAt(p),
  run: async () => ({
    status: "skip",
    reason:
      "stub: Step 1 (Cloudflare membership accept) lands in Stage 2C C2",
  }),
};

// We don't have `cloudflareMembershipVerifiedAt` on ProspectRecord
// yet — it lands when the C2 schema migration adds it. For C1, the
// shouldRun predicate is overly eager (it always runs once Step 1
// is marked done), but the stub returns "skip" so it's harmless.
function hasCloudflareVerifiedAt(_p: unknown): boolean {
  return false;
}
