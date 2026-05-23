import type { Template } from "../types";

// Sent when a customer change request has been applied to the
// LIVE site. Two paths reach this template:
//   1. Customer clicks Approve on a preview-ready email and the
//      promote workflow completes successfully.
//   2. The site Cloudflare account has no workers.dev subdomain
//      so the preview-then-approve gate is bypassed and the
//      change applies directly (see build-callback fallback path).
//
// From the customer's perspective both look the same: the change
// they asked for is now live. Wording deliberately avoids any
// mention of "preview", "approve", "promote" — those are workflow
// details, not state. Body leads with timing + restates the
// change in quotes so they can match it to what they asked for.
//
// Distinct from `change-request-resolved` (operator-resolved by
// Ben with a custom reply) so the customer sees a system-style
// confirmation rather than a personal note.
//
// Low risk tier (§11.2) — pure confirmation of a state change.
export const changeRequestAppliedLive: Template = {
  id: "change-request-applied-live",
  riskTier: "low",
  required: [
    "customerName",
    "originalMessage",
    "siteUrl",
    "accountUrl",
  ],
  // Two CTAs: primary "View your site" so the customer can verify
  // the change landed where it should; secondary "Open dashboard"
  // for managing requests + subscription state.
  cta: { urlKey: "siteUrl", label: "View your site" },
  secondaryCta: { urlKey: "accountUrl", label: "Open dashboard" },
  subject: "Your change is live ✓",
  body: `Hi {{customerName}},

Done — the change you asked for is live on your site now:

  "{{originalMessage}}"

It usually takes under 30 seconds to show up. If you've already
got the page open, give it a hard refresh (Cmd+Shift+R on Mac,
Ctrl+F5 on Windows).

Tap the button below to check it. If something doesn't look
right, just reply to this email — we can revert in a few
seconds if needed.

For anything else, your dashboard tracks every change you've
made + how many you've got left this month.

— ModuForge`,
};
