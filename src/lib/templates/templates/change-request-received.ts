import type { Template } from "../types";

// Sent when a customer submits a change request via /account/[token]
// and Cowork has classified it as in-scope. Medium risk tier (§11.2)
// — auto-sends once classifier confidence is above threshold; first
// 10 invocations of this template route to Ben (Shadow mode).
//
// `expectedTimeline` is optional — Cowork fills it only when the
// classifier can predict completion confidently (e.g. simple content
// edit → "tomorrow afternoon"). Larger or fuzzier changes leave it
// blank so we don't over-promise.
export const changeRequestReceived: Template = {
  id: "change-request-received",
  riskTier: "medium",
  required: ["customerName", "requestSummary", "remainingDescription"],
  optional: ["expectedTimeline"],
  subject: "Your change request is in the queue",
  body: `Hi {{customerName}},

Got it: {{requestSummary}}.

I'll work on this{{#if expectedTimeline}} and have it live by {{expectedTimeline}}{{/if}}.

You have {{remainingDescription}} left for this month. You can
retract this request from your dashboard any time before I start
working on it.

— Cowork (your ModuForge ops assistant)`,
};
