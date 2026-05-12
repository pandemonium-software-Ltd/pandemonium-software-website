import type { Template } from "../types";

// Sent when a prospect's Phase 2 (qualification) outcome is "Accept".
// Hands them the intake form URL — the longer form where they pick
// modules, set brand colours, opening hours, etc.
//
// Also includes the customer's NEW password for accessing all of
// their personal screens (intake, hub, account dashboard). This is
// the ONLY time they get the password unprompted; after this they
// have to use the Forgot Password flow if lost.
//
// NOT sent for soft_reject / flag_for_review / clarification_needed
// outcomes — those need careful copy review and personalised replies,
// so they stay routed via the Cowork Drafts inbox (§11) for Ben to
// handle. (Future: dedicated templates per non-Accept outcome.)
//
// Low risk tier (§11.2) — Accept is a deterministic compatibility
// engine result, not an LLM-generated decision. Password is generated
// + hashed + persisted before this email is sent (atomic with the
// Notion write that flips Phase 2 status).
//
// `password` is REQUIRED — the qualify route generates + hashes a
// password before calling sendCustomerEmail with this template.
export const phase2AcceptHereIsIntakeLink: Template = {
  id: "phase2-accept-here-is-intake-link",
  riskTier: "low",
  required: ["customerName", "intakeUrl", "password"],
  cta: { urlKey: "intakeUrl", label: "Start the intake form" },
  subject: "We're a good match — let's get the details",
  body: `Hi {{customerName}},

We've had a look at your answers — looks like a great fit. We'd
be glad to build your site.

Next step is a slightly longer form where you tell us the
specifics: which add-ons you want (online booking, enquiry
form, newsletter, Google listing setup), your brand colours,
opening hours, etc. Everything we need to build your site
the way you want it.

About 15-20 minutes. You can save and come back to it any time.

You'll also need this password to sign in to your hub and
dashboard:

  {{password}}

Save this email — we only send the password once. If you ever
lose it, there's a "Forgot password" link on every sign-in
page that'll send you a new one.

Once you've finished the form, we'll work out your fees and
take it from there.

— ModuForge`,
};
