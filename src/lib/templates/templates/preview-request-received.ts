import type { Template } from "../types";

// Sent to the customer the moment they click "Request site preview"
// in Hub Step 5 Phase 1. Confirms we received the request and sets
// a realistic expectation for when the preview will be ready
// (typically 3-5 working days). Once Ben pastes the preview URL into
// the admin panel, the customer gets the separate `preview-ready`
// email with the actual link.
//
// Risk tier low — pure confirmation, no money or scope risk.
export const previewRequestReceived: Template = {
  id: "preview-request-received",
  riskTier: "low",
  required: ["customerName", "accountUrl"],
  cta: { urlKey: "accountUrl", label: "Open your hub" },
  subject: "Got it — building your site preview",
  body: `Hi {{customerName}},

Got your preview request. I'm starting work on your site now.

What happens next:
  1. I build your site preview from the brand assets, modules and
     review notes you've provided. Typically 3-5 working days.
  2. You'll get another email with a link to view the preview.
  3. From there you can request up to 3 rounds of pre-launch edits
     and then commit to launch on your chosen go-live date.

While you wait:
  - Your hub is read-only-ish for the review step but you can still
    edit Steps 1-4 if anything needs updating.
  - If you remember anything else important, hit reply to this
    email and I'll fold it into the preview before sending.

Thanks,
Ben (and the ModuForge ops assistant)`,
};
