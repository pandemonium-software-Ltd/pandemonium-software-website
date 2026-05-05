// Email sending via Resend.
//
// Stage 2A only sends internal notifications to Ben (benpandher@proton.me).
// Client-facing emails (L1, L3, L4, etc. from Playbook Section 8) are
// drafted by Cowork and approved by Ben in the email client during the
// first-20-clients period — they don't go through this module.
//
// The "from" address must be on a verified domain in Resend.
// For now we use Resend's default onboarding sender; Stage 3 swaps in
// notifications@pandemoniumsoftware.co.uk once the domain is verified.

import { Resend } from "resend";
import { getServerEnv } from "./env";

const FROM_INTERNAL = "Pandemonium Notifications <onboarding@resend.dev>";
const TO_BEN = "benpandher@proton.me";

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
