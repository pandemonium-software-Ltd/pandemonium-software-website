// Access gate for customer-site deploys.
//
// Two modes, both controlled by Worker env vars set via
// `wrangler deploy --var`:
//
//   COMING_SOON=true (+ PREVIEW_ACCESS_TOKEN)
//     Pre-launch gate. All live deploys before the customer's go-live
//     date set this. Public visitors see a branded "Coming Soon" page.
//     The customer (and operator) can bypass via `?pa=<token>` or the
//     `pf_preview_access` cookie — this is threaded into email links
//     and the Hub iframe so they see the real site during onboarding.
//
//   PREVIEW_ACCESS_TOKEN only (no COMING_SOON)
//     Post-commit change-request preview gate (C5.7). Same token
//     check, but unauthenticated visitors see "Preview locked" (the
//     internal wording — this mode is never publicly visible on the
//     customer's domain, only on workers.dev preview URLs).
//
//   Neither set → live site, no gate. The finalLaunch build omits
//   both vars, making the site fully public.

import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "pf_preview_access";
const COOKIE_MAX_AGE_SECONDS = 60 * 60; // 1 hour
const QUERY_PARAM = "pa";

export function middleware(req: NextRequest) {
  const comingSoon = process.env.COMING_SOON;
  const expected = process.env.PREVIEW_ACCESS_TOKEN;

  if (!comingSoon && !expected) return NextResponse.next();

  const url = req.nextUrl;
  const queryToken = url.searchParams.get(QUERY_PARAM);
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;

  // First hit: query param matches → set cookie + redirect to
  // the same URL with the param stripped.
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

  // Subsequent hits: cookie matches → pass through.
  if (expected && cookieToken && constantTimeEqual(cookieToken, expected)) {
    const res = NextResponse.next();
    addPreviewHeaders(res);
    return res;
  }

  // No valid access token — show the appropriate gate page.
  const gatePage = comingSoon ? "/coming-soon" : "/preview-locked";
  const gateUrl = url.clone();
  gateUrl.pathname = gatePage;
  gateUrl.search = "";
  const res = NextResponse.rewrite(gateUrl);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (!comingSoon) addPreviewHeaders(res);
  return res;
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
