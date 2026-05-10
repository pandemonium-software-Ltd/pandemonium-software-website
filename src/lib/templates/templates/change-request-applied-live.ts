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
  cta: { urlKey: "siteUrl", label: "View your site" },
  subject: "Your change is live ✓",
  body: `Hi {{customerName}},

Approved + live. Your site now reflects:

  {{originalMessage}}

Take a look: {{siteUrl}}

If anything's not quite right, hit reply on this email or open
your dashboard and submit a follow-up. Same change-request
allowance applies.

— Ben (via Cowork)

P.S. — If you spot any issue in the next hour or so, your
previous version is still in Cloudflare's history; let me know
and I can roll back instantly.`,
};
