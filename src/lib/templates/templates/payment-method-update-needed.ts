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
  subject: "Quick fix needed: your card",
  body: `Hi {{customerName}},

Quick heads-up — I tried to {{failedActionDescription}} but the
payment didn't go through. Usually that means a card that's
expired or been replaced (happens to everyone).

What I've done:
  • Held off on the change you were trying to make
    ({{removedModulesSummary}}), so you're not paying for
    anything you haven't approved.
  • Stopped trying to charge you for now.

What I need from you:
  Just reply to this email. I'll send you a secure link to
  pop in a new card — takes about 30 seconds. Once that's
  done I'll re-run the change and confirm.

Your existing subscription continues as normal — this only
affects the new thing we were trying to add.

— Ben`,
};
