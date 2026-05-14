import type { Template } from "../types";

// Sent to the customer the moment they hit Confirm on the module
// re-selector. With the Stripe-placeholder shortcut (2026-05-14),
// the change applies IMMEDIATELY — no operator step, no payment
// processing wait. New modules show up on their hub right away;
// removed modules disappear right away.
//
// Future: when Stripe Phase 2 lands, swap back to the
// `module-change-pending` template and reinstate the
// pending-stripe → operator-confirm flow. See docs/STRIPE-PHASE-2.md.
//
// Required values mirror the pending template (delta + new totals)
// so the customer can audit our maths. `chargeOrRefundLine` is the
// human-readable headline ("we'll send your card a £39 charge" /
// "you'll see a £20 refund land in 3-5 days" / "no money moves").
export const moduleChangeApplied: Template = {
  id: "module-change-applied",
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
  subject: "Your module change is live",
  body: `Hi {{customerName}},

Your module change is applied — the new selection is live on your
account already.

What changed:
  • Added: {{addedSummary}}
  • Removed: {{removedSummary}}

Money side:
  • Setup: {{chargeOrRefundLine}}
  • Monthly subscription: {{monthlyDeltaLine}}

Your new totals:
  • Setup fee: £{{newSetupTotal}}
  • Monthly: £{{newMonthlyTotal}}/month

What's next:
  • Any new modules are now visible on your Hub — head over to
    set them up. Removed modules are gone immediately; we keep
    your data safe in case you change your mind later.
  • Heads-up: you only get one module change before launch, so
    this is it. Anything else needs to wait until after you go
    live.

If anything looks wrong above, hit reply and we'll sort it out.

— ModuForge`,
};
