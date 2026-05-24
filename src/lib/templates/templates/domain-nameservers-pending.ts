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
  required: ["customerName", "domain", "ns1", "ns2", "confirmUrl", "hubUrl"],
  cta: { urlKey: "confirmUrl", label: "I've updated my nameservers" },
  subject: "One quick thing — connect {{domain}} to your site",
  body: `Hi {{customerName}},

Your domain {{domain}} is ready to connect to your new site.
The last step needs you to make one small change at whoever
you bought it from (GoDaddy, 123-reg, Names.co.uk, etc.).

Replace their nameservers with these two:

  {{ns1}}
  {{ns2}}

Step-by-step (works at any registrar):

  1. Log into the account where you bought {{domain}}.
  2. Open the page for {{domain}} and look for a section
     called "Nameservers" (sometimes "DNS settings" or
     "Domain settings").
  3. Switch the option to "Use custom nameservers" — the
     wording varies (could be "I'll use my own" or similar).
  4. Delete whatever's listed and paste in these two lines:
        {{ns1}}
        {{ns2}}
  5. Save the change. That's it from your end.

Need a step-by-step for your exact registrar? Detailed
walkthroughs for 123-reg, GoDaddy, Namecheap, IONOS,
Fasthosts and Names.co.uk are in your onboarding hub:

  {{hubUrl}}

Once you've saved the change, tap the button below to let
us know. (If you forget, no stress — it'll sort itself out
automatically within a day or so.)

If you can't find the right setting at all, reply with a
screenshot of the page you're on and we'll point you to it.

— ModuForge`,
};
