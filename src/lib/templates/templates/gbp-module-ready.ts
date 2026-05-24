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
  required: [
    "customerName",
    "domain",
    "listingName",
    "listingAddress",
    "rating",
    "reviewCount",
  ],
  subject: "Your Google reviews are connected to {{domain}}",
  body: `Hi {{customerName}},

I have found your Google Business Profile and connected it
to your site. Your latest reviews will now appear on
{{domain}} automatically, and they refresh every day so the
rating and quotes stay current as new reviews come in.

Quick sanity check — here is the listing I matched you to:

  {{listingName}}
  {{listingAddress}}
  Rating {{rating}} from {{reviewCount}} Google review(s)

If that is NOT your business, hit reply with a fresh Google
Maps link to your listing and I will repoint it within the
day. (Most common reason for a wrong match: very common
business name shared with another shop in the same area.)

A couple of small things on your end (only if applicable):

  - Keep replying to reviews from your Google Business
    Profile dashboard — replies show up there as normal and
    help your search ranking.
  - If you ever change the business name or move address,
    update it in Google first; the changes flow through to
    your site within a day.

That is it from your end. The reviews block is now live on
your homepage.

— ModuForge`,
};
