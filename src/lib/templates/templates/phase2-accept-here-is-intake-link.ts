import type { Template } from "../types";

// Sent when a prospect's Phase 2 (qualification) outcome is "Accept".
// Hands them the intake form URL — the longer form where they pick
// modules, set brand colours, opening hours, etc.
//
// NOT sent for soft_reject / flag_for_review / clarification_needed
// outcomes — those need careful copy review and personalised replies,
// so they stay routed via the Cowork Drafts inbox (§11) for Ben to
// handle. (Future: dedicated templates per non-Accept outcome.)
//
// Low risk tier (§11.2) — Accept is a deterministic compatibility
// engine result, not an LLM-generated decision.
//
// URL is provided via cta only (button in HTML, appended in text
// fallback). Body doesn't include the URL inline.
export const phase2AcceptHereIsIntakeLink: Template = {
  id: "phase2-accept-here-is-intake-link",
  riskTier: "low",
  required: ["customerName", "intakeUrl"],
  cta: { urlKey: "intakeUrl", label: "Start the intake form" },
  subject: "Great fit — let's get the details, {{customerName}}",
  body: `Hi {{customerName}},

I've reviewed your qualification answers — looks like a great fit
for what I do.

Next step: a more detailed intake form. This is where we lock in
the modules you want (online booking, enquiry form, newsletter,
Google Business Profile setup), your brand colours and fonts,
opening hours — everything I need to build your site exactly the
way you want it.

About 15-20 minutes; you can save a section and come back later.
Use the button below to open the form.

Once you submit, I'll calculate your setup + monthly fees and
walk you through what happens next.

— Ben`,
};
