// Render a newsletter email to (subject, html, text).
//
// Newsletters are brand-aware — primary + secondary colour + logo
// + optional inline image. Four templates with different visual
// rhythms but the same data shape. Inline-styled HTML only (no
// <style> blocks, no external CSS) to maximise email-client
// compatibility (Gmail / Outlook / Apple Mail / iOS Mail).
//
// One render function with a `template` switch — each template
// is ~30 lines of HTML generation in this file. Keeps everything
// in one place rather than spreading across 4 files for negligible
// benefit. Tests will pin the output.

export type NewsletterTemplateId =
  | "announcement"
  | "monthly-update"
  | "promo"
  | "personal-note";

export type NewsletterContent = {
  /** Template variant. */
  template: NewsletterTemplateId;
  /** Subject line. ≤ 80 chars typically. */
  subject: string;
  /** Plain-text body. Paragraphs separated by blank lines. The
   *  renderer splits on \n\n and styles each paragraph. */
  body: string;
  /** Optional CTA. When present, renders as a button below the
   *  body (or below the image for announcement template). */
  ctaLabel?: string;
  ctaUrl?: string;
  /** Optional inline image URL (R2 public URL). Always rendered
   *  at the top for announcement; below the header for
   *  monthly-update; banner-style for promo. Ignored for
   *  personal-note. */
  imageUrl?: string;
};

export type NewsletterBrand = {
  /** Customer's business name — shown in the header. */
  senderName: string;
  /** Customer's logo URL — rendered above the header on most
   *  templates. */
  logoUrl?: string;
  /** Primary brand colour — buttons, headers. 6-digit hex. */
  primaryColor: string;
  /** Secondary brand colour — subtle accents. 6-digit hex. */
  secondaryColor: string;
};

export type NewsletterFooter = {
  /** Unsubscribe URL — per-recipient, includes their token. */
  unsubscribeUrl: string;
  /** Optional website URL for the "View site" link in the
   *  footer. Falls back to omitting if absent. */
  websiteUrl?: string;
};

export type NewsletterRender = {
  subject: string;
  html: string;
  text: string;
};

/** Main entrypoint — picks template + delegates to per-template
 *  builder. */
export function renderNewsletter(
  content: NewsletterContent,
  brand: NewsletterBrand,
  footer: NewsletterFooter,
): NewsletterRender {
  const paragraphs = content.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const text = buildPlainText(content, paragraphs, footer);

  let html: string;
  switch (content.template) {
    case "announcement":
      html = renderAnnouncement(content, paragraphs, brand, footer);
      break;
    case "monthly-update":
      html = renderMonthlyUpdate(content, paragraphs, brand, footer);
      break;
    case "promo":
      html = renderPromo(content, paragraphs, brand, footer);
      break;
    case "personal-note":
      html = renderPersonalNote(content, paragraphs, brand, footer);
      break;
  }
  return { subject: content.subject, html, text };
}

// ---------- Per-template builders ----------
//
// All 4 templates share:
//   - Brand-header (logo + senderName) — handled by `header()`
//   - Footer with unsubscribe link — handled by `footer()`
// They differ in the body styling.

function renderAnnouncement(
  c: NewsletterContent,
  paragraphs: string[],
  brand: NewsletterBrand,
  footer: NewsletterFooter,
): string {
  return wrap(brand, c.subject, [
    header(brand),
    c.imageUrl
      ? `<tr><td style="padding:0 0 24px;"><img src="${esc(c.imageUrl)}" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:8px;"></td></tr>`
      : "",
    `<tr><td style="padding:0 0 12px;"><h1 style="margin:0;font-family:Georgia,serif;font-size:28px;line-height:1.25;color:${esc(brand.primaryColor)};">${esc(c.subject)}</h1></td></tr>`,
    paragraphsHtml(paragraphs),
    ctaHtml(c.ctaLabel, c.ctaUrl, brand),
    footerHtml(brand, footer),
  ]);
}

function renderMonthlyUpdate(
  c: NewsletterContent,
  paragraphs: string[],
  brand: NewsletterBrand,
  footer: NewsletterFooter,
): string {
  // Monthly-update splits paragraphs into "sections" — each one
  // gets its own bordered card. Lets the customer write 2-4
  // distinct news items with a single composer call.
  const sections = paragraphs
    .map(
      (p, i) =>
        `<tr><td style="padding:${i === 0 ? "0" : "12px"} 0 16px;"><div style="border-left:3px solid ${esc(brand.primaryColor)};padding:8px 0 8px 16px;"><p style="margin:0;font-size:16px;line-height:1.55;color:#172a42;">${linkify(esc(p))}</p></div></td></tr>`,
    )
    .join("\n");
  return wrap(brand, c.subject, [
    header(brand),
    `<tr><td style="padding:0 0 18px;"><h1 style="margin:0;font-family:Georgia,serif;font-size:24px;line-height:1.3;color:${esc(brand.primaryColor)};">${esc(c.subject)}</h1><p style="margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#5d82ab;">Monthly update from ${esc(brand.senderName)}</p></td></tr>`,
    c.imageUrl
      ? `<tr><td style="padding:0 0 18px;"><img src="${esc(c.imageUrl)}" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:8px;"></td></tr>`
      : "",
    sections,
    ctaHtml(c.ctaLabel, c.ctaUrl, brand),
    footerHtml(brand, footer),
  ]);
}

