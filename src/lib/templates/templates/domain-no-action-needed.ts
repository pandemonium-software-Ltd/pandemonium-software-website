import type { Template } from "../types";

// Sent ONCE when a customer's domain doesn't need any
// nameserver work from them. Two cases trigger it:
//   - Registrar = "cloudflare": they bought the domain through
//     Cloudflare Registrar, so nameservers are CF's by default
//   - Registrar = "already-have" AND the zone is instantly active:
//     their existing registrar already points at Cloudflare
//
// Purpose: reassurance. Without this email the customer fills
// in Step 2, hears nothing, then suddenly gets "your site is
// live" — leaving them wondering whether something was missed.
//
// Low risk tier (§11.2). Latched in Notion via the same
// `Nameservers Email Sent At` field used by domain-nameservers-
// pending — only ONE domain-setup email ever lands per customer.
export const domainNoActionNeeded: Template = {
  id: "domain-no-action-needed",
  riskTier: "low",
  required: ["customerName", "domain"],
  subject: "{{domain}} — nothing for you to do",
  body: `Hi {{customerName}},

Quick heads up — your domain {{domain}} is already on
Cloudflare, so there are no nameserver changes for you to
make. Nice and easy.

We'll wire it up to your new site on our side and email you
again as soon as it goes live.

— ModuForge`,
};
