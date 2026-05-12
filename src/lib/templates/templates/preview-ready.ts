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
  subject: "Your site preview is ready to view ✓",
  body: `Hi {{customerName}},

Good news — your site preview is ready.

Tap the button below to open your hub and scroll down to the
last step ("Review"). You'll see your site embedded right
there — click around like a real visitor would.

What to do:
  1. Look at every page — homepage, about, services, contact,
     plus anything extra (booking, newsletter, enquiry form).
  2. Try it on your phone too.
  3. If anything needs changing, use the "Request edits"
     section to tell me — you get up to 3 free rounds of
     tweaks before launch. I usually turn each round around
     within a working day.
  4. When you're happy, hit the big "Submit and commit site"
     button to lock in your launch date.

Reply to this email if anything looks broken or you're not
sure what you're looking at.

— Ben`,
};
