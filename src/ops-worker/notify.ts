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
//
// FROM_NOTIFICATIONS is the default — used for ModuForge-product
// emails (phase1/phase2/phase3 receipts, hub-ready, signoff,
// password reset, module-change-applied, etc.). For emails sent
// ON BEHALF OF the customer's site to THEIR visitors (newsletter
// confirm/welcome/unsubscribed), the caller passes a
// `fromDisplayName` override so the inbox shows the customer's
// business name + their domain in the From header. Technical
// sender stays modu-forge.co.uk until customer-domain Resend
// verification is built (Stage 2C C5+).
const FROM_NOTIFICATIONS = "Ben @ ModuForge <ben@modu-forge.co.uk>";
const FROM_SENDER_EMAIL = "ben@modu-forge.co.uk";

/**
 * Sender brand identity used to render the email's HTML header
 * and footer. ModuForge is the default — used for any email about
 * the ModuForge product itself (sent FROM us TO our customers).
 * Customer is for emails sent ON BEHALF OF a customer's site TO
 * their visitors (newsletter signup, etc.) — header shows the
 * customer's business name + their primary brand colour + their
 * domain in the footer.
 */
export type SenderBrand =
  | { kind: "moduforge" }
  | {
      kind: "customer";
      businessName: string;
      /** Customer's primary brand colour as a hex string (e.g.
       *  "#791a3e"). Used for the accent underline + button
       *  background so the email visually matches their site. */
      primaryColor: string;
      /** Customer's domain (e.g. "mygem.co.uk"). Shown in the
       *  footer "from yourdomain.co.uk" line. */
      domain: string;
    };

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
  options?: {
    /** When provided, the email is rendered with customer branding
     *  instead of ModuForge branding. Header shows businessName +
     *  uses primaryColor for accents; footer shows the customer's
     *  domain instead of modu-forge.co.uk. */
    senderBrand?: SenderBrand;
  },
): Promise<SendResult> {
  const template = getTemplate(templateId);
  const rendered = renderTemplate(template, values);
  const senderBrand: SenderBrand = options?.senderBrand ?? { kind: "moduforge" };

  // From-header display name. ModuForge default vs customer's
  // business name. Verified sender domain is the same either way
  // (modu-forge.co.uk) until per-customer Resend verification
  // ships — until then, subscribers see "MyGem <ben@modu-forge.co.uk>"
  // in their inbox, with "MyGem" being the visible part.
  const fromHeader =
    senderBrand.kind === "customer"
      ? `${senderBrand.businessName} <${FROM_SENDER_EMAIL}>`
      : FROM_NOTIFICATIONS;

  const opsEmail =
    env.BEN_OPS_EMAIL ?? "pandamoniumsoftwareltd@gmail.com";

  // Plain-text fallback gets each CTA URL appended below the body
  // (templates intentionally don't put URLs inline anymore — keeps
  // the HTML version clean with just the button + the prose).
  const ctaLines: string[] = [];
  if (rendered.cta) {
    ctaLines.push(`${rendered.cta.label}:\n${rendered.cta.url}`);
  }
  if (rendered.secondaryCta) {
    ctaLines.push(
      `${rendered.secondaryCta.label}:\n${rendered.secondaryCta.url}`,
    );
  }
  const text =
    ctaLines.length > 0
      ? `${rendered.body}\n\n${ctaLines.join("\n\n")}`
      : rendered.body;

  const html = wrapInBrandedHtml({
    subject: rendered.subject,
    body: rendered.body,
    cta: rendered.cta,
    secondaryCta: rendered.secondaryCta,
    senderBrand,
  });

  // Reply-to: for customer-branded emails, replies should land
  // with the operator (we don't have the customer's inbox plumbed
  // for visitor-side replies). ModuForge-branded emails reply
  // to OPS_EMAIL too. Same handler either way.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
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
  /** Optional secondary CTA — rendered below the primary as a
   *  lighter "ghost" button (transparent background, navy outline).
   *  Used by post-launch confirmation emails to give the customer
   *  two natural next steps (e.g. View site + Open dashboard).
   *  Ignored when `cta` is absent. */
  secondaryCta?: { url: string; label: string };
  /** Sender branding — defaults to ModuForge for product emails.
   *  Newsletter / on-behalf-of-customer emails pass a customer
   *  brand so the header reads as the customer's business + their
   *  primary colour drives the accent + their domain replaces
   *  modu-forge.co.uk in the footer. */
  senderBrand?: SenderBrand;
};

