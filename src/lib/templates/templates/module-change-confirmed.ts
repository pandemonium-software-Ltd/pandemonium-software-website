import type { Template } from "../types";

// Sent to the customer once the operator (or, in Stripe Phase 2, the
// webhook handler) has actioned their pending module change. Stripe
// charge/refund is done; Notion is now in sync. New module cards (if
// any) are visible in the hub; removed module cards are hidden but
// data is preserved.
//
// `paymentLine` is the human-readable headline of what landed on
// their card / bank account ("Your card was charged £39" / "A £20
// refund will land in 5-10 working days" / "No payment moved — just
// the swap"). Keep it concrete so the customer can match it against
// their bank statement.
export const moduleChangeConfirmed: Template = {
  id: "module-change-confirmed",
  riskTier: "low",
  required: [
    "customerName",
    "addedSummary",
    "removedSummary",
    "paymentLine",
    "newSetupTotal",
    "newMonthlyTotal",
    "accountUrl",
  ],
  cta: { urlKey: "accountUrl", label: "Open your hub" },
  subject: "Module change done ✓",
  body: `Hi {{customerName}},

Your module change is sorted.

What changed:
  • Added: {{addedSummary}}
  • Removed: {{removedSummary}}

Payment:
  • {{paymentLine}}

Your new totals:
  • Setup fee: £{{newSetupTotal}}
  • Monthly: £{{newMonthlyTotal}}/month

Any new modules are now showing on your hub — open it from
the button below and finish setting them up. Anything you
removed is hidden but your data is safe in case you change
your mind.

Heads-up: that was your one pre-launch module swap. After
launch you can still change modules — just reply and we'll
quote it.

— ModuForge`,
};
