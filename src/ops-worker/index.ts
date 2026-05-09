// Cowork Ops Worker entry point.
//
// Bound to the Cloudflare Cron Trigger in wrangler-ops.jsonc. On
// every minute-tick, runs the §4.2 cron loop. Also exposes a
// trivial fetch handler for health checks (so `curl
// https://pandemonium-software-ops.<account>.workers.dev/` returns
// 200 — useful for `wrangler tail` and any future uptime monitoring).
//
// We use process.env (auto-populated on compatibility_date >=
// 2025-04-01 per src/lib/env.ts) so the same getServerEnv() works
// in both the customer-facing Worker and this ops Worker. No need
// to thread `env` bindings through the call chain manually.

import { getServerEnv } from "../lib/env";
import { runOpsTick } from "./tick";

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

const handler = {
  async scheduled(
    _event: CfScheduledEvent,
    _envBindings: unknown,
    ctx: CfExecutionContext,
  ): Promise<void> {
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
