// Access gate for customer-site deploys.
//
// Two modes, both controlled by Worker env vars set via
// `wrangler deploy --var`:
//
//   COMING_SOON=true (+ PREVIEW_ACCESS_TOKEN)
//     Pre-launch gate. Public visitors see a branded "Coming Soon"
//     page returned directly from the middleware (no layout wrap).
//     Customer bypasses via `?pa=<token>` or `pf_preview_access`
//     cookie.
//
//   PREVIEW_ACCESS_TOKEN only (no COMING_SOON)
//     Post-commit preview gate (C5.7). Rewrites to /preview-locked.
//
//   Neither set → live site, no gate.

import { NextResponse, type NextRequest } from "next/server";
import { SITE_DATA } from "@/lib/site-data";

const COOKIE_NAME = "pf_preview_access";
const COOKIE_MAX_AGE_SECONDS = 60 * 60;
const QUERY_PARAM = "pa";

export function middleware(req: NextRequest) {
  const comingSoon = process.env.COMING_SOON;
  const expected = process.env.PREVIEW_ACCESS_TOKEN;

  if (!comingSoon && !expected) return NextResponse.next();

  const url = req.nextUrl;
  const queryToken = url.searchParams.get(QUERY_PARAM);
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;

  if (expected && queryToken && constantTimeEqual(queryToken, expected)) {
    const clean = url.clone();
    clean.searchParams.delete(QUERY_PARAM);
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE_NAME, expected, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  }

  if (expected && cookieToken && constantTimeEqual(cookieToken, expected)) {
    const res = NextResponse.next();
    addPreviewHeaders(res);
    return res;
  }

  // Coming-soon: return self-contained HTML directly (no layout).
  if (comingSoon) {
    return new NextResponse(comingSoonHtml(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "no-store",
      },
    });
  }

  // Preview-locked: rewrite to the Next.js page.
  const lockedUrl = url.clone();
  lockedUrl.pathname = "/preview-locked";
  lockedUrl.search = "";
  const res = NextResponse.rewrite(lockedUrl);
  addPreviewHeaders(res);
  return res;
}

function comingSoonHtml(): string {
  const name = escapeHtml(SITE_DATA.business.name);
  const logoUrl = SITE_DATA.brandAssets.logoUrl;
  const primary = SITE_DATA.colors.primary;

  const logoTag = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" style="width:80px;height:80px;object-fit:contain;border-radius:0.75rem;margin:0 auto 1.5rem;display:block">`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${name} — Coming Soon</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fafaf9;color:#1f2937;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
    main{max-width:28rem;text-align:center}
    h1{font-size:1.75rem;font-weight:700;letter-spacing:-0.02em;margin-bottom:0.75rem}
    .divider{width:3rem;height:3px;background:${primary};border-radius:2px;margin:0 auto 1.25rem}
    p{color:#6b7280;font-size:1.05rem;line-height:1.6}
  </style>
</head>
<body>
  <main>
    ${logoTag}
    <h1>${name}</h1>
    <div class="divider"></div>
    <p>Our new website is launching soon.</p>
  </main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function addPreviewHeaders(res: NextResponse): void {
  res.headers.set(
    "Content-Security-Policy",
    "frame-ancestors https://modu-forge.co.uk https://*.modu-forge.co.uk",
  );
  res.headers.set(
    "X-Frame-Options",
    "ALLOW-FROM https://modu-forge.co.uk",
  );
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const config = {
  matcher: ["/((?!_next/|favicon|preview-locked|coming-soon).*)"],
};
