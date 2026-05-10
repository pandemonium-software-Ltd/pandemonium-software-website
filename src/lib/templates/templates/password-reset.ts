import type { Template } from "../types";

// Sent when the customer hits "Forgot password" on /login/[token].
// Replaces their existing password — the old one is now dead.
//
// Tone: short, no apology (they triggered this themselves). Just
// the new password + the login URL.
//
// Low risk tier — pure transactional credential delivery.
export const passwordReset: Template = {
  id: "password-reset",
  riskTier: "low",
  required: ["customerName", "newPassword", "loginUrl"],
  cta: { urlKey: "loginUrl", label: "Sign in" },
  subject: "Your new password",
  body: `Hi {{customerName}},

Here's your new password:

  {{newPassword}}

Use it to sign in: {{loginUrl}}

Your old password no longer works. If you didn't request this
reset, hit reply and let me know — but typically it just means
you forgot the old one.

— Ben`,
};
