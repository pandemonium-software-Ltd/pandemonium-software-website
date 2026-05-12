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
  subject: "Got your module change — confirming shortly",
  body: `Hi {{customerName}},

Got your update — here's what's about to change.

What's different:
  • Adding: {{addedSummary}}
  • Removing: {{removedSummary}}

Money side:
  • Setup: {{chargeOrRefundLine}}
  • Monthly subscription: {{monthlyDeltaLine}}

Your new totals:
  • Setup fee: £{{newSetupTotal}}
  • Monthly: £{{newMonthlyTotal}}/month

We'll process the payment and email you to confirm — usually
within one working day. After that, any new modules show up
on your hub ready to set up.

Heads-up:
  • You only get one module change before launch, so this is
    it. Anything else needs to wait until after you go live.
  • If you're removing a module you'd already set up, we keep
    your data safe in case you change your mind later.

If anything looks wrong above, hit reply and we'll fix it
before processing the payment.

— ModuForge`,
};
