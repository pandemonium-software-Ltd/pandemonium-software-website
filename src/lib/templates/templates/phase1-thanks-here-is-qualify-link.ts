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
  subject: "Thanks for getting in touch — next step",
  body: `Hi {{customerName}},

Thanks for the message about a website for {{businessName}}.

Before either of us spends much more time on this, I'd like to
get a clearer picture of what you need — that way I can quote
accurately and make sure I can actually help.

It's a short form, about 10 minutes. Tap the button below to
open it.

Once you've filled it in, I'll have a look myself and reply
within 4 working hours.

— Ben`,
};
