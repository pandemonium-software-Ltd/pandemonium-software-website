// Per-customer password generation + verification.
//
// Stage 2C C5.7+ — gates /account/[token], /onboarding/[token],
// /intake/[token]. Each customer gets a single password emailed
// at Phase 2 acceptance time.
//
// Algorithm: PBKDF2 with SHA-256, 100k iterations. Pure Web
// Crypto — works in both Cloudflare Workers and Node 20+ without
// native bindings. Tradeoff: slower than bcrypt at the same cost
// factor, but available everywhere our code runs.
//
// Stored format (single string in Notion rich_text):
//   pbkdf2:<iters>:<salt-base64>:<hash-base64>
// Both fields base64-url-safe to avoid Notion's rich-text quirks.
//
// Failure mode: verifyPassword returns false on any malformed
// stored hash. Stays fail-closed so a corrupted record can't
// be bypassed.

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;
const FORMAT_PREFIX = "pbkdf2";

/** Visible character set for generated passwords. Excludes
 *  ambiguous characters (0/O, 1/l/I) so customers can read it
 *  off an email and type it without confusion. 50 chars at 10
 *  positions = ~56 bits of entropy, fine for a customer
 *  account that's also rate-limited at the login endpoint. */
const SAFE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * Generate a random 10-char password using the safe character
 * set. Cryptographically random via Web Crypto.
 */
export function generatePassword(length = 10): string {
  // Rejection sampling to eliminate modular bias. For SAFE_CHARS.length=55,
  // any byte >= 220 (Math.floor(256/55)*55) would bias toward early chars.
  const limit = Math.floor(256 / SAFE_CHARS.length) * SAFE_CHARS.length;
  let out = "";
  while (out.length < length) {
    // Request extra bytes to compensate for expected rejections (~14%).
    const needed = length - out.length;
    const arr = new Uint8Array(needed + Math.ceil(needed * 0.2) + 2);
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length && out.length < length; i++) {
      if (arr[i]! < limit) {
        out += SAFE_CHARS[arr[i]! % SAFE_CHARS.length];
      }
    }
  }
  return out;
}

/**
 * Derive a stored hash from a plain-text password. Returns the
 * single-string format ready for Notion storage. New random
 * salt per call — never reuse.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(plain, salt, ITERATIONS, KEY_LENGTH_BITS);
  return `${FORMAT_PREFIX}:${ITERATIONS}:${b64url(salt)}:${b64url(hash)}`;
}

/**
 * Verify a plain-text password against a stored hash. Returns
 * false on any mismatch OR malformed stored value. Constant-time
 * compare on the derived bytes to dodge timing attacks.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4) return false;
  const [prefix, itersStr, saltStr, hashStr] = parts;
  if (prefix !== FORMAT_PREFIX) return false;
  const iters = Number(itersStr);
  if (!Number.isFinite(iters) || iters < 1000 || iters > 10_000_000) {
    return false;
  }
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = b64urlDecode(saltStr!);
    expected = b64urlDecode(hashStr!);
  } catch {
    return false;
  }
  const derived = await pbkdf2(plain, salt, iters, expected.length * 8);
  if (derived.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < derived.length; i++) {
    mismatch |= derived[i]! ^ expected[i]!;
  }
  return mismatch === 0;
}

// ---------- Internals ----------

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bits: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const buf = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // Cast: Uint8Array<ArrayBufferLike> isn't assignable to
      // BufferSource in stricter TS lib defs because the buffer
      // could (in principle) be SharedArrayBuffer. We always
      // construct salt with `new Uint8Array(N)` so the buffer is
      // an ArrayBuffer; this cast is safe.
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    key,
    bits,
  );
  return new Uint8Array(buf);
}

function b64url(bytes: Uint8Array): string {
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
