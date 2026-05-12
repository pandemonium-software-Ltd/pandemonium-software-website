import type { Template } from "../types";

// Sent when a prospect completes the full Phase 3 intake form.
// Confirms receipt + lays out what they're paying for + what each
// selected module gives them concretely.
//
// `moduleList` is built by the caller (api/intake/route.ts) as a
// pre-formatted multi-line string. Each line names the module and
// describes what the customer actually gets (not just "newsletter
// module" but "send up to N emails/month from name@yourdomain").
//
// Doesn't include the onboarding hub link — that follows in a
// SEPARATE phase4 email (same /api/intake call sends both,
// because we auto-flip to Paid for now while Stripe is being set
// up). Splitting the emails keeps each one focused: this one is
// the receipt, the next one is the call-to-action.
//
// `foundingMember` is a boolean shown only when the prospect
// qualifies for the flat Founding Member rate.
//
// Low risk tier (§11.2) — fees come from the deterministic
// fee engine (src/lib/fees.ts), not LLM. No CTA button (purely
// informational; the button-bearing email is phase4).
export const phase3ThanksFeesAndPaymentComing: Template = {
  id: "phase3-thanks-fees-and-payment-coming",
  riskTier: "low",
  required: ["customerName", "setupFee", "monthlyFee", "moduleList"],
  optional: ["foundingMember"],
  subject: "Got your details — here's your quote",
  body: `Hi {{customerName}},

Thanks for filling that in. Here's a quick summary.

What you'll get:
{{moduleList}}

The cost:
  Setup (one-off):  £{{setupFee}}
  Monthly:          £{{monthlyFee}}/mo{{#if foundingMember}}

You qualified for our Founding Member rate — flat £99 setup
plus £15/month, locked in for as long as you stay subscribed.{{/if}}

What happens next: in a minute you'll get a second email with
a link to your onboarding hub. That's where we'll work through
a short checklist (~30 minutes total) — your web address, your
photos, your launch date.

We'll handle all the behind-the-scenes work (hosting, secure
connection, your custom email setup, building the site
itself). You'll get an email at every step so you always
know what's happening.

— ModuForge`,
};
