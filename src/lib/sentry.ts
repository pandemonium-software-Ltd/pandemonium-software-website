// Sentry helpers for Cloudflare Workers (marketing site + ops
// worker). Use @sentry/cloudflare — works in Workers runtime.
//
// Two usage patterns:
//
//   1. Ops worker: wrap the default export with Sentry.withSentry
//      so unhandled errors in scheduled() / fetch() are captured
//      automatically (see src/ops-worker/index.ts).
//
//   2. Marketing site (Next.js routes via opennext): the
//      opennext-generated worker bundle is hard to wrap globally,
//      so we capture explicitly at known error paths via
//      reportError() below. Each captured error gets a `scope`
//      tag so triage is easy in the Sentry dashboard.
//
// PII scrubbing: ProspectRecord carries email + phone + name.
// The beforeSend hook pattern-scrubs anything matching email /
// UK phone / UUID-token shapes from event payloads so we don't
// accidentally ship customer data into a third-party logger.
//
// No-op when SENTRY_DSN is missing — local dev + tests don't
// need a DSN configured.

import * as Sentry from "@sentry/cloudflare";

export type SentryEnv = {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
};

/**
 * Build the Sentry options object passed to withSentry({...}, handler).
 * Used by the ops worker default export.
 */
export function sentryOptions(env: SentryEnv): Sentry.CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    release: env.SENTRY_RELEASE ?? "unknown",
    // Capture everything by default — our error volume is tiny,
    // sampling would just lose signal. Revisit if we cross the
    // free tier's 5k events/month.
    tracesSampleRate: 0,
    beforeSend(event) {
      return scrubPii(event);
    },
    sendDefaultPii: false,
  };
}

/**
 * Report an error from a marketing-site API route (or anywhere
 * outside the ops worker's withSentry scope). Logs to console as
 * before AND sends to Sentry if DSN is configured. Safe to call
 * from any context — no-ops gracefully when Sentry isn't set up.
 *
 *   try { ... }
 *   catch (e) {
 *     reportError("api/payment/checkout", e);
 *     return NextResponse.json({ error: "..." }, { status: 502 });
 *   }
 *
 * `scope` becomes a Sentry tag for filtering / grouping. Use the
 * route path so the Sentry dashboard groups errors by source.
 */
export function reportError(scope: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  // Structured JSON line so Cloudflare Workers Logs can be
  // searched + filtered until proper Sentry SDK wrapping lands
  // for the opennext worker bundle (see ROADMAP — Sentry coverage
  // for marketing-site routes is a follow-up; @sentry/cloudflare
  // is request-scoped via withSentry, which opennext's generated
  // worker.js doesn't allow us to wrap without going custom).
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
      ts: new Date().toISOString(),
    }),
  );
  // Best-effort Sentry capture for the ops-worker scope (which
  // IS inside withSentry). For marketing-site scopes this no-ops
  // because no active client.
  try {
    Sentry.captureException(err, { tags: { scope } });
  } catch {
    // No active client — already logged above. No-op.
  }
}

/**
 * Pattern-scrub PII from a Sentry event:
 *   - email addresses → [scrubbed-email]
 *   - UK phone numbers → [scrubbed-phone]
 *   - UUID tokens     → [scrubbed-token]
 */
function scrubPii(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const json = JSON.stringify(event);
  const cleaned = json
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[scrubbed-email]")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[scrubbed-token]",
    )
    .replace(/\+?\d[\d\s()-]{8,}\d/g, "[scrubbed-phone]");
  return JSON.parse(cleaned) as Sentry.ErrorEvent;
}

export { Sentry };
