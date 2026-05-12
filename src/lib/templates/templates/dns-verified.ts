import type { Template } from "../types";

// Sent when a customer's domain DNS has been verified and pointed at
// their per-customer Worker (per §4.3 Step 2). Low risk tier (§11.2)
// — pure status update with no decision content; auto-sends.
export const dnsVerified: Template = {
  id: "dns-verified",
  riskTier: "low",
  required: ["customerName", "domain"],
  subject: "Your web address {{domain}} is ready ✓",
  body: `Hi {{customerName}},

Quick update — your web address {{domain}} is now hooked up
and ready to go.

In plain terms:
  • On your launch date, anyone typing {{domain}} into a
    browser will land on your new site.
  • Your site will load securely (the green padlock
    visitors expect to see).
  • If you set up email forwarding on this address, that's
    working now too.

Nothing to do from your end — I'll email you again the
moment your site is live.

— Ben`,
};
