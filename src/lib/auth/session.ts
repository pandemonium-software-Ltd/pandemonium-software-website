// Customer-side session cookie — HMAC-signed token for
// /account/[token], /onboarding/[token], /intake/[token].
//
// Format: a JWT-like string `header.payload.signature` where:
//   header    = b64url('{"alg":"HS256","typ":"JWT"}')
//   payload   = b64url JSON of { token, exp }
//   signature = b64url(HMAC-SHA256(header.payload, SESSION_SECRET))
//
// Standard JWT shape so existing tooling (jwt.io etc.) can decode
// the payload for debugging — no library dependency.
//
// Set as httpOnly cookie `pf_session` on login. Verified per
// request by the middleware. Token mismatch (cookie says
// "bobs-token", URL says "alices-token") = unauthorised.
//
// Failure mode: every verifier returns null on any error. The
// middleware treats null as "no valid session → redirect to login".
// Includes: malformed JWT, bad signature, expired exp, missing
// SESSION_SECRET (which would mean the deploy is misconfigured —
// fail closed).

const HEADER = b64urlString(
  new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
);

/** 7 days. Customers shouldn't need to re-login mid-onboarding. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Cookie name. Single cookie covers all routes for that customer
 *  — the cookie value carries the token, so a Bob session on
 *  /account/<bob>/* will not work on /account/<alice>/* (verify
 *  rejects token mismatch). */
export const SESSION_COOKIE_NAME = "__Host-pf_session";

export type SessionPayload = {
  /** Prospect token this session authenticates. */
  token: string;
  /** Unix seconds when the session expires. */
  exp: number;
};

/**
 * Sign a new session for the given prospect token. Returns the
 * full JWT-shaped string ready for the cookie value.
 */
export async function signSession(
  token: string,
  secret: string,
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64urlString(
    new TextEncoder().encode(JSON.stringify({ token, exp })),
  );
  const data = `${HEADER}.${payload}`;
  const sig = await hmacSha256(secret, data);
  return `${data}.${b64urlString(sig)}`;
}

/**
 * Verify a session cookie value against the expected token (the
 * one in the URL). Returns the payload on success, null on any
 * failure (bad signature, expired, malformed, token mismatch).
 */
export async function verifySession(
  jwt: string | undefined,
  secret: string,
  expectedToken: string,
): Promise<SessionPayload | null> {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 !== HEADER) return null;

  // Verify signature first — fail-closed before parsing payload.
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = await hmacSha256(secret, data);
  let actualSig: Uint8Array;
  try {
    actualSig = b64urlDecode(sigB64!);
  } catch {
    return null;
  }
  if (!constantTimeEqual(expectedSig, actualSig)) return null;

  // Parse payload only after sig check.
  let payload: SessionPayload;
  try {
    const decoded = b64urlDecode(payloadB64!);
    payload = JSON.parse(new TextDecoder().decode(decoded)) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.token !== "string" || typeof payload.exp !== "number") {
    return null;
  }
  // Expiry check.
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  // Token mismatch — cookie was set for someone else.
  if (payload.token !== expectedToken) return null;

  return payload;
}

/** Build a Set-Cookie value with sensible defaults. Used by the
 *  /api/login route + any other endpoint that mints a session. */
export function buildSessionCookie(value: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join("; ");
}

/** Build a Set-Cookie value that clears the session — used when
 *  the customer hits a logout endpoint. */
export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

// ---------- Internals ----------

async function hmacSha256(
  secret: string,
  data: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i]! ^ b[i]!;
  return mismatch === 0;
}

function b64urlString(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const decoded = atob(padded + padding);
  const out = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i);
  return out;
}
