// Cron tick — invoked once a minute by the Cloudflare Cron Trigger
// configured in wrangler-ops.jsonc.
//
// Per §4.2 the tick:
//   1. Queries Notion for prospects with Status ∈ {Onboarding
//      Started, Onboarding Complete}
//   2. For each, dispatches the per-step automations (dispatch.ts)
//   3. Audit / Exception writes happen inside the dispatcher; this
//      handler just owns the iteration + tick-level logging
//
// Tick cost: ~50-100ms when there are no prospects with work, scales
// linearly with prospect count + step work. At 1-20 customers we're
// well inside the 30-second Workers cron budget.

import { listProspectsNeedingOps } from "../lib/notion-prospects";
import type { ServerEnv } from "../lib/env";
import { dispatchProspect, type DispatchDeps } from "./dispatch";
import type { StepCtx } from "./types";
import { resetEmailCounter } from "./notify";
import { resetDispatchCounter } from "../lib/github";

/** M-08: Hard cap on prospects processed per tick. Prevents a
 *  sudden spike in onboarding prospects from causing a single
 *  tick to exceed the Workers cron budget or generate runaway
 *  API / email / dispatch costs. */
const MAX_PROSPECTS_PER_TICK = 20;

export async function runOpsTick(
  env: ServerEnv,
  deps: DispatchDeps = {},
  ctx: StepCtx = {},
): Promise<void> {
  const tickId = new Date().toISOString();
  console.log(`[tick:${tickId}] starting`);

  // M-10 + M-11: Reset per-tick counters so caps apply fresh each tick.
  resetEmailCounter();
  resetDispatchCounter();

  let prospects;
  try {
    prospects = await listProspectsNeedingOps();
  } catch (e) {
    console.error(
      `[tick:${tickId}] failed to list prospects: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  // M-08: Cap prospects per tick to prevent runaway cost/time.
  if (prospects.length > MAX_PROSPECTS_PER_TICK) {
    console.warn(
      `[tick:${tickId}] ${prospects.length} prospects exceeds cap of ${MAX_PROSPECTS_PER_TICK} — processing first ${MAX_PROSPECTS_PER_TICK} only`,
    );
    prospects = prospects.slice(0, MAX_PROSPECTS_PER_TICK);
  }

  console.log(
    `[tick:${tickId}] ${prospects.length} prospect(s) in onboarding`,
  );

  for (const prospect of prospects) {
    try {
      await dispatchProspect(prospect, env, deps, ctx);
    } catch (e) {
      // Defensive: dispatchProspect already catches per-step errors,
      // so this only fires if the dispatcher itself throws (e.g.
      // audit/exception writers both fail catastrophically).
      // Log + continue to the next prospect — never let one
      // prospect's failure block the tick.
      console.error(
        `[tick:${tickId}] dispatchProspect threw for ${prospect.token}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(`[tick:${tickId}] complete`);
}
