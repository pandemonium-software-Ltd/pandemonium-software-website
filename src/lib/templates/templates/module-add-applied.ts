import type { Template } from "../types";

// Sent when the operator (or the Stripe webhook) APPLIES a
// `modules-post-launch` add. The Stripe charge + sub update have
// just landed — this email is the customer's receipt + nudge to
// finish setup for any module that needs customer-side input.
//
// Money panel shows three lines so the customer can match it
// against their Stripe receipt:
//   1. One-off setup just charged for THIS module
//   2. Old monthly → new monthly with the signed delta
//   3. Implicit setup history left out (already paid historically)
//
// `setupUrl` always points at the focused Hub Step 3 page — even
// for no-setup-required modules (Enquiry Form, Offers), so the
// customer has a single canonical place to land. The body
// branches on `setupRequired` / `noSetupRequired` to vary the
// wording.
export const moduleAddApplied: Template = {
  id: "module-add-applied",
  riskTier: "low",
  required: [
    "customerName",
    "moduleName",
    "moduleSetupFee",
    "moduleMonthlyFee",
    "previousMonthly",
    "newMonthly",
    "accountUrl",
    "setupUrl",
  ],
  optional: ["setupRequired", "noSetupRequired", "setupInstructions"],
  cta: { urlKey: "setupUrl", label: "Set up {{moduleName}} →" },
  secondaryCta: { urlKey: "accountUrl", label: "Back to dashboard" },
  subject: "{{moduleName}} is live on your account",
  body: `Hi {{customerName}},

Good news — {{moduleName}} is now active on your account.

What just landed on your bill:
  • One-off setup for {{moduleName}}: £{{moduleSetupFee}}
    (already added to the invoice you just paid)
  • Module subscription: +£{{moduleMonthlyFee}}/month

Your subscription:
  • Before: £{{previousMonthly}}/month
  • Now:    £{{newMonthly}}/month (+£{{moduleMonthlyFee}})

{{#if setupRequired}}One small thing — {{moduleName}} needs a quick set-up step
from you before it lights up on the live site. Click the
button below and you'll land straight on the set-up page for
this module (it's the same page you used during onboarding,
focused on just {{moduleName}}).

{{setupInstructions}}

You can come back to it any time from your dashboard — there
will be a "Set up →" button next to {{moduleName}} until the
set-up is complete.
{{/if}}{{#if noSetupRequired}}No set-up needed on your side — {{moduleName}} just appears
on your site / in your dashboard from today.
{{/if}}
Any questions, hit reply.

— ModuForge`,
};
