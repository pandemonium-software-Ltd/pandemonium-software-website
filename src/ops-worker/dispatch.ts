// Per-prospect dispatcher.
//
// For one prospect, iterate the registered Steps. For each Step:
//   - shouldRun? skip cheaply if no.
//   - run() inside try/catch (§4.6 wrapping pattern).
//   - Result feeds writeAudit() always; writeException() on fail.
//
// This is the keystone of the §4.2 trigger model. The tick handler
// (tick.ts) just lists prospects and calls dispatchProspect for
// each — all the per-step logic lives here so it's testable in
// isolation without mocking the cron.

import type { ProspectRecord } from "../lib/notion-prospects";
import type { ServerEnv } from "../lib/env";
import type { Step, StepResult, AuditEntry, ExceptionEntry } from "./types";
import { writeAudit } from "./audit";
import { writeException } from "./exceptions";

import { step1Cloudflare } from "./steps/step1-cloudflare";
import { step2Domain } from "./steps/step2-domain";
import { step3Tools } from "./steps/step3-tools";
import { step4Assets } from "./steps/step4-assets";
import { step5Review } from "./steps/step5-review";
import { step6ChangeRequests } from "./steps/step6-change-requests";
import { step7GoLive } from "./steps/step7-go-live";

/**
 * Registered steps in execution order. Steps are independent —
 * Step 2 doesn't depend on Step 1 having run THIS tick (since
 * each step is idempotent and reads/writes its own state). But
 * we order them by Hub progression so audit logs read naturally.
 *
 * Step 6 (change-request reminders) runs after the Hub-progression
 * steps because it's orthogonal — it cares about post-launch
 * customer requests rather than onboarding state. Placing it last
 * also means a noisy escalation cron doesn't push Hub steps
 * lower in the audit log.
 *
 * Step 7 (go-live) runs at the very end — it's the final transition
 * from "Onboarding Complete" → "Live". Placed after step6 so any
 * pending change-requests are processed first, then the launch
 * dispatches the final clean build.
 */
export const STEPS: readonly Step[] = [
  step1Cloudflare,
  step2Domain,
  step3Tools,
  step4Assets,
  step5Review,
  step6ChangeRequests,
  step7GoLive,
];

/**
 * Inputs for dispatchProspect — exposed as a separate type so the
 * test harness can pass alternate audit/exception writers without
 * mocking the modules globally.
 */
export type DispatchDeps = {
  steps?: readonly Step[];
  writeAudit?: (env: ServerEnv, entry: AuditEntry) => Promise<void>;
  writeException?: (
    env: ServerEnv,
    entry: ExceptionEntry,
  ) => Promise<void>;
};

export async function dispatchProspect(
  prospect: ProspectRecord,
  env: ServerEnv,
  deps: DispatchDeps = {},
): Promise<void> {
  const steps = deps.steps ?? STEPS;
  const audit = deps.writeAudit ?? writeAudit;
  const except = deps.writeException ?? writeException;

  for (const step of steps) {
    if (!step.shouldRun(prospect)) continue;

    const startedAt = Date.now();
    let result: StepResult;
    try {
      result = await step.run(prospect, env);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      result = { status: "fail", error };
    }
    const durationMs = Date.now() - startedAt;
    const timestamp = new Date().toISOString();

    // Audit always.
    await audit(env, { prospect, step: step.id, result, durationMs, timestamp });

    // Exception only on fail.
    if (result.status === "fail") {
      await except(env, {
        prospect,
        step: step.id,
        errorMessage: result.error.message,
        stackTrace: result.error.stack,
        timestamp,
      });
    }
  }
}
