// POST /api/internal/resend-webhook — receiver for Resend's
// email-event callbacks (delivered / opened / clicked / bounced /
// complained / unsubscribed). Resend signs every webhook using
// Svix's format; we verify with Web Crypto (no Svix package
// needed — keeps the Worker bundle small).
//
// Event lookup is zero-DB: every newsletter we send tags each
// Resend email with token + send_id (see /api/account/newsletter
// route). Tags travel through to webhook events, so we can write
// the right (token, send_id, resend_email_id, event_type) row
// straight into D1 without scanning Notion.
//
// Idempotent: the PK on newsletter_events is
// (resend_email_id, event_type), so re-deliveries of the same
// event collapse to one row. Resend retries failed webhooks +
// fires opens repeatedly; both are safe to replay.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerEnv } from "@/lib/env";
import type { D1Database } from "@/lib/d1-analytics";

export const runtime = "nodejs";

// Replay-window guard: Svix-style signatures include a timestamp.
// Reject events older than this — protects against an attacker
// who somehow captured an old signed payload trying to replay it.
const MAX_AGE_SECONDS = 300; // 5 minutes

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.RESEND_WEBHOOK_SECRET) {
    console.error(
      "[resend-webhook] RESEND_WEBHOOK_SECRET not set — refusing event",
    );
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 503 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers." },
      { status: 400 },
    );
  }

  // Timestamp window check.
  const now = Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_AGE_SECONDS) {
    return NextResponse.json(
      { error: "Timestamp outside replay window." },
      { status: 400 },
    );
  }

  // Read raw body for signature verification — must be the exact
  // bytes Resend signed, BEFORE JSON parsing or any transformation.
  const rawBody = await request.text();
  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;

  const ok = await verifySvixSignature(
    env.RESEND_WEBHOOK_SECRET,
    signedPayload,
    svixSignature,
  );
  if (!ok) {
    console.error(
      `[resend-webhook] signature verification failed for svix-id=${svixId}`,
    );
    return NextResponse.json(
      { error: "Bad signature." },
      { status: 401 },
    );
  }

  // Parse the body now that we've authenticated it.
  let payload: ResendEvent;
  try {
    payload = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON." },
      { status: 400 },
    );
  }

  const eventType = mapEventType(payload.type);
  if (!eventType) {
    // Unknown event — log + 200 so Resend doesn't retry forever.
    console.warn(`[resend-webhook] unknown event type: ${payload.type}`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Resend's payload shape (per docs):
  //   { type, created_at, data: { email_id, tags?, ... } }
  // Tags arrive as an array of { name, value } pairs.
  const data = payload.data ?? {};
  const emailId = data.email_id;
  if (!emailId) {
    console.warn("[resend-webhook] no email_id on payload");
    return NextResponse.json({ ok: true, ignored: true });
  }
  const tagMap = Object.fromEntries(
    (data.tags ?? []).map((t) => [t.name, t.value]),
  );
  const token = tagMap.token;
  const sendId = tagMap.send_id;
  if (!token || !sendId) {
    // Could be a non-newsletter send (transactional emails Resend
    // also fires events for) — silently ignore.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const cfCtx = getCloudflareContext();
  const cfEnv = cfCtx.env as Record<string, unknown>;
  const db = cfEnv.pandemonium_analytics as D1Database | undefined;
  if (!db) {
    console.error(
      "[resend-webhook] pandemonium_analytics D1 binding missing",
    );
    return NextResponse.json(
      { error: "Storage unavailable." },
      { status: 500 },
    );
  }

  try {
    await db
      .prepare(
        `INSERT OR REPLACE INTO newsletter_events
           (resend_email_id, event_type, token, send_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        emailId,
        eventType,
        token,
        sendId,
        payload.created_at ?? new Date().toISOString(),
      )
      .run();
  } catch (e) {
    console.error(
      `[resend-webhook] insert failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json(
      { error: "Insert failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

// ---------- Helpers ----------

type ResendEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    tags?: Array<{ name: string; value: string }>;
  };
};

/** Map Resend's event-type string to our normalised set. Anything
 *  unrecognised returns null and gets ignored (200 OK so Resend
 *  doesn't retry). */
function mapEventType(t: string): string | null {
  switch (t) {
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.clicked":
      return "clicked";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.delivery_delayed":
      return null; // not worth tracking — transient
    case "email.sent":
      return null; // already known from the send route
    default:
      return null;
  }
}

/** Verify a Svix-format signature. Format: a header value like
 *    "v1,base64..."  OR  "v1,base64... v1,base64..."
 *  (whitespace-separated for key rotation). We accept any of them
 *  as long as one HMAC matches. Secret is base64-encoded after
 *  the "whsec_" prefix. */
async function verifySvixSignature(
  secret: string,
  signedPayload: string,
  header: string,
): Promise<boolean> {
  if (!secret.startsWith("whsec_")) {
    console.error(
      "[resend-webhook] secret missing whsec_ prefix — wrong value?",
    );
    return false;
  }
  const secretBytes = base64Decode(secret.slice("whsec_".length));
  if (!secretBytes) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes.buffer.slice(
      secretBytes.byteOffset,
      secretBytes.byteOffset + secretBytes.byteLength,
    ) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const computed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const computedB64 = base64Encode(new Uint8Array(computed));

  // Header can contain multiple space-separated signatures (key
  // rotation). Any match wins.
  for (const part of header.split(" ")) {
    const [, sig] = part.split(",", 2);
    if (sig && timingSafeEqual(sig, computedB64)) return true;
  }
  return false;
}

function base64Decode(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function base64Encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Constant-time string compare. Returns false on length mismatch
 *  immediately (length is not secret). Otherwise XORs every byte
 *  pair so timing leaks at most one bit per comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
