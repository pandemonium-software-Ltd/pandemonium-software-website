// HTTP gate covering two distinct populations:
//
// 1. /admin/* + /api/admin/*  — Basic Auth for Ben (operator).
//    Browser shows the native password prompt — no custom login UI.
//    Username "ben", password from ADMIN_PASSWORD env. Stage 3
//    might switch this to a cookie scheme too; for now Basic Auth
//    is fine because /admin is accessed rarely.
//
// 2. /account/[token]/* + /onboarding/[token]/* + /intake/[token]/*
//    — per-customer session cookie (Stage 2C C5.7+). Customers get
//    a unique password emailed at Phase 2 acceptance. They log in
//    via /login/[token] and the marketing site sets a
//    httpOnly+Secure cookie `pf_session`. Cookie is verified
//    against the URL token on every page load.
//
// Token-mismatch (cookie says <bobs-token>, URL says <alices-token>)
// = unauthorised → redirect to /login/<the-url-token>?return=...
// so the browser's actual user sees the right login page.
//
// Excluded from customer auth: /login/[token]/* itself + the API
// endpoints under /api/* (which validate tokens in the body and
// don't share the cookie scheme — keeps the surface area small).

import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const REALM = "Pandemonium Admin";
const ADMIN_USER = "ben";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path prefixes that require a valid customer session cookie.
 *  All take a [token] segment immediately after the prefix. */
const CUSTOMER_GATED_PREFIXES = [
  "/account/",
  "/onboarding/",
  "/intake/",
];

function basicAuthUnauthorised(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---------- Operator (admin) ----------
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const failResp = adminBasicAuth(req);
    if (failResp) return failResp;
    return NextResponse.next();
  }

  // ---------- Customer (token-scoped session) ----------
  for (const prefix of CUSTOMER_GATED_PREFIXES) {
    if (!pathname.startsWith(prefix)) continue;
    // Extract the token segment. Path shape is /<prefix>/<token>/...
    const after = pathname.slice(prefix.length);
    const tokenSegment = after.split("/")[0] ?? "";
    if (!TOKEN_RE.test(tokenSegment)) {
      // Token missing or malformed in URL — let the page render its
      // own "link not valid" error. (Catching here would override
      // friendlier per-page error states.)
      return NextResponse.next();
    }

    const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      // Misconfigured deploy — fail closed. Tells the customer
      // exactly what to ask Ben to fix.
      return new Response(
        "Login is temporarily unavailable. Please contact ben@pandemoniumsoftware.com.",
        { status: 503, headers: { "Content-Type": "text/plain" } },
      );
    }

    const valid = await verifySession(cookie, secret, tokenSegment);
    if (valid) return NextResponse.next();

    // No valid session for this token — redirect to login.
    // Preserve the original path as ?return= so post-login lands
    // them where they were headed.
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = `/login/${tokenSegment}`;
    loginUrl.searchParams.set(
      "return",
      pathname + req.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

function adminBasicAuth(req: NextRequest): Response | undefined {
  const auth = req.headers.get("authorization");
  if (!auth) return basicAuthUnauthorised();
  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) return basicAuthUnauthorised();
  let user = "";
  let pass = "";
  try {
    const decoded = atob(encoded);
    const colonIdx = decoded.indexOf(":");
    user = decoded.slice(0, colonIdx);
    pass = decoded.slice(colonIdx + 1);
  } catch {
    return basicAuthUnauthorised();
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return new Response(
      "Admin not configured. Set ADMIN_PASSWORD on the server.",
      { status: 503 },
    );
  }
  if (user !== ADMIN_USER || !timingSafeEqual(pass, expected)) {
    return basicAuthUnauthorised();
  }
  return undefined; // means "let through" — caller `return NextResponse.next()`
}

function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= ca ^ cb;
  }
  return mismatch === 0;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/admin",
    "/api/admin/:path*",
    "/account/:token/:path*",
    "/account/:token",
    "/onboarding/:token/:path*",
    "/onboarding/:token",
    "/intake/:token/:path*",
    "/intake/:token",
  ],
};
