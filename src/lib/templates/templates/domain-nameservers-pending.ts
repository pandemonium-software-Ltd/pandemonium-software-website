import type { Template } from "../types";

// Sent ONCE when Cowork creates a Cloudflare zone for a customer
// whose domain is at an external registrar. The customer must
// repoint their registrar at the two nameservers in this email.
//
// Includes a "I've updated my nameservers" CTA button — clicking
// it stamps `Customer Confirmed Nameservers At` in Notion (a hint
// to Cowork / Ben that the registrar update is supposedly done;
// step2-domain still polls Cloudflare regardless). Same button
// appears on the Hub Step 2 UI so the customer has two equivalent
// ways to confirm.
//
// Low risk tier (§11.2). Latched in Notion via
// `Nameservers Email Sent At` so we never resend on subsequent
// ticks.
export const domainNameserversPending: Template = {
  id: "domain-nameservers-pending",
  riskTier: "low",
  required: ["customerName", "domain", "ns1", "ns2", "confirmUrl"],
  cta: { urlKey: "confirmUrl", label: "I've updated my nameservers" },
  subject: "Action needed: point {{domain}} at Cloudflare",
  body: `Hi {{customerName}},

To set up secure hosting for {{domain}}, I need it pointed at
Cloudflare's nameservers.

In your domain registrar's dashboard, find the section called
"Nameservers" or "DNS" and replace whatever's there with these
two:

  {{ns1}}
  {{ns2}}

Once you've done that, click the button below to let me know —
I'll check Cloudflare sooner. Otherwise it'll detect the change
automatically (usually within 1-2 hours, sometimes up to 48).

Either way, I'll email you again as soon as your domain is
verified and ready for launch.

If anything's confusing, reply to this email with a screenshot of
where you've got stuck and I'll walk you through it.

— Ben`,
};
