// POST /api/login/[token]/reset — generate a new password,
// store the new hash, email the customer the plaintext.
//
// Rate-limited generously: 5 resets per token per hour. Customer
// might genuinely lose the email a few times; resetting is cheap
// + idempotent so we tolerate it.
//
// ALWAYS returns 200 even on token-not-found — never leak whether
// a token exists. The customer who didn't get an email knows
// something's wrong from the absence; the attacker who guessed a
// token learns nothing.
//
// The new-password email goes via the standard branded wrapper +
// the new `password-reset` template.

import { NextResponse } from "next/server";
import {
  getProspectByToken,
  setProspectPassword,
} from "@/lib/notion-prospects";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RateState = { tries: number; until: number };
const RATE_BUCKET = new Map<string, RateState>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    // Still 200 — don't leak invalid token shape via timing.
    return NextResponse.json({ ok: true });
  }

  const now = Date.now();
  const state = RATE_BUCKET.get(token);
  if (state && state.until > now && state.tries >= RATE_MAX) {
    return NextResponse.json(
      {
        error:
          "Too many reset requests. Try again in an hour, or email me directly.",
      },
      { status: 429 },
    );
  }

  const env = getServerEnv();
  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    bumpRate(token);
    return NextResponse.json({ ok: true });
  }

  // Generate + hash + persist + email — fail-soft on email so a
  // Resend hiccup doesn't leave the customer with a password they
  // never received (if email fails, do NOT update the hash either).
  const plain = generatePassword();
  let hash: string;
  try {
    hash = await hashPassword(plain);
  } catch (e) {
    console.error(
      `[api/login/reset] hash failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json({ ok: true });
  }

  // Email FIRST — if Resend chokes, leave the OLD password intact.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  try {
    await sendCustomerEmail(env, prospect.email, "password-reset", {
      customerName: firstName(prospect.name),
      newPassword: plain,
      loginUrl: `${baseUrl}/login/${token}`,
    });
  } catch (e) {
    console.error(
      `[api/login/reset] email failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json(
      {
        error:
          "Couldn't send the reset email. Try again in a minute, or email me directly.",
      },
      { status: 500 },
    );
  }

  try {
    await setProspectPassword(prospect.pageId, hash);
  } catch (e) {
    console.error(
      `[api/login/reset] hash persist failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    // Customer already has the email — best to surface a soft
    // warning that re-sending might be needed. We could try to
    // notify them, but that adds another failure path. Log loudly
    // for the operator instead.
  }

  bumpRate(token);
  return NextResponse.json({ ok: true });
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

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}
