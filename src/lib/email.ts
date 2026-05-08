// Email sending via Resend.
//
// Stage 2A only sends internal notifications to Ben at the operations
// gmail (pandamoniumsoftwareltd@gmail.com). Client-facing emails (L1,
// L3, L4, etc. from Playbook Section 8) are drafted by Cowork and
// approved by Ben in the email client during the first-20-clients
// period — they don't go through this module.
//
// Sender identity (technical "from" vs human "reply to"):
//   - The "from" address must be on a Resend-verified domain. Right
//     now that's Resend's free shared sender (`onboarding@resend.dev`);
//     Stage 3 swaps in `notifications@moduforge.co.uk` once that
//     domain is registered and verified.
//   - The "reply-to" is set to OPS_EMAIL so any human reply (to a
//     customer-facing email or to an internal notification) lands in
//     the gmail inbox where Ben works. Gmail can't be a `from` address
//     directly — that's an industry-wide email-auth rule, not a Resend
//     limitation — so reply-to is the canonical pattern.

import { Resend } from "resend";
import { getServerEnv } from "./env";

/**
 * Operational inbox: where Ben reads and replies. Used as the
 * recipient for internal notifications AND the reply-to on every
 * email Resend sends, so all human-side correspondence funnels here.
 */
const OPS_EMAIL = "pandamoniumsoftwareltd@gmail.com";
const FROM_INTERNAL = "ModuForge Notifications <onboarding@resend.dev>";
const TO_BEN = OPS_EMAIL;

let cachedResend: Resend | null = null;

function getResend(): Resend {
  if (cachedResend) return cachedResend;
  const env = getServerEnv();
  cachedResend = new Resend(env.RESEND_API_KEY);
  return cachedResend;
}

export type NotificationKind =
  | "phase-1-enquiry"
  | "phase-2-qualification"
  | "phase-3-intake-complete";

export type NotificationPayload = {
  subject: string;
  body: string; // plain text, will become email body
};

/**
 * Send an internal notification to Ben. Returns null on success or
 * a string error message on failure (we never throw — email failure
 * shouldn't break a form submission).
 */
export async function sendInternalNotification(
  payload: NotificationPayload,
): Promise<string | null> {
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_INTERNAL,
      to: TO_BEN,
      // Reply-to lands in the same gmail inbox so a hit-Reply on any
      // ModuForge email (internal or, later, customer-facing) funnels
      // back to where Ben actually reads and writes.
      replyTo: OPS_EMAIL,
      subject: payload.subject,
      text: payload.body,
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return error.message ?? "Unknown Resend error";
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email] Unexpected error sending:", msg);
    return msg;
  }
}

// ---------- Notification builders ----------

import type { Phase1Data, Phase2Data, CompatibilityOutcome } from "./schemas";

export function buildPhase1Notification(
  data: Phase1Data,
  token: string,
  notionUrl: string,
): NotificationPayload {
  return {
    subject: `New enquiry from ${data.name} (${data.business})`,
    body:
      `New Phase 1 enquiry — ${data.name} from ${data.business}.\n\n` +
      `Business type: ${data.businessType}\n` +
      `Location: ${data.location}\n` +
      `Website situation: ${data.websiteSituation}\n` +
      `Email: ${data.email}\n` +
      `Phone: ${data.phone}\n\n` +
      `Notion: ${notionUrl}\n` +
      `Qualification link to send them: ${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pandemonium-software-website.benpandher.workers.dev"}/qualify/${token}\n\n` +
      `— Cowork`,
  };
}

