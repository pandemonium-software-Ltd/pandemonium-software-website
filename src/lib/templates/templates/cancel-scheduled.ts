import type { Template } from "../types";

// Sent when a customer triggers a cancellation from their
// dashboard. One template covers both cancellation modes:
//   - end-of-period       → "You keep full access until X"
//   - immediate-prorated  → "Site goes offline today, refund of £Y"
//
// `kind` is the human-readable mode label rendered in the
// subject line + opening paragraph. `refundLine` is the single
// authoritative money sentence so the customer reads exactly one
// number for the refund (the dashboard + this email + the
// operator action MUST match).
//
// Refund policy alignment: the language here matches the terms
// page wording — setup fee is non-refundable (it covered the site
// build, already delivered) and only the monthly subscription is
// prorated.
export const cancelScheduled: Template = {
  id: "cancel-scheduled",
  riskTier: "low",
  required: [
    "customerName",
    "effectiveDate",
    "modeLabel",
    "modeBody",
    "refundLine",
    "accountUrl",
  ],
  cta: { urlKey: "accountUrl", label: "View your account" },
  subject: "Cancellation received — {{modeLabel}}",
  body: `Hi {{customerName}},

Confirming your cancellation request.

When it takes effect: {{effectiveDate}}

{{modeBody}}

Money side:
{{refundLine}}
  • The one-off setup fee is NOT refunded — that paid for
    building your site, which has already been delivered.
    Only the monthly subscription is prorated.

Changed your mind? Reply to this email any time before
{{effectiveDate}} and I can undo it on the spot. After that
the site is offline and the account is closed.

Thank you for the run — happy to chat any time if there is
anything I can do to help.

— ModuForge`,
};
