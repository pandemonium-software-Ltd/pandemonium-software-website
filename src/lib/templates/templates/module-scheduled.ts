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
// Money panel has THREE sections so the customer can audit the
// arithmetic at a glance:
//   1. THIS MODULE LINE — what this specific module costs in
//      isolation (one-off setup + monthly contribution).
//   2. SUBSCRIPTION DIFF — old monthly → new monthly with the
//      signed delta, so the customer sees the actual figure
//      that will land on their card from the effective date.
//   3. HISTORICAL SETUP — what was paid to build the site,
//      flagged as non-refundable so there's no confusion about
//      whether the £299 comes back when modules are removed.
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
    "moduleSetupFee",
    "moduleMonthlyFee",
    "monthlyDeltaSigned",
  ],
  optional: ["added", "removed"],
  cta: { urlKey: "accountUrl", label: "View your account" },
  subject:
    "Got it — {{moduleName}} scheduled for {{effectiveDate}}",
  body: `Hi {{customerName}},

Quick confirmation — your module change is queued.

{{#if added}}You are ADDING: {{moduleName}}
  • One-off setup for this module: +£{{moduleSetupFee}}
    (lands on your {{effectiveDate}} invoice)
  • Module subscription: +£{{moduleMonthlyFee}}/month
    (starts {{effectiveDate}})
{{/if}}{{#if removed}}You are REMOVING: {{moduleName}}
  • Module subscription: −£{{moduleMonthlyFee}}/month
    (from {{effectiveDate}})
  • No setup refund — setup was paid historically to build
    your site, which is already delivered.
{{/if}}
Your subscription:
  • Today:                  £{{currentMonthly}}/month
  • From {{effectiveDate}}: £{{newMonthly}}/month ({{monthlyDeltaSigned}})

Setup paid historically: £{{paidSetupSoFar}} (non-refundable
under any module change or cancellation — covers the site
build, already delivered).

What happens between now and then:
{{#if added}}  • Your subscription stays the same until {{effectiveDate}}.
  • On {{effectiveDate}}: your invoice picks up the one-off
    setup above PLUS the new monthly rate.
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
Changed your mind? Just open your dashboard and remove the
pending change. Anything done by you before the effective
date is reversible from there.

— ModuForge`,
};
