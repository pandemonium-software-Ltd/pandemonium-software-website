import type { Template } from "../types";

// Sent immediately after a visitor submits the subscribe widget
// on a customer's site. They click the link in this email to
// confirm — double-opt-in is required by GDPR + protects against
// bots adding random emails to the list.
//
// Tone: short, friendly, no marketing fluff. The recipient just
// clicked a button on someone's site — they shouldn't have to
// read prose to confirm.
//
// Low risk tier — transactional confirmation.
export const newsletterConfirmSubscribe: Template = {
  id: "newsletter-confirm-subscribe",
  riskTier: "low",
  required: ["firstName", "senderName", "confirmUrl", "unsubscribeUrl"],
  cta: { urlKey: "confirmUrl", label: "Confirm subscription" },
  subject: "Confirm your subscription to {{senderName}}",
  body: `Hi {{firstName}},

Thanks for signing up to hear from {{senderName}}.

Just one more step — click the button below to confirm your
email. After that, you're on the list.

If you didn't sign up, you can safely ignore this email — your
address won't be added without confirming.

Once subscribed, you can unsubscribe any time using the link at
the bottom of every email I send, or by clicking here:
{{unsubscribeUrl}}`,
};
