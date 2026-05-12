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

Got your change request:

  "{{message}}"

What happens next:
  • Straightforward edits (text, opening hours, services, your
    phone number, photos etc.) get applied automatically and
    your site usually updates within a few minutes.
  • Anything bigger or design-related we'll look at personally
    and reply on your dashboard.

We'll email you when it's done, or if we need anything from
you to finish it off. You can check status any time on your
dashboard.

— ModuForge`,
};
