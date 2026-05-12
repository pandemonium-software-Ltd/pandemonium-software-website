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
  subject: "All signed off — your site goes live on {{goLiveDate}}",
  body: `Hi {{customerName}},

Thanks for reviewing everything. You're all signed off and
your site will be live on {{goLiveDate}}.

Here's what happens next — you don't need to do anything:

  1. I'll do the final tidy-up on your site over the next few
     days.
  2. On launch morning (before 11am), I'll switch your web
     address over so visitors land on your new site.
  3. Once your site is live, you can ask for up to 2 changes
     a month from your dashboard — things like swapping a
     photo, tweaking text, updating opening hours. I'll get
     them done within 48 working hours.

The button below opens your dashboard — that's where you'll
manage everything from here.

If you spot anything you want changed before launch, just
reply to this email and I'll sort it.

— Ben`,
};
