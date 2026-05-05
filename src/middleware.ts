// HTTP Basic Auth gate for /admin/*.
//
// Browser shows the native password prompt — no custom login UI needed.
// Username is fixed ("ben"); password comes from the ADMIN_PASSWORD
// secret. Credentials are checked on every request, which is fine
// because /admin is accessed rarely.
//
// Note: Basic Auth sends credentials on every request, base64-encoded
// (not encrypted at the auth layer). Cloudflare's TLS keeps them
// secure in transit. For a more sophisticated session model, switch
// to a cookie-based scheme in Stage 3.

import { NextResponse, type NextRequest } from "next/server";

const REALM = "Pandemonium Admin";
const ADMIN_USER = "ben";

function unauthorised(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth) return unauthorised();

  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorised();

  let user = "";
  let pass = "";
  try {
    const decoded = atob(encoded);
    const colonIdx = decoded.indexOf(":");
    user = decoded.slice(0, colonIdx);
    pass = decoded.slice(colonIdx + 1);
  } catch {
    return unauthorised();
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    // Misconfigured server — fail closed.
    return new Response(
      "Admin not configured. Set ADMIN_PASSWORD on the server.",
      { status: 503 },
    );
  }

  // Constant-time comparison to avoid timing attacks. Workers' atob
  // is sync, so this is the only place a side-channel could leak.
  if (user !== ADMIN_USER || !timingSafeEqual(pass, expected)) {
    return unauthorised();
  }

  return NextResponse.next();
}

function timingSafeEqual(a: string, b: string): boolean {
  // Equal-length comparison without short-circuit. Pad to max length so
  // the loop runs the same number of iterations regardless of inputs.
  const maxLen = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= ca ^ cb;
  }
  return mismatch === 0;
}

// Match /admin and everything under it. /api/* stays public — those
// routes implement their own auth (token in body, etc).
export const config = {
  matcher: ["/admin/:path*", "/admin"],
};
