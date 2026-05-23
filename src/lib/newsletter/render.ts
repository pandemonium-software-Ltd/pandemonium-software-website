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

/** Image size — controls how wide the image renders in the email.
 *    small  ≈ 240px  (thumbnail-style, fits in a paragraph)
 *    medium ≈ 400px  (mid-size, leaves room around it)
 *    large  ≈ 100%   (fills the email body, the original default)
 *  Cap at the email body's 528px usable width so "large" never
 *  scrolls horizontally. */
export type NewsletterImageSize = "small" | "medium" | "large";

export type NewsletterImage = {
  /** Image URL — R2 public URL from upload, or a pasted third-
   *  party URL. */
  url: string;
  /** How wide to render this image in the email. Defaults to
   *  "large" when not specified — matches the old single-image
   *  behaviour. */
  size?: NewsletterImageSize;
};

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
  /** Optional inline images. Stacked vertically at the top
   *  (announcement, personal-note) or below the header
   *  (monthly-update). For promo, all images render below the
   *  banner block. Max 4 enforced upstream by the API schema.
   *  Each image can be small / medium / large independently. */
  images?: NewsletterImage[];
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
    imagesHtml(c.images, 24),
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
    imagesHtml(c.images, 18),
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
  // subject overlaid, then images, then short body + CTA. Punchy.
  // (Earlier version embedded the first image as a circular avatar
  // inside the banner; removed in favour of consistent multi-image
  // handling below the banner. Customers wanting the avatar look
  // can pick "Small" size which renders ~240px wide.)
  return wrap(brand, c.subject, [
    header(brand),
    `<tr><td style="padding:0 0 20px;"><div style="background:${esc(brand.primaryColor)};border-radius:12px;padding:32px 24px;text-align:center;"><h1 style="margin:0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#ffffff;">${esc(c.subject)}</h1></div></td></tr>`,
    imagesHtml(c.images, 20),
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
  // Bug fix 2026-05-15: this template used to silently drop the
  // image (the other 3 templates rendered it; personal-note didn't).
  // When a customer uploaded an image then chose the personal-note
  // template, the upload was wasted and the email shipped without
  // the image — confusing to debug because the upload + send both
  // succeeded silently. Now uses the same imagesHtml() helper as
  // every other template so it never falls out of sync.
  return wrap(brand, c.subject, [
    header(brand),
    imagesHtml(c.images, 18),
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

/** Render a stack of images. Each image gets its own <tr> with
 *  the bottom padding the template asks for between stacked
 *  blocks. Sizes:
 *    small  → 240px max
 *    medium → 400px max
 *    large  → 100% (uncapped, up to the 528px usable email width)
 *  We centre small + medium images so they sit comfortably in the
 *  body column; large fills the body so centring is moot. */
function imagesHtml(
  images: NewsletterImage[] | undefined,
  paddingBottomPx: number,
): string {
  if (!images || images.length === 0) return "";
  return images
    .map((img, i) => {
      if (!img.url) return "";
      const isLast = i === images.length - 1;
      // Last image gets the section padding; intermediates get a
      // smaller 12px gap so a stack doesn't look like 4 separate
      // sections.
      const pb = isLast ? paddingBottomPx : 12;
      const size = img.size ?? "large";
      const widthStyle =
        size === "small"
          ? "max-width:240px;width:100%;"
          : size === "medium"
            ? "max-width:400px;width:100%;"
            : "width:100%;";
      const align = size === "large" ? "left" : "center";
      return `<tr><td style="padding:0 0 ${pb}px;text-align:${align};"><img src="${esc(img.url)}" alt="" style="display:inline-block;${widthStyle}height:auto;border:0;border-radius:8px;"></td></tr>`;
    })
    .join("\n");
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
