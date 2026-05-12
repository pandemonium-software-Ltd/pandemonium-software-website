import type { Template } from "../types";

// Sent when Cowork classifies a change request as needing a hex
// code clarification — the customer asked for "more blue" or
// "darker red" etc. without supplying a specific colour code.
//
// Tone: friendly + concrete; show one or two reputable hex pickers
// so they don't have to know what a "hex" is.
//
// Low risk tier — pure clarification, no commitments made.
export const colourClarification: Template = {
  id: "colour-clarification",
  riskTier: "low",
  required: ["customerName", "originalMessage", "accountUrl"],
  cta: { urlKey: "accountUrl", label: "Open your dashboard" },
  subject: "Quick question — which colour code?",
  body: `Hi {{customerName}},

Got your change request:

  "{{originalMessage}}"

To swap brand colours we need an exact code (e.g. #2c5e9f) — it's
the only way we can lock in the same shade everywhere on your site.

Easiest way to grab one: open https://htmlcolorcodes.com/color-picker/
in a browser, pick the shade you like, copy the hex code (the
"#abcdef" thing) and reply to this email with it.

Once we have the hex we'll apply it straight away — usually live
within a few minutes.

— ModuForge`,
};
