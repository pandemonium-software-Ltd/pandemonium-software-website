import type { Template } from "../types";

// Sent when the customer clicks Approve on a preview-ready email
// and the customer-site-promote workflow successfully promotes
// the version to live. Confirms the change is now visible on
// their actual site + invites them to flag anything that looks off.
//
// Distinct from `change-request-resolved` (operator-resolved by
// Ben) so the customer sees a clear "you approved this; here's
// the result" framing rather than a "Ben did this for you" framing.
//
// Low risk tier (§11.2) — pure confirmation of a state the customer
// just triggered.
export const changeRequestAppliedLive: Template = {
  id: "change-request-applied-live",
  riskTier: "low",
  required: [
    "customerName",
    "originalMessage",
    "siteUrl",
    "accountUrl",
  ],
  // Two CTAs: primary "View your site" so the customer can verify
  // the change landed where it should; secondary "Open dashboard"
  // for managing requests + subscription state. Live URLs in the
  // body itself are dropped — the buttons are the canonical action
  // affordance.
  cta: { urlKey: "siteUrl", label: "View your site" },
  secondaryCta: { urlKey: "accountUrl", label: "Open dashboard" },
  subject: "Your change is live ✓",
  body: `Hi {{customerName}},

That's done. Your site now shows:

  {{originalMessage}}

Tap the button below to take a look — refresh once if you've
got it open already.

If something looks off, just reply to this email — we can put
the old version back in seconds if needed.

For anything else, head to your dashboard. You get 2 changes
a month included with your subscription.

— ModuForge`,
};
