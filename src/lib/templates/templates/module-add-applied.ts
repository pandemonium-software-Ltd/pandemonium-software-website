import type { Template } from "../types";

// Sent when the operator applies a `modules-post-launch` add
// (i.e. the customer added a module from their dashboard and the
// operator has now actioned the Stripe op). Confirms activation
// AND points the customer at the focused Hub Step 3 setup page
// for any module that needs customer-side setup (Cal.com URL
// paste, Newsletter sender invite, GBP Manager invite).
//
// `setupUrl` always points at the focused Hub page — even for
// no-setup-required modules (Enquiry Form, Offers), so the
// customer has a single canonical place to land. The body
// branches on `setupRequired` to vary the wording.
export const moduleAddApplied: Template = {
  id: "module-add-applied",
  riskTier: "low",
  required: [
    "customerName",
    "moduleName",
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

  • New monthly: £{{newMonthly}}/mo (from today)
  • One-off setup for {{moduleName}}: already added to the
    invoice you just paid

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
