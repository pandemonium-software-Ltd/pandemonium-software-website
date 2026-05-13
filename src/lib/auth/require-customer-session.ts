// Helper for /api/account/* and /api/onboarding/* routes — verify
// the customer's session cookie matches the token they're acting on.
//
// Defence-in-depth on top of the per-route token validation. The
// page-level middleware enforces session-token binding for HTML
// requests; the API endpoints those pages call were previously
// trusting the body token alone, which meant a leaked token (URL
// screenshot, support-ticket paste, browser history shared) gave
// an attacker full API access for that customer.
//
// Added 2026-05-13 — security audit M1.
//
// Usage:
//   const auth = await requireCustomerSession(request, token);
//   if (!auth.ok) return auth.response;
//   // ... continue with the route logic ...
//
// Returns:
//   { ok: true }                    — session valid, proceed
//   { ok: false, response: NextResponse } — caller should return as-is
//
// Failure modes:
//   - SESSION_SECRET unset on the deploy → 503 (fail closed)
//   - No cookie sent / malformed cookie → 401
//   - Cookie signed for a different token → 401
//   - Cookie expired → 401
//
// All non-success returns use the SAME generic error string so
// callers can't enumerate token-existence by 401 wording.

import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session";

const GENERIC_AUTH_ERROR =
  "Your session has expired or this request isn't authenticated. Please sign in again.";

export type RequireCustomerSessionResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Verify the request carries a valid `pf_session` cookie signed
 * for the given prospect token. Returns a discriminated union so
 * callers can short-circuit cleanly without throwing.
 */
export async function requireCustomerSession(
  request: Request,
  expectedToken: string,
): Promise<RequireCustomerSessionResult> {
  const env = getServerEnv();
  if (!env.SESSION_SECRET) {
    // Misconfigured deploy — fail closed. Same posture as the
    // middleware in src/middleware.ts.
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Sign-in is temporarily unavailable. Please contact support.",
        },
        { status: 503 },
      ),
    };
  }

  // Parse the Cookie header directly. We don't use next/headers'
  // cookies() helper because it requires a server-component or
  // route-handler context AND it pulls in a deeper Next.js
  // internal that increases the bundle slightly — the explicit
  // parse is faster + works identically in any runtime.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionValue = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  const session = await verifySession(
    sessionValue,
    env.SESSION_SECRET,
    expectedToken,
  );
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: GENERIC_AUTH_ERROR },
        { status: 401 },
      ),
    };
  }
  return { ok: true };
}

/** Tiny cookie-header parser — extracts the value of one named
 *  cookie. Doesn't decode URL-escapes (our cookie value is a
 *  base64url JWT — no escaped characters). Case-sensitive name. */
function readCookie(header: string, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(";");
  for (const p of parts) {
    const trimmed = p.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq);
    if (k === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
}
