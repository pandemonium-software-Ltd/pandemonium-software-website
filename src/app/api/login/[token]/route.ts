// POST /api/login/[token] — verify password, set session cookie.
//
// On success: 200 with { redirectTo } and a Set-Cookie header. The
// client hard-nav's so the new cookie takes effect immediately.
// On failure: 401 with a generic message — never leaks whether the
// token exists or whether the password is wrong vs missing
// (defence against enumeration).
//
// Brute-force protection is the per-prospect attempt rate limit
// inside the route. 10 attempts per 5 minutes per token is enough
// for a typo-prone customer + tight enough that guessing a 10-char
// password (~56 bits of entropy) is infeasible (~10 yrs at 10/5min
// for a top-of-the-list candidate, never mind for an arbitrary
// secret).
//
// Stored attempt counters: a tiny in-memory Map. Survives only
// while the Worker isolate is warm. Cold-restarts reset the
// counter — acceptable trade-off vs adding KV / D1 dependency
// for a feature we expect to fire <100 times/day total.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProspectByToken } from "@/lib/notion-prospects";
import { verifyPassword } from "@/lib/auth/password";
import {
  buildSessionCookie,
  signSession,
} from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  password: z.string().min(1).max(200),
  /** Optional return URL — only used if it starts with `/` and
   *  contains the token (defence against open-redirect). */
  returnTo: z.string().nullable().optional(),
});

// Rate-limit state (per Worker isolate). { tries: count, until: ms }
type RateState = { tries: number; until: number };
const RATE_BUCKET = new Map<string, RateState>();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 10;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return genericFail();
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request shape." },
      { status: 400 },
    );
  }
  const { password, returnTo } = parsed.data;

  // Rate limit BEFORE looking up the prospect — stops a brute-
  // force from generating a Notion query per attempt.
  const now = Date.now();
  const state = RATE_BUCKET.get(token);
  if (state && state.until > now && state.tries >= RATE_MAX) {
    const minsLeft = Math.ceil((state.until - now) / 60_000);
    return NextResponse.json(
      {
        error: `Too many sign-in attempts. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}, or use the "Forgot password" link.`,
      },
      { status: 429 },
    );
  }

  const env = getServerEnv();
  if (!env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "Sign in is temporarily unavailable. Please contact me." },
      { status: 503 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  // Verify even when prospect is null, against a dummy hash, so the
  // response time leaks no info about whether the token is valid.
  // PBKDF2 cost is the same; only the boolean differs.
  const targetHash =
    prospect?.passwordHash ??
    "pbkdf2:100000:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const ok = (await verifyPassword(password, targetHash)) && !!prospect;

  if (!ok) {
    bumpRate(token);
    return genericFail();
  }

  // Success — clear rate counter, sign cookie, return redirect.
  RATE_BUCKET.delete(token);
  const sessionJwt = await signSession(token, env.SESSION_SECRET);
  const safeReturn = isSafeReturnPath(returnTo, token);
  const redirectTo = safeReturn ?? `/account/${token}`;

  const headers = new Headers({
    "Content-Type": "application/json",
  });
  headers.append("Set-Cookie", buildSessionCookie(sessionJwt));
  return new Response(JSON.stringify({ redirectTo }), {
    status: 200,
    headers,
  });
}

function genericFail(): Response {
  return NextResponse.json(
    {
      error:
        "Wrong password. If you've forgotten it, use the link below to email yourself a new one.",
    },
    { status: 401 },
  );
}

function bumpRate(token: string): void {
  const now = Date.now();
  const cur = RATE_BUCKET.get(token);
  if (!cur || cur.until <= now) {
    RATE_BUCKET.set(token, { tries: 1, until: now + RATE_WINDOW_MS });
  } else {
    cur.tries += 1;
  }
}

/** Defence against open-redirect via the `returnTo` param. We only
 *  trust paths that begin with `/` AND contain the customer's token
 *  (so the redirect lands them inside their own account namespace). */
function isSafeReturnPath(
  v: string | null | undefined,
  token: string,
): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null; // protocol-relative
  if (!v.includes(token)) return null;
  return v;
}
