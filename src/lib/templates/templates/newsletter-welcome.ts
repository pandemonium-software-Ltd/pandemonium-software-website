import type { Template } from "../types";

// Sent the moment a subscriber clicks the confirmation link.
// Friendly "you're in" — no marketing, no asks. Just confirms
// the action took and sets expectation for cadence.
//
// Low risk tier — transactional welcome.
export const newsletterWelcome: Template = {
  id: "newsletter-welcome",
  riskTier: "low",
  required: ["firstName", "senderName", "unsubscribeUrl"],
  cta: { urlKey: "unsubscribeUrl", label: "Unsubscribe (any time)" },
  subject: "You're in — {{senderName}}",
  body: `Hi {{firstName}},

You're confirmed — thanks for joining the list.

You'll get a short update from {{senderName}} roughly once a
month. Nothing daily, nothing spammy. If a particular update
isn't for you, the unsubscribe link is at the bottom of every
email and one click takes you off.

— {{senderName}}`,
};
