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
import type { D1Database } from "../lib/d1-analytics";

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
 *  matches wrangler-ops.jsonc's d1_databases[].binding. */
type CfEnvBindings = {
  pandemonium_analytics?: D1Database;
};

const ANALYTICS_CRON = "0 2 * * *";
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
    // waitUntil keeps the Worker alive until the tick promise
    // resolves. Without it, Workers may suspend the cron handler
    // as soon as scheduled() returns synchronously.
    ctx.waitUntil(runOpsTick(env));
  },

  async fetch(_request: Request): Promise<Response> {
    return new Response("Cowork Ops Worker — ok", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },
};

export default handler;
