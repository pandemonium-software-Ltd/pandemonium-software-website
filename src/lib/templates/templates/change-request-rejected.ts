import type { Template } from "../types";

// Sent when the operator marks a customer's change request "rejected"
// in /admin/[token] — typically because it's out of scope for the
// monthly allowance and would need a separate quote. Includes the
// operator's reply verbatim explaining why.
//
// CTA: account dashboard (so the customer can review or submit a
// different request).
//
// Low risk tier (§11.2) for the wrapping. The reply text has been
// reviewed by Ben (directly or via §11 Drafts inbox).
export const changeRequestRejected: Template = {
  id: "change-request-rejected",
  riskTier: "low",
  required: [
    "customerName",
    "originalMessage",
    "reply",
    "accountUrl",
  ],
  cta: { urlKey: "accountUrl", label: "Open your account dashboard" },
  subject: "About your change request",
  body: `Hi {{customerName}},

Your change request:

  {{originalMessage}}

My reply:

{{reply}}

This one's outside what's covered by your monthly allowance, so
it doesn't count against your 3 requests this month. If you'd
like to discuss the bigger piece, just hit reply — happy to
quote separately.

You can see the full history (and submit other requests) on your
account dashboard.

— Ben`,
};
