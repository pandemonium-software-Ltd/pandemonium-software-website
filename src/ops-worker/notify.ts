// Customer-facing email notification helper.
//
// Renders a template (per src/lib/templates) and sends it via Resend
// to the customer. Used by ops-worker steps when they need to notify
// the customer of a state change (e.g. "your nameservers are ready",
// "your domain is verified", "your site is live").
//
// Risk-tier gating per §11.2 lives at the CALLER level — this helper
// just sends. If the template's riskTier is "low" (status updates),
// the step calls this directly (auto-send). If it's "medium" or
// "high", the step routes through the Cowork Drafts approval flow
// (§11) instead.
//
// Throws on send failure — the calling step's audit/exception
// wrapping (§4.6) handles the error.

import { renderTemplate, getTemplate } from "../lib/templates";
import type { TemplateValues } from "../lib/templates";
import type { ServerEnv } from "../lib/env";

// Verified Resend sending domain (modu-forge.co.uk verified
// 2026-05-09). Required for sending to arbitrary customer email
// addresses — Resend's free shared sender (onboarding@resend.dev)
// only delivers to the account owner's email, which broke real
// customer notifications. Same FROM as src/lib/email.ts so all
// outbound from us has one identity.
const FROM_NOTIFICATIONS = "Cowork (ModuForge) <cowork@modu-forge.co.uk>";

export type SendResult = {
  /** Resend's message id — useful for audit logs and tracing. */
  messageId: string;
};

/**
 * Render the named template with `values`, then send to
 * `recipientEmail` with replyTo = OPS_EMAIL (so any reply lands
 * in Ben's gmail per §9.0).
 *
 * Takes a plain email string (not a full ProspectRecord) so it
 * works equally well from the ops-worker (where we have the full
 * record after listProspectsNeedingOps) and from the customer-
 * facing API routes (where we may have just-validated form data
 * without yet touching Notion).
 *
 * Returns { messageId } on success; throws on failure.
 */
export async function sendCustomerEmail(
  env: ServerEnv,
  recipientEmail: string,
  templateId: string,
  values: TemplateValues,
): Promise<SendResult> {
  const template = getTemplate(templateId);
  const rendered = renderTemplate(template, values);

  const opsEmail =
    env.BEN_OPS_EMAIL ?? "pandamoniumsoftwareltd@gmail.com";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_NOTIFICATIONS,
      to: recipientEmail,
      reply_to: opsEmail,
      subject: rendered.subject,
      text: rendered.body,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(
      `Resend ${res.status} sending '${templateId}' to ${recipientEmail}: ${errText}`,
    );
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { messageId: json.id ?? "(no id)" };
}
