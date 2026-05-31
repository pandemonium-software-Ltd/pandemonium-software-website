// Shared types for the Cowork Ops Worker.
//
// The Step interface is the contract every per-step automation
// implements. The dispatcher (dispatch.ts) iterates the registered
// steps for each prospect, calls shouldRun to gate work, and on
// "yes" calls run — wrapping in try/catch and writing audit /
// exception entries per §4.6.

import type { ProspectRecord } from "../lib/notion-prospects";
import type { ServerEnv } from "../lib/env";
import type { D1Database } from "../lib/d1-analytics";

export type StepId =
  | "step1"
  | "step2"
  | "step2b"
  | "step3"
  | "step4"
  | "step5"
  | "step6"
  | "step7";

export type StepResult =
  /** Step did its work successfully. */
  | { status: "ok"; notes?: string }
  /**
   * Step had work to do but couldn't run it yet (or this is a
   * stub waiting for a later commit). Audited but doesn't fire
   * an exception — this is expected, not a failure.
   */
  | { status: "skip"; reason: string }
  /** Step threw or returned a programmatic failure. Audited AND fires an exception. */
  | { status: "fail"; error: Error };

/** Tick-scoped context passed to step.run alongside env. Carries
 *  bindings that live on the scheduled-handler env (not process.env)
 *  — currently just the analytics D1 binding which step3-tools uses
 *  to seed gbp_reviews and which future steps may share. */
export type StepCtx = {
  /** The pandemonium_analytics D1 binding from the scheduled
   *  handler. Optional — present only when the tick handler had
   *  it (i.e. the binding is configured in wrangler-ops.jsonc).
   *  Steps that need D1 must handle the missing case with a skip. */
  d1?: D1Database;
};

export type Step = {
  /** Stable id used in audit / exception entries. */
  id: StepId;
  /**
   * Pure, side-effect-free predicate. Returns true if this step
   * has work to consider for the given prospect. The dispatcher
   * uses this to skip irrelevant steps cheaply (e.g. don't run
   * the brand-asset normaliser if Step 4 isn't done yet).
   */
  shouldRun: (prospect: ProspectRecord) => boolean;
  /**
   * Does the actual work. Must be idempotent — calling it again
   * with the same prospect state should be a safe no-op.
   * The dispatcher catches thrown errors and converts them to
   * { status: "fail" } automatically.
   */
  run: (
    prospect: ProspectRecord,
    env: ServerEnv,
    ctx?: StepCtx,
  ) => Promise<StepResult>;
};

/**
 * One audit log entry. Writes to Notion (or stdout if the audit
 * log DB isn't configured). One entry per Step per prospect per
 * tick.
 */
export type AuditEntry = {
  prospect: ProspectRecord;
  step: StepId;
  result: StepResult;
  durationMs: number;
  /** UTC timestamp when this entry was created. */
  timestamp: string;
};

/**
 * One exception entry. Fired when a Step's run() throws or returns
 * { status: "fail" }. Shape per §4.6 + §6.6.
 */
export type ExceptionEntry = {
  prospect: ProspectRecord;
  step: StepId;
  errorMessage: string;
  stackTrace?: string;
  timestamp: string;
};
