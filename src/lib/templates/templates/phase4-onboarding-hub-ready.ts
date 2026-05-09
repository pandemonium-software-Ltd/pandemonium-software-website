import type { Template } from "../types";

// Sent right after phase3-thanks-fees-and-payment-coming.
// Together they're a one-two: receipt (phase3) → call to action
// (phase4 with the prominent button).
//
// Currently triggered by /api/intake AUTO-FLIPPING the prospect
// to "Paid" status — a temporary shortcut while Stripe Checkout
// (Stage 2A Part 2) isn't built. When Stripe lands, /api/intake
// stops auto-flipping; the redirect goes to /payment/[token];
// Stripe Checkout completes; webhook flips to Paid and sends THIS
// email. The template content stays the same — just the trigger
// moves from /api/intake to the Stripe webhook handler.
//
// Low risk tier (§11.2) — pure status update + CTA.
export const phase4OnboardingHubReady: Template = {
  id: "phase4-onboarding-hub-ready",
  riskTier: "low",
  required: ["customerName", "onboardingUrl"],
  cta: { urlKey: "onboardingUrl", label: "Open your onboarding hub" },
  subject: "You're all set — open your onboarding hub",
  body: `Hi {{customerName}},

Your account is ready and your onboarding hub is set up.

In the hub, you'll work through 4-5 short steps (~30 minutes
total). You can save your progress in any step and come back
later — nothing's lost.

  1. Cloudflare — sign up (free) and invite me as a member
  2. Domain — tell me your domain and where it's registered
  3. Modules — connect Cal.com / claim your Google listing
     (only shown for the modules you bought)
  4. Brand assets — upload your logo and any photos
  5. Review & launch — pick a go-live date and sign off

Each time you mark a step done, I get an email and pick up the
technical work — DNS records, TLS certificates, sender domain
setup, your site build. You'll get an update from me at every
milestone.

— Ben`,
};
