import type { Template } from "../types";

// Sent to the customer the moment they hit Confirm on the module
// re-selector. They've consumed their one allowed change-round; this
// email confirms the request is in the queue and tells them what
// happens next (manual operator step today; auto-Stripe later — see
// docs/STRIPE-PHASE-2.md).
//
// Required values are big (delta breakdown + new totals) so the
// customer can audit our maths. `chargeOrRefundLine` is the
// human-readable headline ("we'll charge you £39" / "you'll get a
// £20 refund / "no money moves"). `monthlyDeltaLine` similar for
// subscription change.
export const moduleChangePending: Template = {
  id: "module-change-pending",
  riskTier: "low",
  required: [
    "customerName",
    "addedSummary",
    "removedSummary",
    "chargeOrRefundLine",
    "monthlyDeltaLine",
    "newSetupTotal",
    "newMonthlyTotal",
    "accountUrl",
  ],
  cta: { urlKey: "accountUrl", label: "View your account" },
  subject: "Module change request received",
  body: `Hi {{customerName}},

Got it — your module change is in the queue.

What's changing:
  • Adding: {{addedSummary}}
  • Removing: {{removedSummary}}

Money side:
  • Setup: {{chargeOrRefundLine}}
  • Subscription: {{monthlyDeltaLine}}

Your new totals:
  • Setup fee: £{{newSetupTotal}}
  • Monthly: £{{newMonthlyTotal}}/month

I'll process the payment side and confirm by email — usually within
one working day. Once confirmed, your modules update on your hub
and any new module cards appear ready to set up.

A reminder of the policy:
  • This is your one allowed module change before launch — no
    further switches once it's done.
  • If you remove a module you've already set up, we keep your data
    safely in case you re-add later. The module just disappears
    from your hub.

Reply to this email if any of the above doesn't look right and
I'll fix it before processing.

Thanks,
Ben (and the ModuForge ops assistant)`,
};