export function wrapInBrandedHtml(opts: WrapOpts): string {
  const senderBrand: SenderBrand = opts.senderBrand ?? { kind: "moduforge" };
  const paragraphs = opts.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => paragraphToHtml(p))
    .join("\n");

  // Primary CTA colour follows the brand: ModuForge uses navy, the
  // customer-branded variant uses the customer's primaryColor so
  // the button visually matches their site.
  const ctaPrimaryColor =
    senderBrand.kind === "customer" ? senderBrand.primaryColor : "#0f1d30";
  const ctaParts: string[] = [];
  if (opts.cta) {
    ctaParts.push(buttonHtml(opts.cta.url, opts.cta.label, ctaPrimaryColor));
  }
  if (opts.cta && opts.secondaryCta) {
    ctaParts.push(
      ghostButtonHtml(
        opts.secondaryCta.url,
        opts.secondaryCta.label,
        ctaPrimaryColor,
      ),
    );
  }
  const cta = ctaParts.join("\n");

  const header = renderHeader(senderBrand);
  const footer = renderFooter(senderBrand);

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
            ${header}
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
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Email header — businessName + accent rule. Two variants:
 *  ModuForge (the product email default) shows "ModuForge / by
 *  Pandamonium Software" with the ember accent. Customer-branded
 *  shows the customer's business name with their primary colour
 *  as the accent rule. */
function renderHeader(senderBrand: SenderBrand): string {
  if (senderBrand.kind === "customer") {
    const safeName = escapeHtml(senderBrand.businessName);
    const safeColor = escapeHtml(senderBrand.primaryColor);
    return `<div style="font-family:Georgia,serif;font-size:26px;font-weight:600;color:#0f1d30;letter-spacing:-0.02em;line-height:1;">${safeName}</div>
            <div style="margin:18px auto 0;width:32px;height:2px;background-color:${safeColor};border-radius:1px;"></div>`;
  }
  return `<div style="font-family:Georgia,serif;font-size:26px;font-weight:600;color:#0f1d30;letter-spacing:-0.02em;line-height:1;">ModuForge</div>
            <div style="margin-top:6px;font-size:11px;color:#5d82ab;text-transform:uppercase;letter-spacing:0.12em;">by Pandamonium Software</div>
            <div style="margin:18px auto 0;width:32px;height:2px;background-color:#f97316;border-radius:1px;"></div>`;
}

/** Email footer — points the recipient back to the sender's
 *  identity. ModuForge variant says "reply lands in my inbox"
 *  with modu-forge.co.uk URL. Customer variant says "from
 *  yourdomain" so subscribers know it's from the customer's site,
 *  not ModuForge. */
function renderFooter(senderBrand: SenderBrand): string {
  if (senderBrand.kind === "customer") {
    const safeDomain = escapeHtml(senderBrand.domain);
    const safeName = escapeHtml(senderBrand.businessName);
    return `Sent from <strong>${safeName}</strong><br>
            <a href="https://${safeDomain}" style="color:#5d82ab;text-decoration:none;border-bottom:1px solid #b4c6dd;">${safeDomain}</a>`;
  }
  return `Just hit reply — your message lands in my inbox.<br>
            <a href="https://modu-forge.co.uk" style="color:#5d82ab;text-decoration:none;border-bottom:1px solid #b4c6dd;">modu-forge.co.uk</a>`;
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
 *
 * `primaryColor` defaults to navy (#0f1d30) for ModuForge-branded
 * emails. Customer-branded emails pass the customer's primaryColour
 * so the button matches their site palette.
 */
function buttonHtml(url: string, label: string, primaryColor = "#0f1d30"): string {
  const safeColor = escapeHtml(primaryColor);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="border-radius:8px;background-color:${safeColor};">
            <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.01em;border-radius:8px;">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/**
 * Secondary "ghost" button — transparent fill with colour outline.
 * Outline + text colour match the primary so the visual identity
 * stays cohesive. Lighter visual weight than the primary so the
 * recipient's eye lands on the primary action first.
 */
function ghostButtonHtml(url: string, label: string, primaryColor = "#0f1d30"): string {
  const safeColor = escapeHtml(primaryColor);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="border-radius:8px;background-color:#ffffff;border:2px solid ${safeColor};">
            <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 28px;color:${safeColor};text-decoration:none;font-size:15px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.01em;border-radius:6px;">${escapeHtml(label)}</a>
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
