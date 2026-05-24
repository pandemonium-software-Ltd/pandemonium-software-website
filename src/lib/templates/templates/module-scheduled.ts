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
  required: ["customerName", "moduleName", "effectiveDate", "accountUrl"],
  optional: ["added", "removed", "monthlyDelta", "setupCharge"],
  cta: { urlKey: "accountUrl", label: "View your account" },
  subject:
    "Got it — {{moduleName}} scheduled for {{effectiveDate}}",
  body: `Hi {{customerName}},

Quick confirmation — your module change is queued.

{{#if added}}You are ADDING: {{moduleName}}
{{/if}}{{#if removed}}You are REMOVING: {{moduleName}}
{{/if}}
Effective from: {{effectiveDate}}

What happens between now and then:
{{#if added}}  • Your subscription stays the same until {{effectiveDate}}.
  • On {{effectiveDate}}: your next invoice includes the
    one-off setup of £{{setupCharge}} for {{moduleName}}
    plus the new monthly rate (+£{{monthlyDelta}}/mo).
  • {{moduleName}} activates the same day so you can start
    using it straight away.
{{/if}}{{#if removed}}  • Nothing changes on your bill THIS month — you keep
    full access to {{moduleName}} until {{effectiveDate}}
    since you have already paid.
  • From {{effectiveDate}}: your monthly bill drops by
    £{{monthlyDelta}}/mo and {{moduleName}} is gone.
  • No refund for the rest of this month — that is
    consistent across every billing change.
{{/if}}
Changed your mind? Just open your dashboard and remove the
pending change. Anything done by you before the effective
date is reversible from there.

— ModuForge`,
};
