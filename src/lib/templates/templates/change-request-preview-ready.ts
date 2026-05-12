import type { Template } from "../types";

// Sent when Cowork has auto-applied a change request and built a
// PREVIEW version (not yet live). The customer reviews the preview
// URL, then clicks Approve (→ promotes to live) or Reject (→
// reverts the patch + re-opens the request for Ben).
//
// The customer's live site is still untouched at this point —
// it's the version-upload (NOT version-deploy) that produced the
// previewUrl. So the worst case if the customer ignores this
// email is a stale preview sitting in Cloudflare; their site
// keeps showing the previous version.
//
// Medium risk tier (§11.2) — auto-sent post-classification, but
// the customer is the gate before anything goes live so the trust
// risk is bounded. First couple of weeks of real traffic should
// route through Ben's review (shadow mode in C5.7 doc) before
// flipping the auto-apply flag fully on.
export const changeRequestPreviewReady: Template = {
  id: "change-request-preview-ready",
  riskTier: "medium",
  required: [
    "customerName",
    "originalMessage",
    "previewUrl",
    "approveUrl",
    "rejectUrl",
    "accountUrl",
  ],
  cta: { urlKey: "previewUrl", label: "Open the preview" },
  subject: "Have a look — your change is ready to approve",
  body: `Hi {{customerName}},

We've made a preview of the change you asked for:

  "{{originalMessage}}"

Your live site hasn't changed yet — it only goes live once
you approve.

Preview: {{previewUrl}}

If it looks right, click here and it'll be live in a few
seconds:

  Approve & publish:  {{approveUrl}}

If it's not what you had in mind, reject and we'll take
another look:

  Reject:  {{rejectUrl}}

You can check status any time on your dashboard:
{{accountUrl}}

— ModuForge`,
};
