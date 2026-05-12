import type { Template } from "../types";

// Sent the moment a subscriber clicks the unsubscribe link.
// No "are you sure?" pop-up — one click takes them off, then
// this confirmation arrives. Standard for compliant mailing
// systems and what regulators expect.
//
// Low risk tier — transactional confirmation.
export const newsletterUnsubscribed: Template = {
  id: "newsletter-unsubscribed",
  riskTier: "low",
  required: ["firstName", "senderName"],
  subject: "Unsubscribed from {{senderName}}",
  body: `Hi {{firstName}},

You've been unsubscribed from {{senderName}}'s newsletter.
You won't hear from them again unless you re-subscribe.

If this was a mistake, you can sign up again from their site
any time.`,
};
