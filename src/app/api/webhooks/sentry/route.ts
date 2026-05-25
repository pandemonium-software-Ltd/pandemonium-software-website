// POST /api/webhooks/sentry — receives Sentry alert webhooks
// from an Internal Integration set up in the Sentry dashboard.
//
// Sentry signs every payload with HMAC-SHA256(body, clientSecret)
// and puts the hex digest in the `Sentry-Hook-Signature` header.
// We verify before any D1 write.
//
// Payload shape (event_alert action — the most common):
//   {
//     "action": "triggered",
//     "data": {
//       "event": { ... },           // the actual error event
//       "triggered_rule": "..."     // which alert rule fired
//     },
//     "installation": { "uuid": "..." }
//   }
//
// We extract the issue metadata (id, title, level, project,
// permalink, count, timestamps) and UPSERT into sentry_alerts.
// Repeats bump count + last_seen, don't create new rows.
//
// 200 = received + processed. 400 = bad signature / shape.
// Sentry retries on 5xx but not 4xx, so we return 200 on
// "unknown action" to stop noise rather than retry loops.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerEnvOptional } from "@/lib/env";
import { upsertSentryAlert, type SentryAlertRow } from "@/lib/d1-sentry";
import type { D1Database } from "@/lib/d1-analytics";
import { reportError } from "@/lib/sentry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getServerEnvOptional();
  if (!env.SENTRY_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "SENTRY_WEBHOOK_SECRET not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const sig = request.headers.get("sentry-hook-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing Sentry-Hook-Signature header." },
      { status: 400 },
    );
  }

  const ok = await verifyHmac(rawBody, sig, env.SENTRY_WEBHOOK_SECRET);
  if (!ok) {
    return NextResponse.json(
      { error: "Signature verification failed." },
      { status: 400 },
    );
  }

  // D1 binding from the Cloudflare runtime context — same pattern
  // /admin/[token]/page.tsx + /api/admin/analytics/route.ts use.
  const cfCtx = getCloudflareContext();
  const cfEnv = (cfCtx?.env ?? {}) as {
    pandemonium_analytics?: D1Database;
  };
  const d1 = cfEnv.pandemonium_analytics;
  if (!d1) {
    return NextResponse.json(
      { error: "D1 binding missing on this worker." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Body wasn't valid JSON." },
      { status: 400 },
    );
  }

  try {
    const alert = extractAlert(payload);
    if (!alert) {
      // Not an issue alert — Sentry also sends comments, audit
      // log etc. via the same endpoint. 200 to stop retries.
      return NextResponse.json({ received: true, skipped: "not_issue_alert" });
    }
    await upsertSentryAlert(d1, alert);
    return NextResponse.json({ received: true, issue: alert.sentry_issue_id });
  } catch (e) {
    reportError("webhooks/sentry", e);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}

/** HMAC-SHA256 verification using Web Crypto (Workers-compatible). */
async function verifyHmac(
  body: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = bufferToHex(sig);
  return timingSafeEqualHex(expected, signatureHex);
}

function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Pull the fields we care about from Sentry's webhook payload.
 * Returns null for non-issue-alert actions (Sentry uses the same
 * endpoint for several event types — we only handle issue alerts).
 *
 * Defensive on every read — Sentry's payload schema is stable but
 * not strictly versioned.
 */
function extractAlert(
  payload: unknown,
): Omit<
  SentryAlertRow,
  "status" | "resolved_at" | "resolved_by" | "resolution_note" | "created_at" | "updated_at"
> | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  // Issue-alert payloads carry data.event + data.triggered_rule.
  // Issue lifecycle ("resolved", "ignored") come through "issue"
  // action — also useful but not handled today (operator resolves
  // locally via /admin button).
  const action = p.action;
  if (action !== "triggered" && action !== "created") return null;
  const data = (p.data ?? {}) as Record<string, unknown>;
  // Either data.event (alert) or data.issue (lifecycle)
  const event = (data.event ?? data.issue ?? {}) as Record<string, unknown>;
  if (!event || typeof event !== "object") return null;

  const issueId =
    typeof event.issue_id === "string"
      ? event.issue_id
      : typeof event.id === "string"
        ? event.id
        : null;
  if (!issueId) return null;

  const title =
    typeof event.title === "string"
      ? event.title
      : typeof event.message === "string"
        ? event.message
        : "(no title)";
  const level = typeof event.level === "string" ? event.level : "error";
  const environment =
    typeof event.environment === "string" ? event.environment : null;
  const project =
    (event.project ?? data.project ?? {}) as Record<string, unknown>;
  const projectSlug = typeof project.slug === "string" ? project.slug : null;
  const sentryUrl =
    typeof event.web_url === "string"
      ? event.web_url
      : typeof event.url === "string"
        ? event.url
        : "https://sentry.io/";
  const firstSeen =
    typeof event.firstSeen === "string"
      ? event.firstSeen
      : typeof event.first_seen === "string"
        ? event.first_seen
        : null;
  const lastSeen =
    typeof event.lastSeen === "string"
      ? event.lastSeen
      : typeof event.last_seen === "string"
        ? event.last_seen
        : new Date().toISOString();
  const count =
    typeof event.count === "number"
      ? event.count
      : typeof event.event_count === "number"
        ? event.event_count
        : 1;

  return {
    sentry_issue_id: issueId,
    title,
    level,
    environment,
    project_slug: projectSlug,
    sentry_url: sentryUrl,
    first_seen_at: firstSeen,
    last_seen_at: lastSeen,
    event_count: count,
  };
}
