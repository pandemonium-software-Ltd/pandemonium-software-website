import type { Template } from "../types";

// Sent ONCE when Cowork creates a Cloudflare zone for a customer
// whose domain is at an external registrar (not Cloudflare's own
// registrar). Customer must repoint their registrar at the two
// nameservers in this email; Cloudflare detects the change and
// flips the zone status to "active" (typically 1-2 hours; max 48).
//
// Low risk tier (§11.2) — pure status update with a clear action.
// Auto-sends. Latched in Notion via `Nameservers Email Sent At`
// so we never resend on subsequent ticks.
export const domainNameserversPending: Template = {
  id: "domain-nameservers-pending",
  riskTier: "low",
  required: ["customerName", "domain", "ns1", "ns2"],
  subject: "Action needed: point {{domain}} at Cloudflare",
  body: `Hi {{customerName}},

To set up secure hosting for {{domain}}, I need it pointed at
Cloudflare's nameservers.

In your domain registrar's dashboard, find the section called
"Nameservers" or "DNS" and replace whatever's there with these
two:

  {{ns1}}
  {{ns2}}

That's it. Cloudflare will detect the change automatically — usually
within 1-2 hours, sometimes up to 48. I'll email you again as soon
as it's confirmed and your domain is ready for launch.

If anything's confusing, reply to this email with a screenshot of
where you've got stuck and I'll walk you through it.

— Cowork (your ModuForge ops assistant)`,
};
