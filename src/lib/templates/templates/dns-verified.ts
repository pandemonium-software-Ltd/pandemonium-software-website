import type { Template } from "../types";

// Sent when a customer's domain DNS has been verified and pointed at
// their per-customer Worker (per §4.3 Step 2). Low risk tier (§11.2)
// — pure status update with no decision content; auto-sends.
export const dnsVerified: Template = {
  id: "dns-verified",
  riskTier: "low",
  required: ["customerName", "domain"],
  subject: "Your domain {{domain}} is verified ✓",
  body: `Hi {{customerName}},

Quick update — DNS for {{domain}} is now verified and pointed at
your ModuForge site.

What this means:
  • Your site goes live on this domain on your chosen launch date
  • Email forwarding (if you configured it) is active now
  • TLS certificate is provisioned automatically — no action needed
    from you

Next update from me: when the site goes live.

— Cowork (your ModuForge ops assistant)`,
};