function renderPromo(
  c: NewsletterContent,
  paragraphs: string[],
  brand: NewsletterBrand,
  footer: NewsletterFooter,
): string {
  // Promo leads with a strong banner block in primary colour,
  // subject overlaid, then short body + CTA. Punchy.
  return wrap(brand, c.subject, [
    header(brand),
    `<tr><td style="padding:0 0 20px;"><div style="background:${esc(brand.primaryColor)};border-radius:12px;padding:32px 24px;text-align:center;">${c.imageUrl ? `<img src="${esc(c.imageUrl)}" alt="" style="display:block;margin:0 auto 16px;max-width:120px;height:auto;border:0;border-radius:60px;">` : ""}<h1 style="margin:0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#ffffff;">${esc(c.subject)}</h1></div></td></tr>`,
    paragraphsHtml(paragraphs),
    ctaHtml(c.ctaLabel, c.ctaUrl, brand),
    footerHtml(brand, footer),
  ]);
}

function renderPersonalNote(
  c: NewsletterContent,
  paragraphs: string[],
  brand: NewsletterBrand,
  footer: NewsletterFooter,
): string {
  // Minimal — just logo + (optional) image + body + sign-off.
  // Feels like a personal email, not a marketing send.
  //
  // Bug fix 2026-05-15: this template used to silently drop
  // c.imageUrl (the other 3 templates rendered it; personal-note
  // didn't). When a customer uploaded an image then chose the
  // personal-note template, the upload was wasted and the email
  // shipped without the image — confusing to debug because the
  // upload + send both succeeded silently.
  return wrap(brand, c.subject, [
    header(brand),
    c.imageUrl
      ? `<tr><td style="padding:0 0 18px;"><img src="${esc(c.imageUrl)}" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:8px;"></td></tr>`
      : "",
    paragraphsHtml(paragraphs),
    `<tr><td style="padding:8px 0 18px;"><p style="margin:0;font-size:16px;line-height:1.55;color:#172a42;">— ${esc(brand.senderName)}</p></td></tr>`,
    ctaHtml(c.ctaLabel, c.ctaUrl, brand),
    footerHtml(brand, footer),
  ]);
}

// ---------- Shared bits ----------

function wrap(
  brand: NewsletterBrand,
  subject: string,
  innerRows: string[],
): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#fdfcf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#172a42;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fdfcf9;">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #dae3ef;">
<tr><td style="padding:32px 36px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${innerRows.filter((r) => r.length > 0).join("\n")}
</table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function header(brand: NewsletterBrand): string {
  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.senderName)}" style="display:block;max-width:160px;max-height:60px;width:auto;height:auto;margin:0 auto 8px;border:0;">`
    : "";
  return `<tr><td style="padding:0 0 24px;text-align:center;border-bottom:1px solid #f0f4f9;">${logo}<p style="margin:${brand.logoUrl ? "0" : "0 0 4px"};font-family:Georgia,serif;font-size:18px;font-weight:600;color:#0f1d30;">${esc(brand.senderName)}</p></td></tr>
<tr><td style="height:24px;"></td></tr>`;
}

function paragraphsHtml(paragraphs: string[]): string {
  return paragraphs
    .map(
      (p) =>
        `<tr><td style="padding:0 0 16px;"><p style="margin:0;font-size:16px;line-height:1.65;color:#172a42;">${linkify(esc(p))}</p></td></tr>`,
    )
    .join("\n");
}

function ctaHtml(
  label: string | undefined,
  url: string | undefined,
  brand: NewsletterBrand,
): string {
  if (!label || !url) return "";
  return `<tr><td style="padding:8px 0 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="border-radius:8px;background:${esc(brand.primaryColor)};"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">${esc(label)}</a></td></tr></table></td></tr>`;
}

function footerHtml(
  brand: NewsletterBrand,
  footer: NewsletterFooter,
): string {
  return `<tr><td style="padding:28px 0 0;border-top:1px solid #f0f4f9;">
<p style="margin:0 0 6px;font-size:13px;color:#5d82ab;text-align:center;">You're receiving this because you signed up to hear from ${esc(brand.senderName)}.</p>
<p style="margin:0;font-size:12px;color:#5d82ab;text-align:center;"><a href="${esc(footer.unsubscribeUrl)}" style="color:#5d82ab;text-decoration:underline;">Unsubscribe</a>${footer.websiteUrl ? ` · <a href="${esc(footer.websiteUrl)}" style="color:#5d82ab;text-decoration:underline;">Visit website</a>` : ""}</p>
</td></tr>`;
}

function buildPlainText(
  c: NewsletterContent,
  paragraphs: string[],
  footer: NewsletterFooter,
): string {
  const cta = c.ctaLabel && c.ctaUrl ? `\n\n${c.ctaLabel}:\n${c.ctaUrl}` : "";
  return `${c.subject}\n\n${paragraphs.join("\n\n")}${cta}\n\n---\nUnsubscribe: ${footer.unsubscribeUrl}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(s: string): string {
  return s.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    (url) =>
      `<a href="${url}" style="color:#0f1d30;text-decoration:underline;">${url}</a>`,
  );
}
