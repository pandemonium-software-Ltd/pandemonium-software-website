import type { Template } from "../types";

// Sent ONCE per customer when step3-tools successfully resolves
// their Google Business Profile place_id (URL parse or text-search
// fallback) AND fires the first reviews fetch. Confirms the
// connection is live and sets expectations for the daily refresh.
//
// Low risk tier (§11.2). Latched in onboardingData.tools via
// `gbpModuleReadyEmailSentAt` — never resend.
export const gbpModuleReady: Template = {
  id: "gbp-module-ready",
  riskTier: "low",
  required: ["customerName", "domain"],
  subject: "Your Google reviews are connected to {{domain}}",
  body: `Hi {{customerName}},

Quick update — I have found your Google Business Profile and
connected it to your site. Your latest Google reviews will
now appear on {{domain}} automatically, and they refresh
every day so the rating and quotes stay current as new
reviews come in.

A few small things on your end (only if applicable):

  - Keep replying to reviews from your Google Business
    Profile dashboard — replies show up there as normal and
    they help your search ranking.
  - If you ever change the business name or move address,
    update it in Google first; the changes flow through to
    your site within a day.

That's it from your end. You can see the live block on your
homepage now.

— ModuForge`,
};
