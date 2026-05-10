import type { Template } from "../types";

// Sent when Cowork auto-applies a Hub Step 5 review edit + the
// LIVE-mode build completes (the customer's preview Worker is
// updated with the change). Pre-commit so there's no version-
// approval gate — the customer just sees the updated preview.
//
// Distinct from `change-request-applied-live` (which is the
// post-commit, customer-approved equivalent) and from
// `preview-ready` (which is the FIRST preview build at the start
// of Step 5 review).
//
// Tone: confirms the change is on the preview + invites the
// customer to keep reviewing. Reminds them of remaining edits in
// their pre-launch allowance.
//
// Low risk tier (§11.2) — confirmation of an already-completed
// state; no commitments to get wrong.
export const reviewEditApplied: Template = {
  id: "review-edit-applied",
  riskTier: "low",
  required: ["customerName", "previewUrl", "hubUrl"],
  cta: { urlKey: "previewUrl", label: "Open your preview" },
  subject: "Your edit is on the preview ✓",
  body: `Hi {{customerName}},

Your edit is applied. Your preview now reflects it:

  {{previewUrl}}

Have a look. If anything's not right, request another edit from
the Onboarding Hub — you've got 3 edits in total before launch.

Once you're happy with everything, hit Commit on the Hub and
we'll go live with the final version.

— Ben (via Cowork)`,
};
