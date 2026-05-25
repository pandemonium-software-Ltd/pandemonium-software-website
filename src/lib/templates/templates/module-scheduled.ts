import type { Template } from "../types";

// Sent when a customer adds OR removes a module from the
// post-launch dashboard (NOT the pre-launch Hub re-selector —
// that uses module-change-pending instead). Acknowledges the
// pending change, quotes the effective date, sets expectations
// about billing.
//
// One template covers both add and remove via `{{#if added}}` /
// `{{#if removed}}` blocks — the structural difference is small
// and a shared template keeps copy maintenance lower.
//
// Low risk tier. No latch — the customer can submit multiple
// changes and each fires its own confirmation. They cannot
// duplicate the SAME pending change (the endpoint 409s on dupes),
// so duplicate emails are not a concern.
export const moduleScheduled: Template = {
  id: "module-scheduled",
  riskTier: "low",
  required: [
    "customerName",
    "moduleName",
    "effectiveDate",
    "accountUrl",
    "paidSetupSoFar",
    "currentMonthly",
    "newMonthly",
  ],
  optional: ["added", "removed", "extraSetupCharge"],
  cta: { urlKey: "accountUrl", label: "View your account" },
  subject:
    "Got it — {{moduleName}} scheduled for {{effectiveDate}}",
  body: `Hi {{customerName}},

Quick confirmation — your module change is queued.

{{#if added}}You are ADDING: {{moduleName}}
{{/if}}{{#if removed}}You are REMOVING: {{moduleName}}
{{/if}}
Effective from: {{effectiveDate}}

Where you stand on money:

  • Setup paid to date:      £{{paidSetupSoFar}} (non-refundable)
  • Current monthly:         £{{currentMonthly}}/mo
  • New monthly from {{effectiveDate}}: £{{newMonthly}}/mo
{{#if added}}  • Extra one-off setup on
    {{effectiveDate}} invoice:  +£{{extraSetupCharge}}
{{/if}}
What happens between now and then:
{{#if added}}  • Your subscription stays the same until {{effectiveDate}}.
  • On {{effectiveDate}}: your next invoice picks up the
    extra one-off setup (above) PLUS the new monthly rate.
  • {{moduleName}} activates the same day so you can start
    using it straight away.
{{/if}}{{#if removed}}  • Nothing changes on your bill THIS month — you keep
    full access to {{moduleName}} until {{effectiveDate}}
    since you have already paid.
  • From {{effectiveDate}}: your monthly drops to the new
    figure above and {{moduleName}} is gone.
  • No refund for the rest of this month — you are using
    the service through to the end of it.
{{/if}}
The setup figure above is what you have already paid to
build the site. It is not refunded under any module change
or cancellation — that work has been delivered.

Changed your mind? Just open your dashboard and remove the
pending change. Anything done by you before the effective
date is reversible from there.

— ModuForge`,
};
