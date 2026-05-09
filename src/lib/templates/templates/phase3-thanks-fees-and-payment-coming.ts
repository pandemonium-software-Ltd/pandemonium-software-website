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
  subject: "Intake received — your fee summary",
  body: `Hi {{customerName}},

Thanks for completing the intake form.

What you'll get:
{{moduleList}}

Pricing:
  Setup (one-off):  £{{setupFee}}
  Monthly:          £{{monthlyFee}}/mo{{#if foundingMember}}

You qualified for Founding Member pricing — flat £99 setup +
£15/month for everything, locked in for as long as you stay
subscribed.{{/if}}

What happens next: in a moment you'll get a second email with
your onboarding hub link. The hub walks you through 4-5 short
steps (~30 minutes total) to set up your Cloudflare account,
your domain, your brand assets, and pick a launch date.

I'll handle everything technical from there — DNS, hosting, TLS,
sender domain setup, the lot. You'll get an email each time I
make progress.

— Ben`,
};
