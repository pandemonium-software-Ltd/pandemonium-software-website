// Preview-access gate for customer-site previews (C5.7+).
//
// When this Worker version was uploaded as a PREVIEW (post-commit
// change-request preview, via `wrangler versions upload --var
// PREVIEW_ACCESS_TOKEN=<random>`), the Cloudflare runtime exposes
// `process.env.PREVIEW_ACCESS_TOKEN`. The middleware checks every
// request for either:
//   - `?pa=<token>` query (first hit from a marketing-site
//     iframe — set cookie, strip query, redirect to clean URL)
//   - `pf_preview_access` cookie (subsequent hits — pass through)
//
// LIVE deploys (the customer's actual site) don't pass --var, so
// PREVIEW_ACCESS_TOKEN is undefined and the middleware short-
// circuits with no extra latency. Live traffic = public access,
// as it should be.
//
// Defence: even with the access token, the Worker sets
// `Content-Security-Policy: frame-ancestors https://modu-forge.co.uk`
// so the preview can ONLY be embedded by the marketing site
// (no random forum or competitor wrapping it for analysis).
//
// X-Robots-Tag: noindex on every preview response so search
// engines don't index half-baked versions.

import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "pf_preview_access";
const COOKIE_MAX_AGE_SECONDS = 60 * 60; // 1 hour
const QUERY_PARAM = "pa";

export function middleware(req: NextRequest) {
  // Cloudflare's OpenNext runtime exposes Worker bindings on
  // process.env. If the var isn't set, this is a live deploy and
  // we pass through.
  const expected = process.env.PREVIEW_ACCESS_TOKEN;
  if (!expected) return NextResponse.next();

  const url = req.nextUrl;
  const queryToken = url.searchParams.get(QUERY_PARAM);
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;

  // First hit: query param matches → set cookie + redirect to
  // the same URL with the param stripped. Cleaner address bar +
  // the customer can refresh without re-passing the token.
  if (queryToken && constantTimeEqual(queryToken, expected)) {
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

  // Subsequent hits: cookie matches → pass through with the
  // preview-mode security headers attached.
  if (cookieToken && constantTimeEqual(cookieToken, expected)) {
    const res = NextResponse.next();
    addPreviewHeaders(res);
    return res;
  }

  // Neither matched — render the locked page (rewrite, not
  // redirect, so the URL the customer typed is preserved in the
  // address bar).
  const lockedUrl = url.clone();
  lockedUrl.pathname = "/preview-locked";
  lockedUrl.search = "";
  const res = NextResponse.rewrite(lockedUrl);
  addPreviewHeaders(res);
  return res;
}

/**
 * Add the security headers that should accompany every response
 * in preview mode. Browsers honour both — frame-ancestors is the
 * modern CSP-based ancestor restriction, X-Frame-Options is the
 * older fallback (some scrapers still respect only this).
 */
function addPreviewHeaders(res: NextResponse): void {
  res.headers.set(
    "Content-Security-Policy",
    "frame-ancestors https://modu-forge.co.uk https://*.modu-forge.co.uk",
  );
  // X-Frame-Options doesn't allow listing multiple domains; pick
  // the canonical one. modu-forge.co.uk fits.
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

// Match every page route — the gate applies site-wide. Skip
// Next.js internals (_next/*, favicon, etc.) so the gate doesn't
// block CSS / JS / image loads embedded by the page itself.
export const config = {
  matcher: ["/((?!_next/|favicon|preview-locked).*)"],
};
