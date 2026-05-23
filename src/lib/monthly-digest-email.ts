// ModuForge-branded monthly digest email template.
//
// Unlike the customer-facing newsletter sends (which take the
// customer's colours + logo), this is FROM ModuForge — same brand
// palette as the marketing site. The recipient is the customer
// themselves, not their subscribers, so we use Ben's voice.
//
// Inline-styled tables only — same email-client compatibility
// constraints as customer newsletters (no <style> blocks, no
// external CSS). Layout mirrors the customer dashboard's
// Analytics tile so the digest feels like a snapshot of what they
// would see if they opened /account/[token].

import type { DigestPayload } from "./monthly-digest";
import { humanizePath } from "./humanize-path";

export type DigestRenderArgs = {
  /** Customer's first name for the greeting. */
  firstName: string;
  /** Customer's business name (header). */
  businessName: string;
  /** Their personal dashboard URL — anchor for the "See full
   *  breakdown" CTA. */
  dashboardUrl: string;
  /** Aggregated digest data (last month + delta). */
  payload: DigestPayload;
};

// ModuForge palette mirrors the marketing site CSS variables.
const NAVY = "#0f1d30";
const NAVY_700 = "#1e3a55";
const NAVY_500 = "#5d82ab";
const CREAM = "#fdfcf9";
const CREAM_100 = "#f5efe2";
const EMBER = "#fb923c";

export function renderMonthlyDigest(args: DigestRenderArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const { firstName, businessName, dashboardUrl, payload } = args;
  const month = payload.month.monthLabel;

  // Subject mirrors the headline number when there's traffic so
  // the customer sees "53 visits" in their inbox preview.
  const subject = payload.hasActivity
    ? `Your ${month} results — ${payload.website.pageviews.toLocaleString("en-GB")} visits`
    : `Your ${month} results — a quiet month`;

  const html = buildHtml({
    firstName,
    businessName,
    month,
    payload,
    dashboardUrl,
  });
  const text = buildText({
    firstName,
    businessName,
    month,
    payload,
    dashboardUrl,
  });

  return { subject, html, text };
}

// ---------- HTML builder ----------

