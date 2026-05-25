// Dispatcher tests — verify the §4.6 audit/exception wrapping
// pattern with mocked writers + mocked Steps. Pure unit tests, no
// Notion calls, no network.

import { describe, expect, test, vi } from "vitest";
import { dispatchProspect, type DispatchDeps } from "../dispatch";
import type { Step } from "../types";
import type { ProspectRecord } from "../../lib/notion-prospects";
import type { ServerEnv } from "../../lib/env";

const baseProspect: ProspectRecord = {
  pageId: "page_test",
  token: "tok_test",
  name: "Test Customer",
  email: "test@example.com",
  status: "Onboarding Started",
  softBlockersTriggered: [],
  moduleSelections: [],
  extraLocations: 0,
  foundingMember: false,
  onboardingStep1Done: true,
  onboardingStep2Done: false,
  onboardingStep3Done: false,
  onboardingStep4Done: false,
  onboardingStep5Done: false,
  onboardingContentDone: false,
  changeRequests: [],
  notionUrl: "",
  moduleChangeLog: [],
};

const env = {
  NOTION_API_KEY: "test-key",
  NOTION_PROSPECTS_DB_ID: "test-db",
  RESEND_API_KEY: "test-resend",
  ADMIN_PASSWORD: "test-password-1234",
} as unknown as ServerEnv;

function makeStep(
  id: Step["id"],
  shouldRun: boolean,
  runImpl: Step["run"],
): Step {
  return { id, shouldRun: () => shouldRun, run: runImpl };
}

describe("dispatchProspect", () => {
  test("calls writeAudit for each Step that shouldRun=true (ok)", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const except = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [
        makeStep("step1", true, async () => ({ status: "ok", notes: "did the thing" })),
        makeStep("step2", true, async () => ({ status: "ok" })),
      ],
      writeAudit: audit,
      writeException: except,
    };

    await dispatchProspect(baseProspect, env, deps);

    expect(audit).toHaveBeenCalledTimes(2);
    expect(except).not.toHaveBeenCalled();
    expect(audit.mock.calls[0][1].step).toBe("step1");
    expect(audit.mock.calls[0][1].result).toEqual({
      status: "ok",
      notes: "did the thing",
    });
  });

  test("skips Step entirely when shouldRun=false (no audit, no exception)", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const except = vi.fn().mockResolvedValue(undefined);
    const runFn = vi.fn();
    const deps: DispatchDeps = {
      steps: [makeStep("step1", false, runFn)],
      writeAudit: audit,
      writeException: except,
    };

    await dispatchProspect(baseProspect, env, deps);

    expect(runFn).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(except).not.toHaveBeenCalled();
  });

  test("audits skip-result without firing exception", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const except = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [
        makeStep("step1", true, async () => ({
          status: "skip",
          reason: "stub",
        })),
      ],
      writeAudit: audit,
      writeException: except,
    };

    await dispatchProspect(baseProspect, env, deps);

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][1].result.status).toBe("skip");
    expect(except).not.toHaveBeenCalled();
  });

  test("converts thrown error to fail-result + writes both audit AND exception", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const except = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [
        makeStep("step1", true, async () => {
          throw new Error("boom");
        }),
      ],
      writeAudit: audit,
      writeException: except,
    };

    await dispatchProspect(baseProspect, env, deps);

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][1].result.status).toBe("fail");
    expect(except).toHaveBeenCalledTimes(1);
    expect(except.mock.calls[0][1].errorMessage).toBe("boom");
  });

  test("converts non-Error throw (string) to Error in fail-result", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const except = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [
        makeStep("step1", true, async () => {
          throw "string-error"; // bare-string throws happen in JS
        }),
      ],
      writeAudit: audit,
      writeException: except,
    };

    await dispatchProspect(baseProspect, env, deps);

    expect(except.mock.calls[0][1].errorMessage).toBe("string-error");
  });

  test("explicit fail-result writes both audit AND exception", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const except = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [
        makeStep("step1", true, async () => ({
          status: "fail",
          error: new Error("returned-fail"),
        })),
      ],
      writeAudit: audit,
      writeException: except,
    };

    await dispatchProspect(baseProspect, env, deps);

    expect(audit).toHaveBeenCalledTimes(1);
    expect(except).toHaveBeenCalledTimes(1);
    expect(except.mock.calls[0][1].errorMessage).toBe("returned-fail");
  });

  test("processes mixed-result Step list end-to-end", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const except = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [
        makeStep("step1", true, async () => ({ status: "ok" })),
        makeStep("step2", false, async () => ({ status: "ok" })), // skipped — shouldRun=false
        makeStep("step3", true, async () => ({
          status: "skip",
          reason: "no work",
        })),
        makeStep("step4", true, async () => {
          throw new Error("step4 boom");
        }),
        makeStep("step5", true, async () => ({ status: "ok" })),
      ],
      writeAudit: audit,
      writeException: except,
    };

    await dispatchProspect(baseProspect, env, deps);

    // step1, step3, step4, step5 all audited (4 calls).
    // step2 had shouldRun=false → no audit.
    expect(audit).toHaveBeenCalledTimes(4);
    // Only step4 fired exception.
    expect(except).toHaveBeenCalledTimes(1);
    expect(except.mock.calls[0][1].step).toBe("step4");
  });

  test("audit timestamp is ISO 8601 string", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [makeStep("step1", true, async () => ({ status: "ok" }))],
      writeAudit: audit,
      writeException: vi.fn().mockResolvedValue(undefined),
    };

    await dispatchProspect(baseProspect, env, deps);

    const ts = audit.mock.calls[0][1].timestamp;
    expect(typeof ts).toBe("string");
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("audit durationMs is a non-negative number", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const deps: DispatchDeps = {
      steps: [makeStep("step1", true, async () => ({ status: "ok" }))],
      writeAudit: audit,
      writeException: vi.fn().mockResolvedValue(undefined),
    };

    await dispatchProspect(baseProspect, env, deps);

    expect(audit.mock.calls[0][1].durationMs).toBeGreaterThanOrEqual(0);
  });
});
