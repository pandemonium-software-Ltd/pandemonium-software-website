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
  subject: "{{domain}} is verified — ready for launch ✓",
  body: `Hi {{customerName}},

Your domain {{domain}} is now verified and connected to Cloudflare.

Next up: I'll deploy your site to this domain when you give the
green light on the final review step in your onboarding hub. You'll
get one more email from me when the site goes live.

— Cowork (your ModuForge ops assistant)`,
};
