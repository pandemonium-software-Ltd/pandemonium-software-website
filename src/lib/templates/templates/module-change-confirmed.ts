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
  subject: "Module change confirmed ✓",
  body: `Hi {{customerName}},

Your module change is live.

What changed:
  • Added: {{addedSummary}}
  • Removed: {{removedSummary}}

Payment:
  • {{paymentLine}}

Your new totals:
  • Setup fee: £{{newSetupTotal}}
  • Monthly: £{{newMonthlyTotal}}/month

Any new module cards are now visible on your hub — head over and
finish their setup. Any modules you removed are hidden, but your
data is preserved if you ever re-add them.

Note: this was your one allowed pre-launch module change. Anything
else needs to wait until after launch (post-launch monthly
allowance) or be quoted separately.

Thanks,
Ben (and the ModuForge ops assistant)`,
};
