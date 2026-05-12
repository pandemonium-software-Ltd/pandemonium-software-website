// Admin (Ben) notification helper.
//
// Sends a plain-text email to BEN_OPS_EMAIL summarising an action
// the system just performed (or that Ben himself triggered) so he
// always has a paper trail in his inbox without having to open the
// admin dashboard. Distinct from `sendCustomerEmail` (branded HTML
// to customers) and `pageBen` in ops-worker/exceptions.ts (incident
// pager). This is the everyday "FYI" stream.
//
// Plain text only — admin inbox doesn't need decoration; what
// matters is grep-ability and inclusion of every relevant id so Ben
// can jump straight to the right Notion page / admin URL / GitHub
// run.
//
// Failure is logged + swallowed by the caller wherever this is
// fail-soft (most action paths). Throws on send failure so callers
// that want to surface a warning can.

import type { ServerEnv } from "./env";
import { site } from "./site";

type NotifyArgs = {
  /** Short subject — "[Cowork] " prefix is added automatically. */
  subject: string;
  /** Body. Newlines preserved as-is. */
  body: string;
  /** Optional grouping tag added to subject in [brackets]. */
  category?: "review-edit" | "change-request" | "preview" | "build";
};

/** From address — same identity as customer mail so threading in
 *  Ben's inbox stays consistent. */
const FROM_ADMIN = "Ben @ ModuForge <ben@modu-forge.co.uk>";

/**
 * Send an admin-only FYI email. Returns Resend's message id on
 * success, throws on failure (caller decides whether to surface).
 */
export async function notifyAdmin(
  env: ServerEnv,
  args: NotifyArgs,
): Promise<{ messageId: string }> {
  const opsEmail =
    env.BEN_OPS_EMAIL ?? "pandamoniumsoftwareltd@gmail.com";
  const cat = args.category ? ` [${args.category}]` : "";
  const subject = `[Cowork]${cat} ${args.subject}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADMIN,
      to: opsEmail,
      reply_to: opsEmail,
      subject,
      text: args.body,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { messageId: json.id ?? "(no id)" };
}

/**
 * Build a standard footer with admin URLs. Use as the last block
 * of a notifyAdmin body. Keeps formatting consistent across all
 * action notifications.
 */
export function adminFooter(args: {
  prospectName: string;
  prospectToken: string;
  /** Optional anchor inside the admin page, e.g. "re-96b4d5b3" */
  anchor?: string;
}): string {
  const base = site.url.replace(/\/$/, "");
  const url = `${base}/admin/${args.prospectToken}${args.anchor ? `#${args.anchor}` : ""}`;
  return `Open in admin:\n  ${url}\n\nProspect: ${args.prospectName} (${args.prospectToken.slice(0, 8)}…)`;
}
