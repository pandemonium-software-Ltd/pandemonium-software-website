import type { Template } from "../types";

// Sent IMMEDIATELY when a customer submits a change request via the
// account dashboard. Confirms receipt + sets expectations on what
// happens next, so the customer doesn't wonder if their submission
// landed.
//
// Tone: brief and reassuring. The customer has just typed something,
// hit submit, and seen a green success line — the email is the
// asynchronous proof + a written record they can refer back to.
//
// "What happens next" deliberately covers BOTH paths the C5.6+
// automation handles:
//   1. Auto-applied (in-scope text changes the cron applies directly)
//   2. Manually reviewed (out-of-scope, ambiguous, needs Ben's call)
// Doesn't promise a timeline because the wait depends on the path.
//
// Low risk tier (§11.2) — pure transactional confirmation, no
// commitment, no facts to get wrong.
//
// Replaces the earlier "in the queue" version (which was designed
// for the not-yet-built C5.6 classifier flow). When that lands,
// the auto-apply confirmation will be a different template
// (`change-request-applied`) so this receipt stays unchanged.
export const changeRequestReceived: Template = {
  id: "change-request-received",
  riskTier: "low",
  required: ["customerName", "message", "accountUrl"],
  cta: { urlKey: "accountUrl", label: "Open your account dashboard" },
  subject: "Got it — change request received",
  body: `Hi {{customerName}},

Your change request landed safely:

  {{message}}

What happens next:
  • If it's a straight-forward edit (text, hours, services etc.)
    the system applies it automatically and your site updates
    within minutes.
  • If it needs my eye (anything design-y, structural, or
    out-of-scope) I'll review and reply on your dashboard.

You'll get another email when the change is done or if I need
anything from you. The request is listed on your account
dashboard so you can check status any time.

— Ben`,
};
