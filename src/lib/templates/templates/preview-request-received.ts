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
  subject: "Got it — we're building your site now",
  body: `Hi {{customerName}},

Got your request — we're starting to build your site preview now.

What happens next:
  1. We'll put together a working preview from the photos, copy
     and modules you've shared. Usually takes 3-5 working days.
  2. You'll get another email with a link to view it.
  3. After that you can request up to 3 free rounds of tweaks,
     then sign off on your launch date.

While you wait:
  • You can still update earlier steps in your hub if you spot
    something — just open the hub from the button below.
  • Remembered something else important? Reply to this email
    and we'll add it before the preview goes out.

— ModuForge`,
};
