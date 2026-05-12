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
  subject: "You're all set — let's build your site",
  body: `Hi {{customerName}},

You're all set. Your onboarding hub is ready and waiting for
you.

The hub walks you through a short checklist — about 30 minutes
in total. You can stop at any point and come back; nothing
gets lost.

What you'll do:
  1. Set up a free hosting account (Cloudflare — I'll send
     instructions in the hub).
  2. Tell me your web address.
  3. Connect a couple of tools (booking calendar, Google
     listing, etc. — only if you bought those bits).
  4. Upload your logo and any photos you want on the site.
  5. Pick a launch date and sign off.

Each time you finish a step, I get a ping and pick up the
behind-the-scenes work — connecting your web address, setting
up secure hosting, building your site. You'll get an email
each time something happens.

— Ben`,
};
