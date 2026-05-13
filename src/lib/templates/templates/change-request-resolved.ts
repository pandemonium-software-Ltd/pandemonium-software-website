import type { Template } from "../types";

// Sent when the operator marks a customer's change request "resolved"
// in /admin/[token]. The change has now landed on the customer's
// LIVE site — this email is post-commit + post-launch, not a
// preview-style "review before going live" notice. CTA layout
// reflects that: primary "View your site" so the customer can
// verify, secondary "Open dashboard" for the audit trail.
//
// Low risk tier (§11.2) for the wrapping. The reply text itself
// has been written by Ben (or by Cowork via the Drafts inbox flow
// in §11) — by the time it's interpolated here, it's already been
// reviewed.
export const changeRequestResolved: Template = {
  id: "change-request-resolved",
  riskTier: "low",
  required: [
    "customerName",
    "originalMessage",
    "reply",
    "siteUrl",
    "accountUrl",
  ],
  cta: { urlKey: "siteUrl", label: "View your site" },
  secondaryCta: { urlKey: "accountUrl", label: "Open dashboard" },
  subject: "Your change is done ✓",
  body: `Hi {{customerName}},

About this one:

  "{{originalMessage}}"

Our reply:

{{reply}}

That change is now live on your site — tap the button below to
take a look. If anything's off, just reply to this email and
we'll fix it.

You can see your other requests and submit new ones from your
dashboard any time.

— ModuForge`,
};
