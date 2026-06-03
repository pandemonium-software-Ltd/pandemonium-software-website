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
    // Pass through directly — don't redirect. In cross-site iframes
    // (Hub on modu-forge.co.uk embedding *.store), third-party cookies
    // are blocked by Safari ITP and Chrome, so the redirect+cookie
    // flow never works. Serving the page directly with ?pa= in the
    // URL always works because the iframe src carries the token.
    // Also set the cookie as a best-effort fallback for internal
    // navigation within the iframe (works in browsers that still
    // allow third-party cookies).
    const res = NextResponse.next();
    addPreviewHeaders(res);
    res.cookies.set(COOKIE_NAME, expected, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
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

  // Same-origin navigation bypass: if the Referer is from this site,
  // the visitor already passed the gate (via ?pa= or cookie) and is
  // now clicking around. Let them through — this covers Next.js RSC
  // navigations and <Link> clicks that the client-side script can't
  // intercept. The coming-soon gate is a UX veil, not a security
  // boundary, so trusting same-origin Referer is acceptable.
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (refOrigin === url.origin) {
        const res = NextResponse.next();
        addPreviewHeaders(res);
        return res;
      }
    } catch {}
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
  const secondary = SITE_DATA.colors.secondary;

  const logoTag = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="">`
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
    @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:linear-gradient(160deg,#fafaf9 0%,${secondary}22 50%,${primary}15 100%);color:#1f2937;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;overflow:hidden}
    .wrapper{text-align:center;animation:fadeUp .8s ease-out both}
    .logo{width:120px;height:120px;object-fit:contain;border-radius:1rem;margin:0 auto 2rem;display:block;animation:fadeUp .8s ease-out .15s both;filter:drop-shadow(0 8px 24px ${primary}30)}
    h1{font-size:clamp(2.25rem,5vw,3.5rem);font-weight:800;letter-spacing:-0.03em;line-height:1.1;margin-bottom:1rem;animation:fadeUp .8s ease-out .3s both}
    .divider{width:5rem;height:4px;background:linear-gradient(90deg,${primary},${secondary});border-radius:4px;margin:0 auto 1.5rem;animation:fadeUp .8s ease-out .45s both;background-size:200% 100%;animation:fadeUp .8s ease-out .45s both,shimmer 3s ease-in-out 1.5s infinite}
    .tagline{color:#6b7280;font-size:clamp(1.1rem,2.5vw,1.35rem);line-height:1.6;max-width:24rem;margin:0 auto 2.5rem;animation:fadeUp .8s ease-out .6s both}
    .dots{display:flex;gap:.5rem;justify-content:center;animation:fadeUp .8s ease-out .75s both}
    .dots span{width:8px;height:8px;border-radius:50%;background:${primary};animation:pulse 1.5s ease-in-out infinite}
    .dots span:nth-child(2){animation-delay:.3s}
    .dots span:nth-child(3){animation-delay:.6s}
  </style>
</head>
<body>
  <div class="wrapper">
    ${logoTag}
    <h1>${name}</h1>
    <div class="divider"></div>
    <p class="tagline">We're building something great. Our new website is launching soon.</p>
    <div class="dots"><span></span><span></span><span></span></div>
  </div>
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
  res.headers.set("X-Frame-Options", "DENY");
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
