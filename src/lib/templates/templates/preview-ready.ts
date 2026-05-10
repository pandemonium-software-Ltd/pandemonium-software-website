import type { Template } from "../types";

// Sent to the customer when Ben pastes the preview URL into the
// admin panel — that's the cue the preview is ready to view. The
// CTA points at the customer's hub Step 5, where the preview now
// renders inline (Phase 3 state) and the edits + commit sections
// unlock.
//
// We point at the hub URL rather than the preview URL directly so
// the customer lands inside the workflow (request edits, commit)
// instead of bouncing to a standalone iframe with no context.
//
// Risk tier low — pure status notification.
export const previewReady: Template = {
  id: "preview-ready",
  riskTier: "low",
  required: ["customerName", "previewUrl", "hubUrl"],
  cta: { urlKey: "hubUrl", label: "Review your preview" },
  subject: "Your site preview is ready ✓",
  body: `Hi {{customerName}},

Your site preview is ready to view.

Open your hub and head to Step 5 — the preview is embedded inline so
you can scroll through the whole site without bouncing tabs:

  {{hubUrl}}

(If you'd rather open the preview directly, here's the standalone
link: {{previewUrl}})

What to do next:
  1. Click through every page — header, services, contact, any
     module pages (booking / newsletter / enquiry form / GBP).
  2. Check it on your phone too — the embed shrinks to fit.
  3. If you want changes, use the "Request edits" section in
     Step 5. You get up to 3 rounds of pre-launch edits.
  4. When you're happy, scroll down to the commit section and
     hit "Submit and commit site" — that locks in your launch.

Reply to this email if anything's not loading or feels off.

Thanks,
Ben (and the ModuForge ops assistant)`,
};
