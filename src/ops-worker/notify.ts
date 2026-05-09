// Customer-facing email notification helper.
//
// Renders a template (per src/lib/templates) and sends it via Resend
// to the customer with BOTH a plain-text and a branded HTML version.
// The HTML version uses inline styles only (no <style> blocks, no
// external resources, no images) — the email-client compatibility
// "lowest common denominator" approach. Mobile-friendly single-
// column layout.
//
// Risk-tier gating per §11.2 lives at the CALLER level — this helper
// just sends. Low risk = call this directly (auto-send). Medium /
// High = caller routes through the Cowork Drafts approval flow
// (§11) instead.
//
// Throws on send failure — the calling step's audit/exception
// wrapping (§4.6) handles the error. Template-engine errors
// (missing required values, unknown template id) propagate up and
// are also handled by the dispatcher.

import { renderTemplate, getTemplate } from "../lib/templates";
import type { TemplateValues } from "../lib/templates";
import type { ServerEnv } from "../lib/env";

// Verified Resend sending domain (modu-forge.co.uk verified
// 2026-05-09). Required for sending to arbitrary customer email
// addresses. Same FROM as src/lib/email.ts so all outbound from
// us has one identity. Local-part `ben@` reads as personal-from-
// founder rather than automation-y; reply-to lands at OPS_EMAIL
// regardless.
const FROM_NOTIFICATIONS = "Ben @ ModuForge <ben@modu-forge.co.uk>";

export type SendResult = {
  /** Resend's message id — useful for audit logs and tracing. */
  messageId: string;
};

/**
 * Render the named template with `values`, then send to
 * `recipientEmail` with replyTo = OPS_EMAIL (so any reply lands
 * in Ben's gmail per §9.0).
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

  // Plain-text fallback gets the CTA URL appended below the body
  // (templates intentionally don't put URLs inline anymore — keeps
  // the HTML version clean with just the button + the prose). The
  // appended line is recognisable to text-only readers as the
  // call-to-action.
  const text = rendered.cta
    ? `${rendered.body}\n\n${rendered.cta.label}:\n${rendered.cta.url}`
    : rendered.body;

  const html = wrapInBrandedHtml({
    subject: rendered.subject,
    body: rendered.body,
    cta: rendered.cta,
  });

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
      text,
      html,
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

// ---------- Branded HTML wrapper ----------
//
// Design constraints:
//   - Inline styles only (no <style> blocks; many clients strip them)
//   - 600px max width, single column, mobile-friendly
//   - System font stack (no @font-face — pulls external resource)
//   - No images (raises spam score; some clients block by default)
//   - Tables for layout (flexbox/grid have poor email-client support)
//   - 44px+ touch targets on the CTA button
//   - High-contrast palette: navy on cream
//
// Brand palette (from tailwind.config.ts):
//   navy-900   #0f1d30   primary text + button bg
//   navy-800   #172a42   body text
//   navy-500   #3d6591   secondary text
//   ember-500  #f97316   accent (used sparingly — header underline only)
//   cream-50   #fdfcf9   page background
//
// Typography: Georgia for the wordmark (matches the site's
// font-serif var); system sans for body.

type WrapOpts = {
  subject: string;
  body: string;
  cta?: { url: string; label: string };
};

export function wrapInBrandedHtml(opts: WrapOpts): string {
  const paragraphs = opts.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => paragraphToHtml(p))
    .join("\n");

  const cta = opts.cta ? buttonHtml(opts.cta.url, opts.cta.label) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#fdfcf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#172a42;-webkit-font-smoothing:antialiased;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#fdfcf9;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #dae3ef;">
        <tr>
          <td style="padding:36px 40px 28px;text-align:center;border-bottom:1px solid #f0f4f9;">
            <div style="font-family:Georgia,serif;font-size:26px;font-weight:600;color:#0f1d30;letter-spacing:-0.02em;line-height:1;">ModuForge</div>
            <div style="margin-top:6px;font-size:11px;color:#5d82ab;text-transform:uppercase;letter-spacing:0.12em;">by Pandamonium Software</div>
            <div style="margin:18px auto 0;width:32px;height:2px;background-color:#f97316;border-radius:1px;"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 8px;font-size:16px;line-height:1.65;color:#172a42;">
            ${paragraphs}
          </td>
        </tr>
        ${cta ? `<tr><td style="padding:8px 40px 32px;">${cta}</td></tr>` : ""}
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #f0f4f9;font-size:13px;color:#5d82ab;text-align:center;line-height:1.5;">
            Just hit reply — your message lands in my inbox.<br>
            <a href="https://modu-forge.co.uk" style="color:#5d82ab;text-decoration:none;border-bottom:1px solid #b4c6dd;">modu-forge.co.uk</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Convert one plain-text paragraph (no internal blank lines) to a
 * styled <p>. Preserves single-line breaks via <br> (handy for the
 * indented bullets in templates). Auto-linkifies http(s) URLs so
 * the URL also works as a clickable link inside the prose, even
 * when there's a separate CTA button below.
 */
function paragraphToHtml(text: string): string {
  // 1. HTML-escape first (so the URL regex below can safely produce
  //    href attributes from already-safe text).
  const escaped = escapeHtml(text);
  // 2. Auto-linkify URLs.
  const linked = escaped.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    (url) =>
      `<a href="${url}" style="color:#0f1d30;text-decoration:none;border-bottom:1px solid #5d82ab;word-break:break-all;">${url}</a>`,
  );
  // 3. Convert single newlines to <br> so the templates' multi-line
  //    formatting (bullet indents etc.) is preserved.
  const withBreaks = linked.replace(/\n/g, "<br>");
  return `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#172a42;">${withBreaks}</p>`;
}

/**
 * The branded CTA button. Styled as a "bulletproof button" — a
 * styled <a> wrapped in a table for Outlook compatibility (Outlook
 * historically renders padded inline-block <a> badly).
 */
function buttonHtml(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="border-radius:8px;background-color:#0f1d30;">
            <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.01em;border-radius:8px;">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
