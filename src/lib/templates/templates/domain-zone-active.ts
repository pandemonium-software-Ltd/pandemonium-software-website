import type { Template } from "../types";

// Sent ONCE when a customer's zone status flips to "active" —
// meaning their nameservers update has propagated and Cloudflare
// has verified ownership. Either:
//   - For external registrars: customer just updated their NS records
//   - For Cloudflare registrars: the zone is active immediately
//   - For "already-have" registrars who happened to already point
//     at Cloudflare: instantly active
//
// Low risk tier (§11.2). Latched in Notion via `Domain Verified At`.
export const domainZoneActive: Template = {
  id: "domain-zone-active",
  riskTier: "low",
  required: ["customerName", "domain"],
  subject: "{{domain}} is all set — ready for launch ✓",
  body: `Hi {{customerName}},

Your web address {{domain}} is connected and ready.

The next step is yours: when you're happy with the site
preview, sign off on the final step in your onboarding hub
and we'll put it live on the date you've chosen.

— ModuForge`,
};
