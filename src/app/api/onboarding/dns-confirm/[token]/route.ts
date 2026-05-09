// GET /api/onboarding/dns-confirm/[token] — customer says "I've
// updated my nameservers". Two callers:
//   1. The "I've updated my nameservers" button in the
//      domain-nameservers-pending email (a plain link, GET)
//   2. The "I've updated my nameservers" button on the Hub Step 2
//      UI (also a GET to keep both paths identical)
//
// Side effect: stamps `Customer Confirmed Nameservers At` on the
// prospect's Notion record. Idempotent — second click overwrites
// with the new timestamp (cheap; no harm).
//
// Authoritative source for the actual zone state remains
// Cloudflare; step2-domain still polls regardless. This signal
// just helps Cowork / Ben know the customer has done their part
// and is waiting for propagation.
//
// Response: tiny self-contained HTML "thanks" page that links
// back to the customer's onboarding hub. Token in the URL is
// the auth (same as everywhere else in /onboarding/*).

import { NextResponse } from "next/server";
import {
  getProspectByToken,
  markCustomerConfirmedNameservers,
} from "@/lib/notion-prospects";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://modu-forge.co.uk";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return new Response(errorPage("That link doesn't look right."), {
      status: 400,
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return new Response(errorPage("Link not found."), {
      status: 404,
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }

  try {
    await markCustomerConfirmedNameservers(prospect.pageId);
  } catch (e) {
    console.error(
      `[api/onboarding/dns-confirm] markCustomerConfirmedNameservers failed for ${prospect.pageId}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return new Response(
      errorPage(
        "I couldn't record your confirmation just now — please try again, or reply to my email and I'll handle it.",
      ),
      {
        status: 500,
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      },
    );
  }

  return new Response(successPage(token), {
    status: 200,
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}

// Other methods → 405. POST is intentionally not supported — the
// email button is a GET (links in emails can only be GETs without
// a form), and the Hub button uses the same endpoint for parity.
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } },
  );
}

// ---------- Tiny self-contained HTML responses ----------

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 600px; margin: 4rem auto; padding: 2rem; text-align: center; color: #1e1b4b; line-height: 1.6; background: #fdfcf9; }
  h1 { font-size: 2rem; margin: 0 0 0.5rem; font-family: Georgia, serif; font-weight: 600; }
  .blurb { color: #64748b; font-size: 1.1rem; }
  .btn { display: inline-block; margin-top: 2rem; padding: 14px 28px; background: #0f1d30; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
  .footer { font-size: 0.85rem; margin-top: 3rem; color: #94a3b8; }
</style>
</head>
<body>${bodyHtml}<p class="footer">ModuForge by Pandamonium Software</p></body>
</html>`;
}

function successPage(token: string): string {
  return shell(
    "Thanks — confirmation received",
    `<h1>Got it ✓</h1>
<p class="blurb">Thanks for letting me know. I'll check Cloudflare sooner — your domain usually goes live within an hour or two of you updating the nameservers, sometimes longer for fussier registrars.</p>
<p class="blurb">You'll get an email from me as soon as it's verified.</p>
<a href="${SITE_URL}/onboarding/${escapeHtml(token)}" class="btn">Back to your onboarding hub</a>`,
  );
}

function errorPage(message: string): string {
  return shell(
    "Hmm.",
    `<h1>Hmm.</h1>
<p class="blurb">${escapeHtml(message)}</p>
<a href="mailto:pandamoniumsoftwareltd@gmail.com" class="btn">Email me directly</a>`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
