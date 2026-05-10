import type { Template } from "../types";

// Sent when a Stripe operation fails because the customer's payment
// method is dead (expired card, insufficient funds, fraud block).
// Triggered today by the operator from /admin/[token] when they
// hit "Mark billing failed"; in Stripe Phase 2 by the webhook
// handler on `invoice.payment_failed` or `payment_intent.payment_failed`.
//
// Critically: any modules the customer was trying to ADD have been
// REMOVED from their selection at this point — they don't see paid
// features they haven't paid for. The CTA points them at the Stripe
// Customer Portal (Phase 2) or, today, asks them to reply with a
// new card number (we'll never put card numbers in the email reply
// — we'll send a Stripe-hosted payment link).
export const paymentMethodUpdateNeeded: Template = {
  id: "payment-method-update-needed",
  riskTier: "high", // money + customer-visible failure → always Ben review
  required: [
    "customerName",
    "failedActionDescription",
    "removedModulesSummary",
    "accountUrl",
  ],
  cta: { urlKey: "accountUrl", label: "Open your account" },
  subject: "Payment method needs updating",
  body: `Hi {{customerName}},

Quick heads-up: I tried to {{failedActionDescription}} but the
payment didn't go through. Most likely your card has expired or
been reissued — happens often.

What I've done:
  • Removed the modules you were adding ({{removedModulesSummary}})
    so you're not seeing features you haven't paid for.
  • Held off on charging you again until we sort out the card.

What I need from you:
  Reply to this email and I'll send you a secure Stripe link to
  update your card. Takes about 30 seconds. Once that's done I'll
  re-run the change and email you again to confirm.

Nothing else on your account is affected — your existing
subscription continues as normal. This is purely about the
add-on we couldn't process.

Thanks,
Ben (and the ModuForge ops assistant)`,
};
