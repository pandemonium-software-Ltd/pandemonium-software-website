import type { Template } from "../types";

// Sent when the operator marks a customer's change request "resolved"
// in /admin/[token]. Includes the operator's reply verbatim — that's
// the substance of the email; the template is just the wrapping.
//
// CTA: account dashboard (where the customer can submit further
// change requests if needed).
//
// Low risk tier (§11.2) for the wrapping. The reply text itself
// has been written by Ben (or by Cowork via the Drafts inbox flow
// in §11) — by the time it's interpolated here, it's already been
// reviewed.
export const changeRequestResolved: Template = {
  id: "change-request-resolved",
  riskTier: "low",
  required: [
    "customerName",
    "originalMessage",
    "reply",
    "accountUrl",
  ],
  cta: { urlKey: "accountUrl", label: "Open your account dashboard" },
  subject: "Your change request is done ✓",
  body: `Hi {{customerName}},

Your change request:

  {{originalMessage}}

My reply:

{{reply}}

You can see the full history (and submit anything else) on your
account dashboard.

— Ben`,
};
