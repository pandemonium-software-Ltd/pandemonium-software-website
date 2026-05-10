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
  subject: "Preview ready for your change ✓",
  body: `Hi {{customerName}},

I've built a preview of the change you asked for:

  {{originalMessage}}

Have a look at the preview — your live site is unchanged until
you approve.

Preview: {{previewUrl}}

If it looks right, hit approve and the change will go live in a
few seconds:

  Approve & publish:  {{approveUrl}}

If it's not what you wanted, reject and I'll have another look:

  Reject:             {{rejectUrl}}

You can also see status + history any time on your account
dashboard: {{accountUrl}}

— Ben (via Cowork)`,
};
