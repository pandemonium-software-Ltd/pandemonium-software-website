import type { Template } from "../types";

// Sent when Cowork auto-applies a Hub Step 5 review edit + the
// LIVE-mode build completes (the customer's preview Worker is
// updated with the change). Pre-commit so there's no version-
// approval gate — the customer just sees the updated preview.
//
// IMPORTANT (C5.7+ preview-prevention): the email does NOT
// include the preview Worker URL. The preview is only viewable
// inside the Onboarding Hub (Step 6 Review) embedded in an
// iframe with the security locks in place. Sharing the
// workers.dev URL externally is a leak risk we deliberately
// don't enable. CTA points the customer to the Hub.
//
// Distinct from `change-request-applied-live` (post-commit,
// customer-approved equivalent) and from `preview-ready`
// (first preview build at the start of Step 5 review).
//
// Tone: confirms the change is on the preview + invites the
// customer to keep reviewing inside the Hub. Reminds them of
// remaining edits in their pre-launch allowance.
//
// Low risk tier (§11.2) — confirmation of an already-completed
// state; no commitments to get wrong.
export const reviewEditApplied: Template = {
  id: "review-edit-applied",
  riskTier: "low",
  required: ["customerName", "hubUrl"],
  cta: { urlKey: "hubUrl", label: "Open your onboarding" },
  subject: "Your change is on the preview ✓",
  body: `Hi {{customerName}},

Your edit is done — the preview now shows the change you
asked for.

Tap the button below to open your hub and take a look. The
preview sits inside the Review step. If you want to view it
bigger, hit the full-screen button on the top-right.

If something still isn't right, just submit another edit on
the Review step — you've got up to 3 free rounds before
launch.

Once everything looks the way you want, hit "Submit and
commit site" on that same step to lock in your launch.

— Ben`,
};
