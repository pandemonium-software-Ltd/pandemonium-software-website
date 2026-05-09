import type { Template } from "../types";

// Sent when a prospect completes the full Phase 3 intake form.
// Confirms receipt, lists their calculated fees, and tells them
// what to expect next.
//
// Doesn't include the onboarding hub link — that link is gated on
// status: Paid (per onboarding.ts isOnboardingUnlocked), so sending
// it before payment would just lead them to a "your link isn't
// active yet" page. Once Stage 2A Part 2 lands (Stripe), the Stripe
// Checkout webhook will fire a separate "you're paid up — here's
// your hub" email. For now (testing), the operator manually sends
// the hub link after manually flipping status to Paid.
//
// Low risk tier (§11.2) — fee numbers come from the deterministic
// fee engine (src/lib/fees.ts), not LLM. Auto-sends.
export const phase3ThanksFeesAndPaymentComing: Template = {
  id: "phase3-thanks-fees-and-payment-coming",
  riskTier: "low",
  required: ["customerName", "setupFee", "monthlyFee", "modulesList"],
  subject: "Intake received — your fees + what's next",
  body: `Hi {{customerName}},

Thanks for completing the intake form. Based on your module
selections, here's what your site will cost:

  Setup fee:    £{{setupFee}}
  Monthly fee:  £{{monthlyFee}}/month

That covers: {{modulesList}}.

Next up: I'll email you the payment link shortly. Once payment is
confirmed, you'll get access to the onboarding hub where you'll:

  • Connect your Cloudflare account (free, ~5 min sign-up)
  • Tell me your domain
  • Upload your logo and any photos you'd like used
  • Pick a go-live date

I'll handle everything technical from there — domain, hosting,
sender email setup, the lot. You'll get an email each time I move
forward so you can see progress.

— Ben (Pandamonium Software)`,
};
