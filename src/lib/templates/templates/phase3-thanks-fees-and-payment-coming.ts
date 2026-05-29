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

Thanks for filling that in — here's your quote.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR PACKAGE
{{moduleList}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRICING
  Setup (one-off):  £{{setupFee}}
  Monthly:          £{{monthlyFee}}/mo{{#if foundingMember}}

  ★ Founding Member rate — £99 setup + £15/mo, locked
    in for 5 years. No price increases, ever.{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT HAPPENS NEXT
  1. Pay — you'll see the payment page now
  2. Onboarding hub — a short checklist (~30 min) to
     set up your domain, upload photos, and pick a
     launch date
  3. We build — hosting, SSL, custom email, and the
     site itself are all handled for you
  4. Go live — you'll get an email at every step so
     you always know where things stand

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Questions? Just reply to this email.

— ModuForge`,
};
