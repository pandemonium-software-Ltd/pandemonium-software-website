import type { Template } from "../types";

// Sent when the customer signs off Step 5 and the prospect's status
// flips to "Onboarding Complete" — the moment the build pipeline
// kicks in. Same trigger as the existing buildOnboardingCompleteEmail
// but routed through the branded HTML wrapper for visual consistency
// with all other customer-facing emails.
//
// CTA: account dashboard (their post-launch home for site status,
// subscription details, change requests).
//
// Low risk tier (§11.2) — pure status update + factual confirmation
// of the customer's own action. Auto-sends.
export const signoffConfirmation: Template = {
  id: "signoff-confirmation",
  riskTier: "low",
  required: ["customerName", "goLiveDate", "accountUrl"],
  cta: { urlKey: "accountUrl", label: "Open your account dashboard" },
  subject: "Signed off — your site goes live on {{goLiveDate}}",
  body: `Hi {{customerName}},

Thanks for the careful review. You're signed off and your site
is going live on {{goLiveDate}}.

What happens between now and launch:

  1. I'm building your site now. You'll get another email when
     your preview is ready (typically 3-5 working days).
  2. On launch day I switch the DNS over before 11am UK time and
     your site is live.
  3. Your subscription includes 3 change requests per month from
     launch — one item per request. Use the "Need a change?"
     form on your account dashboard for any updates after launch.

The button below opens your account dashboard. From now on,
that's your home for site status, subscription details, and
content changes.

If anything's not right between now and launch, just hit reply.

— Ben`,
};