function buildHtml(args: {
  firstName: string;
  businessName: string;
  month: string;
  payload: DigestPayload;
  dashboardUrl: string;
}): string {
  const { firstName, businessName, month, payload, dashboardUrl } = args;
  const w = payload.website;
  const n = payload.newsletter;

  // Delta badge — colour codes up/down/flat consistently with the
  // dashboard's tile. Null delta = "first period" pill.
  const deltaPill = (() => {
    if (w.pageviewsDeltaPct === null) {
      return `<span style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">first month</span>`;
    }
    if (w.pageviewsDeltaPct === 0) {
      return `<span style="display:inline-block;background:#e5e7eb;color:#374151;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">no change</span>`;
    }
    const up = w.pageviewsDeltaPct > 0;
    return `<span style="display:inline-block;background:${up ? "#dcfce7" : "#fee2e2"};color:${up ? "#166534" : "#991b1b"};font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">${up ? "▲" : "▼"} ${Math.abs(w.pageviewsDeltaPct)}% vs last month</span>`;
  })();

  const topPagesHtml =
    w.topPages.length === 0
      ? `<p style="margin:8px 0 0;font-size:14px;color:${NAVY_500};">Not enough data to pick top pages yet.</p>`
      : `<ol style="margin:8px 0 0;padding-left:18px;font-size:14px;color:${NAVY};">${w.topPages
          .map(
            (p) =>
              `<li style="margin:4px 0;"><span style="font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;">${esc(humanizePath(p.name))}</span> <span style="color:${NAVY_500};">— ${p.count.toLocaleString("en-GB")} requests</span></li>`,
          )
          .join("")}</ol>`;

  const newsletterBlock = n
    ? `
      <tr><td style="padding:0 0 12px;">
        <h2 style="margin:24px 0 8px;font-family:Georgia,serif;font-size:18px;color:${NAVY};">📧 Newsletter</h2>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding:8px;background:${CREAM_100};border-radius:8px;text-align:center;">
              <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${NAVY_500};">Sent</p>
              <p style="margin:4px 0 0;font-family:'SFMono-Regular',Consolas,monospace;font-size:18px;font-weight:700;color:${NAVY};">${n.sendsCount}</p>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:8px;background:${CREAM_100};border-radius:8px;text-align:center;">
              <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${NAVY_500};">Recipients</p>
              <p style="margin:4px 0 0;font-family:'SFMono-Regular',Consolas,monospace;font-size:18px;font-weight:700;color:${NAVY};">${n.recipientCount.toLocaleString("en-GB")}</p>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:8px;background:${CREAM_100};border-radius:8px;text-align:center;">
              <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${NAVY_500};">Opened</p>
              <p style="margin:4px 0 0;font-family:'SFMono-Regular',Consolas,monospace;font-size:18px;font-weight:700;color:${NAVY};">${n.openRatePct === null ? "—" : `${n.openRatePct}%`}</p>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:8px;background:${CREAM_100};border-radius:8px;text-align:center;">
              <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${NAVY_500};">Clicked</p>
              <p style="margin:4px 0 0;font-family:'SFMono-Regular',Consolas,monospace;font-size:18px;font-weight:700;color:${NAVY};">${n.clickRatePct === null ? "—" : `${n.clickRatePct}%`}</p>
            </td>
          </tr>
        </table>
      </td></tr>`
    : "";

  const quietBlock = !payload.hasActivity
    ? `
      <tr><td style="padding:16px 0 0;">
        <div style="background:${CREAM_100};border-radius:12px;padding:18px;">
          <p style="margin:0;font-size:14px;line-height:1.55;color:${NAVY_700};">
            A quiet month — that's normal as your site gets going.
            Most small-business sites need 2-3 months of steady
            content before search picks them up. If you've not
            already, add your Google Business Profile and link to
            your site from any social profiles you have. Reply if
            you'd like a quick chat about driving more visits.
          </p>
        </div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`Your ${month} results`)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${NAVY};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #dae3ef;">
<tr><td style="padding:32px 36px;">

<!-- ModuForge header -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:0 0 24px;text-align:center;border-bottom:1px solid #f0f4f9;">
  <p style="margin:0;font-family:Georgia,serif;font-size:20px;font-weight:700;color:${NAVY};letter-spacing:-0.01em;">ModuForge</p>
  <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${NAVY_500};">Monthly results</p>
</td></tr>
<tr><td style="height:24px;"></td></tr>

<!-- Greeting + month + delta -->
<tr><td style="padding:0 0 8px;">
  <p style="margin:0;font-size:16px;color:${NAVY_700};">Morning ${esc(firstName)},</p>
</td></tr>
<tr><td style="padding:0 0 18px;">
  <p style="margin:0;font-size:16px;line-height:1.55;color:${NAVY_700};">
    Here's how <strong style="color:${NAVY};">${esc(businessName)}</strong> did in <strong>${esc(month)}</strong>.
  </p>
</td></tr>

<!-- Headline numbers -->
<tr><td style="padding:0 0 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td style="padding:16px;background:${CREAM_100};border-radius:12px;text-align:center;">
        <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${NAVY_500};">Visits</p>
        <p style="margin:6px 0 0;font-family:'SFMono-Regular',Consolas,monospace;font-size:30px;font-weight:800;color:${NAVY};">${w.pageviews.toLocaleString("en-GB")}</p>
        <p style="margin:6px 0 0;">${deltaPill}</p>
      </td>
      <td style="width:12px;"></td>
      <td style="padding:16px;background:${CREAM_100};border-radius:12px;text-align:center;">
        <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${NAVY_500};">People who visited</p>
        <p style="margin:6px 0 0;font-family:'SFMono-Regular',Consolas,monospace;font-size:30px;font-weight:800;color:${NAVY};">≈ ${w.uniques.toLocaleString("en-GB")}</p>
        <p style="margin:6px 0 0;font-size:10px;color:${NAVY_500};">estimated unique visitors</p>
      </td>
    </tr>
  </table>
</td></tr>

${quietBlock}

<!-- Top pages -->
${
  payload.hasActivity
    ? `<tr><td style="padding:8px 0 4px;">
        <h2 style="margin:0;font-family:Georgia,serif;font-size:18px;color:${NAVY};">📄 Most viewed pages</h2>
        ${topPagesHtml}
      </td></tr>`
    : ""
}

<!-- Newsletter -->
${newsletterBlock}

<!-- CTA -->
<tr><td style="padding:28px 0 0;text-align:center;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="border-radius:10px;background:${NAVY};">
    <a href="${esc(dashboardUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:10px;">See full breakdown →</a>
  </td></tr></table>
  <p style="margin:12px 0 0;font-size:12px;color:${NAVY_500};">Top countries, daily traffic chart, and more in your dashboard.</p>
</td></tr>

<!-- Footer -->
<tr><td style="padding:32px 0 0;border-top:1px solid #f0f4f9;">
  <p style="margin:0 0 6px;font-size:13px;color:${NAVY_500};text-align:center;">You're getting this once a month because your site is live with ModuForge.</p>
  <p style="margin:0;font-size:12px;color:${NAVY_500};text-align:center;">Reply to this email any time — it comes straight to me.<br>— Ben</p>
  <p style="margin:14px 0 0;font-size:11px;color:${NAVY_500};text-align:center;">
    <a href="https://modu-forge.co.uk" style="color:${NAVY_500};text-decoration:underline;">modu-forge.co.uk</a>
    · <span style="color:${EMBER};">●</span> Built with care
  </p>
</td></tr>

</table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ---------- Plaintext builder ----------

function buildText(args: {
  firstName: string;
  businessName: string;
  month: string;
  payload: DigestPayload;
  dashboardUrl: string;
}): string {
  const { firstName, businessName, month, payload, dashboardUrl } = args;
  const w = payload.website;
  const n = payload.newsletter;
  const lines: string[] = [];
  lines.push(`Morning ${firstName},`);
  lines.push("");
  lines.push(`Here's how ${businessName} did in ${month}.`);
  lines.push("");
  lines.push(`Visits: ${w.pageviews.toLocaleString("en-GB")}`);
  lines.push(`People who visited (estimate): ${w.uniques.toLocaleString("en-GB")}`);
  if (w.pageviewsDeltaPct !== null) {
    const arrow = w.pageviewsDeltaPct >= 0 ? "▲" : "▼";
    lines.push(
      `${arrow} ${Math.abs(w.pageviewsDeltaPct)}% vs the previous month`,
    );
  }
  if (w.topPages.length > 0) {
    lines.push("");
    lines.push("Most viewed pages:");
    w.topPages.forEach((p, i) => {
      lines.push(
        `  ${i + 1}. ${humanizePath(p.name)} — ${p.count.toLocaleString("en-GB")} requests`,
      );
    });
  }
  if (n) {
    lines.push("");
    lines.push("Newsletter:");
    lines.push(
      `  Sends: ${n.sendsCount} | Recipients: ${n.recipientCount.toLocaleString("en-GB")} | Open rate: ${n.openRatePct === null ? "—" : `${n.openRatePct}%`} | Click rate: ${n.clickRatePct === null ? "—" : `${n.clickRatePct}%`}`,
    );
  }
  lines.push("");
  lines.push(`Full breakdown: ${dashboardUrl}`);
  lines.push("");
  lines.push("Reply to this email any time — comes straight to Ben.");
  return lines.join("\n");
}

// ---------- Helpers ----------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