export function buildPhase2Notification(
  data: Phase2Data,
  outcome: CompatibilityOutcome,
  prospectName: string,
  prospectEmail: string,
  token: string,
  notionUrl: string,
): NotificationPayload {
  const intakeLink =
    outcome.outcome === "accept"
      ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pandemonium-software-website.benpandher.workers.dev"}/intake/${token}`
      : null;

  const outcomeLabel = (
    {
      accept: "ACCEPT",
      soft_reject: "SOFT REJECT",
      flag_for_review: "FLAG FOR REVIEW",
      clarification_needed: "CLARIFICATION NEEDED",
    } as const
  )[outcome.outcome];

  return {
    subject: `[${outcomeLabel}] ${prospectName} — Phase 2 qualification`,
    body:
      `Phase 2 qualification submitted by ${prospectName} (${prospectEmail}).\n\n` +
      `Compatibility outcome: ${outcomeLabel}\n` +
      (outcome.hardBlockerTriggered
        ? `Hard blocker: ${outcome.hardBlockerTriggered}\n`
        : "") +
      (outcome.softBlockersTriggered.length
        ? `Soft blockers: ${outcome.softBlockersTriggered.join(", ")}\n`
        : "") +
      `\nReasoning:\n${outcome.reasoning}\n\n` +
      `--- Their qualification answers ---\n` +
      `Current acquisition: ${data.acquisitionMethod} (${data.acquisitionMonthlyCost > 0 ? `£${data.acquisitionMonthlyCost}/mo` : "no spend"})\n` +
      `Monthly enquiry volume: ${data.enquiryVolume}\n` +
      `Booking handling: ${data.bookingHandling}\n` +
      `Google Business Profile: ${data.gbpStatus}\n` +
      `Logo: ${data.logoStatus}\n` +
      `Modules they want: ${data.modulesInterest.join(", ") || "(none specified)"}\n` +
      `Target go-live: ${data.goLiveDate}\n` +
      (data.specificFeatures
        ? `\nSpecific features:\n${data.specificFeatures}\n`
        : "") +
      (data.dealBreakers ? `\nDeal-breakers:\n${data.dealBreakers}\n` : "") +
      `\nNotion: ${notionUrl}\n` +
      (intakeLink ? `Intake link to send them: ${intakeLink}\n` : "") +
      `\n— Cowork`,
  };
}

export function buildPhase3Notification(
  prospectName: string,
  prospectEmail: string,
  fees: { setup: number; monthly: number; modules: string[] },
  notionUrl: string,
): NotificationPayload {
  return {
    subject: `[INTAKE COMPLETE] ${prospectName} — ready for payment`,
    body:
      `${prospectName} (${prospectEmail}) just finished the full intake form.\n\n` +
      `Calculated fees:\n` +
      `  Setup: £${fees.setup}\n` +
      `  Monthly: £${fees.monthly}\n` +
      `  Modules: ${fees.modules.join(", ") || "Base only"}\n\n` +
      `Stripe Checkout integration is Stage 2A Part 2 — for now they'll see a placeholder payment page.\n\n` +
      `Notion: ${notionUrl}\n\n` +
      `— Cowork`,
  };
}

export function buildReviewEditNotification(args: {
  prospectName: string;
  business: string;
  editNumber: number;
  remaining: number;
  message: string;
  notionUrl: string;
  adminDetailUrl: string;
}): NotificationPayload {
  const businessTag = args.business ? ` at ${args.business}` : "";
  return {
    subject: `[REVIEW EDIT ${args.editNumber}/3] ${args.prospectName}${businessTag}`,
    body:
      `${args.prospectName}${businessTag} just submitted pre-launch edit ${args.editNumber} of 3. ` +
      `${args.remaining} edit${args.remaining === 1 ? "" : "s"} remaining.\n\n` +
      `--- Their request ---\n${args.message}\n--- End ---\n\n` +
      `Notion:        ${args.notionUrl}\n` +
      `Admin detail:  ${args.adminDetailUrl}\n\n` +
      `Scope check before applying:\n` +
      `  - Existing-content tweak / photo swap / copy edit / opening hours / etc. → in scope, apply\n` +
      `  - New page / new section / new feature / full redesign → out of scope; reply quoting separately;\n` +
      `    mark the edit "rejected" via /admin so the customer's 3 stand at the right count\n\n` +
      `— Cowork`,
  };
}

