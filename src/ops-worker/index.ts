// Cowork Ops Worker entry point.
//
// Bound to two Cloudflare Cron Triggers in wrangler-ops.jsonc:
//   - "* * * * *"   minutely  → onboarding/build dispatcher (runOpsTick)
//   - "0 2 * * *"   daily 02Z → analytics snapshot (runAnalyticsTick)
//
// We dispatch on event.cron so both schedules share one Worker
// (lower deploy/config overhead than running two Workers).
//
// Also exposes a trivial fetch handler for health checks (so `curl
// https://pandemonium-software-ops.<account>.workers.dev/` returns
// 200 — useful for `wrangler tail` and any future uptime monitoring).
//
// We use process.env (auto-populated on compatibility_date >=
// 2025-04-01 per src/lib/env.ts) so the same getServerEnv() works
// in both the customer-facing Worker and this ops Worker. The D1
// binding is the one exception — those don't appear on process.env,
// they come in via the second arg to the scheduled handler.

import { getServerEnv } from "../lib/env";
import { runOpsTick } from "./tick";
import { runAnalyticsTick } from "./analytics-tick";
import { runMonthlyDigestTick } from "./monthly-digest-tick";
import { runGbpReviewsTick } from "./gbp-reviews-tick";
import { runGdprScrubTick } from "./gdpr-scrub-tick";
import { runStripeApplierTick } from "./stripe-applier-tick";
import type { D1Database } from "../lib/d1-analytics";
import * as Sentry from "@sentry/cloudflare";
import { sentryOptions } from "../lib/sentry";

// Minimal Cloudflare Worker types (we don't pull in @cloudflare/workers-types
// since the rest of the project doesn't either; these are the shapes
// we actually use).
type CfScheduledEvent = {
  cron: string;
  scheduledTime: number;
  type: "scheduled";
};

type CfExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

/** Subset of the env bindings object the runtime passes to scheduled().
 *  D1 bindings live here (not on process.env). The binding name
 *  matches wrangler-ops.jsonc's d1_databases[].binding. Also
 *  includes the Sentry secrets so withSentry can pick them up
 *  from the same env arg. */
type CfEnvBindings = {
  pandemonium_analytics?: D1Database;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
};

const ANALYTICS_CRON = "0 2 * * *";
const GBP_REVIEWS_CRON = "30 2 * * *";
// Daily 03:00 UTC sweep dispatches BOTH gdpr-scrub AND
// stripe-applier — co-located because Cloudflare caps Worker
// crons at 5 per script and both jobs scan listAllProspects.
// Run order: scrub first (cancels-finalised), then applier
// (so a same-day cancel + pending change resolve cleanly).
const DAILY_SWEEP_CRON = "0 3 * * *";
const MONTHLY_DIGEST_CRON = "0 8 1 * *";

const handler = {
  async scheduled(
    event: CfScheduledEvent,
    envBindings: CfEnvBindings,
    ctx: CfExecutionContext,
  ): Promise<void> {
    // Dispatch on which cron fired — same Worker, three schedules.
    if (event.cron === ANALYTICS_CRON) {
      const db = envBindings.pandemonium_analytics;
      if (!db) {
        console.error(
          "[ops] analytics cron fired but pandemonium_analytics D1 binding is missing",
        );
        return;
      }
      ctx.waitUntil(runAnalyticsTick({ db }));
      return;
    }
    if (event.cron === GBP_REVIEWS_CRON) {
      const db = envBindings.pandemonium_analytics;
      if (!db) {
        console.error(
          "[ops] gbp reviews cron fired but pandemonium_analytics D1 binding is missing",
        );
        return;
      }
      ctx.waitUntil(runGbpReviewsTick({ db }));
      return;
    }
    if (event.cron === DAILY_SWEEP_CRON) {
      const db = envBindings.pandemonium_analytics;
      if (!db) {
        console.error(
          "[ops] daily sweep cron fired but pandemonium_analytics D1 binding is missing",
        );
        return;
      }
      // Run sequentially: scrub first (releases cancelled
      // prospects + retention housekeeping), then applier
      // (handles pending changes including any cancel-now
      // entries that just settled).
      ctx.waitUntil(
        (async () => {
          await runGdprScrubTick({ db });
          await runStripeApplierTick({});
        })(),
      );
      return;
    }
    if (event.cron === MONTHLY_DIGEST_CRON) {
      const db = envBindings.pandemonium_analytics;
      if (!db) {
        console.error(
          "[ops] monthly digest cron fired but pandemonium_analytics D1 binding is missing",
        );
        return;
      }
      ctx.waitUntil(runMonthlyDigestTick({ db }));
      return;
    }
    // Default = minutely onboarding/build tick.
    const env = getServerEnv();
    // Pass the D1 binding through to steps that need it (step3
    // seeds gbp_reviews on first GBP resolution; future steps may
    // share). Missing binding is fine — those steps handle it with
    // a skip.
    const db = envBindings.pandemonium_analytics;
    // waitUntil keeps the Worker alive until the tick promise
    // resolves. Without it, Workers may suspend the cron handler
    // as soon as scheduled() returns synchronously.
    ctx.waitUntil(runOpsTick(env, {}, { d1: db }));
  },

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // /test-sentry → emit a synthetic event so we can verify the
    // Sentry wiring end-to-end. Safe to leave in production —
    // anyone hitting this URL just spends one Sentry event from
    // the free-tier 5k/month quota.
    if (url.pathname === "/test-sentry") {
      Sentry.captureMessage("Test event from ops worker — smoke check", {
        level: "info",
      });
      return new Response("Sent test event to Sentry.\n", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Cowork Ops Worker — ok", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },
};

// Wrap with Sentry so unhandled exceptions in scheduled() and
// fetch() are captured automatically. withSentry expects an
// options factory taking the env arg so the DSN can be read
// from per-request bindings (vs hardcoded at module load).
export default Sentry.withSentry(
  (env: CfEnvBindings) =>
    sentryOptions({
      SENTRY_DSN: env.SENTRY_DSN,
      SENTRY_ENVIRONMENT: env.SENTRY_ENVIRONMENT,
      SENTRY_RELEASE: env.SENTRY_RELEASE,
    }),
  handler,
);
