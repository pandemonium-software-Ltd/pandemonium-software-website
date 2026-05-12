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
  subject: "One quick thing — connect {{domain}} to your site",
  body: `Hi {{customerName}},

To set up your new site at {{domain}}, we need you to do one
small change with whoever you bought the domain from (GoDaddy,
123-reg, Names.co.uk, etc.).

Log into your account with them, find a section called
"Nameservers" (or sometimes "DNS settings"), and replace
whatever's listed with these two lines:

  {{ns1}}
  {{ns2}}

Save the change. That's it from your end.

Once you've done it, tap the button below to let us know.
(If you forget, no stress — it'll sort itself out automatically
within a day or so anyway.)

If you can't find the right setting, reply with a screenshot
of the page you're looking at and we'll point you to the right
spot.

— ModuForge`,
};