// ---------- Customer-facing notifications ----------

/**
 * Send an email DIRECTLY to the customer (not Ben). Used for
 * change-request resolution alerts and (later) DNS-verified /
 * preview-ready / report-ready notifications. Reply-to is the
 * ops gmail so customer replies still funnel into Ben's inbox.
 */
export async function sendCustomerNotification(args: {
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
}): Promise<string | null> {
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_INTERNAL, // Stage 3 swaps to notifications@moduforge.co.uk
      to: `${args.toName} <${args.toEmail}>`,
      replyTo: OPS_EMAIL,
      subject: args.subject,
      text: args.body,
    });
    if (error) {
      console.error("[email] customer notification error:", error);
      return error.message ?? "Unknown Resend error";
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email] Unexpected customer notification error:", msg);
    return msg;
  }
}

/**
 * Build the email body the customer receives when their change
 * request flips to resolved (or rejected). The reply text is
 * passed through verbatim — no transformation, so what the operator
 * (or Cowork) wrote in the dashboard is exactly what the customer
 * sees in their inbox.
 */
export function buildChangeRequestResolvedEmail(args: {
  customerName: string;
  businessName: string;
  originalMessage: string;
  reply: string;
  status: "resolved" | "rejected";
  accountUrl: string;
}): { subject: string; body: string } {
  const greeting = (args.customerName.split(/\s+/)[0] ?? "there").trim();
  const verb = args.status === "resolved" ? "resolved" : "closed";
  return {
    subject: `Your change request — ${verb}`,
    body:
      `Hi ${greeting},\n\n` +
      `${args.reply}\n\n` +
      `--- Your original request ---\n${args.originalMessage}\n--- End ---\n\n` +
      `You can see this and any future requests on your account dashboard:\n` +
      `${args.accountUrl}\n\n` +
      `Reply to this email if anything's not quite right.\n\n` +
      `Thanks,\n` +
      `Ben (and the ModuForge ops assistant)`,
  };
}

/**
 * Build the customer email that goes out the moment they sign off
 * Step 5 (Hub fully complete). Confirms the go-live date and
 * points them at the customer dashboard, which is now their home
 * for everything post-launch — change requests, status checks,
 * subscription details. Sent from /api/onboarding when the
 * `transitionedToHubComplete` flag fires.
 */
export function buildOnboardingCompleteEmail(args: {
  customerName: string;
  businessName: string;
  /** YYYY-MM-DD; rendered as "1 June 2026" in the subject + body. */
  goLiveDate: string;
  accountUrl: string;
}): { subject: string; body: string } {
  const greeting = (args.customerName.split(/\s+/)[0] ?? "there").trim();
  const goLivePretty = formatGoLive(args.goLiveDate);
  return {
    subject: `Signed off — your site goes live on ${goLivePretty}`,
    body:
      `Hi ${greeting},\n\n` +
      `Thanks for the careful review. You're signed off and your site is going live on ${goLivePretty}.\n\n` +
      `What happens next:\n` +
      `1. I'm building your site now. You'll get another email when your preview is ready (typically 3-5 working days).\n` +
      `2. After your site is live, your account dashboard is your home for everything — site status, subscription details, content change requests, the lot:\n` +
      `   ${args.accountUrl}\n` +
      `3. Your monthly subscription includes 3 change requests per month from launch — one item per request. Use the "Need a change?" form on the dashboard for anything you'd like updated.\n\n` +
      `If anything's not right between now and launch, just reply.\n\n` +
      `Thanks,\n` +
      `Ben (and the ModuForge ops assistant)`,
  };
}

function formatGoLive(iso: string): string {
  // Keep this in lib/email so it doesn't get import cycles via UI helpers.
  if (!iso) return "the agreed date";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
