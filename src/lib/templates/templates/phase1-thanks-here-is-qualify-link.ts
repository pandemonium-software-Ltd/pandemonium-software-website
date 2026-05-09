import type { Template } from "../types";

// Sent immediately when a prospect submits the public /enquiry form.
// Replaces the old "you'll get a manual reply within 4 hours" gap —
// now they get the qualify link instantly + a promise that I review
// their answers personally within 4 hours of submitting.
//
// Low risk tier (§11.2) — pure status update with a clear next step.
// Auto-sends per the §11.1 cascade.
//
// URL is provided via cta (button in HTML, appended as
// "Open the qualification form: <url>" in the text fallback by
// notify.ts wrapInBrandedHtml). Body itself doesn't include the
// URL inline — keeps the HTML clean (button only, no duplicate
// link in prose).
export const phase1ThanksHereIsQualifyLink: Template = {
  id: "phase1-thanks-here-is-qualify-link",
  riskTier: "low",
  required: ["customerName", "businessName", "qualifyUrl"],
  cta: { urlKey: "qualifyUrl", label: "Open the qualification form" },
  subject: "Thanks for your enquiry — next step inside",
  body: `Hi {{customerName}},

Thanks for getting in touch about a website for {{businessName}}.

Before I commit either of our time, I just need a few quick
questions about what you're after — to make sure we're a good fit
and I can quote accurately. About 10 minutes; use the button
below to open the form.

Once you submit it, I'll review your answers personally and get
back to you within 4 hours.

— Ben`,
};
