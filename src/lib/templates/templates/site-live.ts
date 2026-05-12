import type { Template } from "../types";

// Sent when the launch-day build completes successfully. The
// finalLaunch flag in the build-callback triggers this email
// (plus the status flip to "Live" + the Site Live At stamp).
//
// Tone: celebratory but practical — the customer's site is now
// public. CTA goes to the actual site so they can show it off
// straight away.
//
// Low risk tier (§11.2) — pure status confirmation of an
// automated transition.
export const siteLive: Template = {
  id: "site-live",
  riskTier: "low",
  required: ["customerName", "siteUrl", "accountUrl"],
  cta: { urlKey: "siteUrl", label: "View your site" },
  subject: "You're live 🎉",
  body: `Hi {{customerName}},

Big moment — your site is live. Anyone typing your web
address into a browser now lands on your new site.

The button below opens your site. Go take a look.

What this means for you:
  • You can share the link in your bio, on social, in emails,
    on business cards.
  • You can ask for up to 2 changes a month from your
    dashboard — text tweaks, swapped photos, new testimonials,
    price updates. We'll get them done within 48 working hours.
  • Bigger jobs (new pages, redesigns) we quote separately.

Your dashboard is where you'll do everything from now on
(submit changes, see status, manage your subscription):

  {{accountUrl}}

If anything's not right — anything at all — just reply to
this email and we'll sort it.

— ModuForge`,
};
