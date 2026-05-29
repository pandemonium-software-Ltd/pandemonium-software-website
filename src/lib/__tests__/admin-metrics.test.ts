import { describe, expect, test } from "vitest";
import type { ProspectRecord } from "../notion-prospects";
import {
  computeKpis,
  computeBuildMetrics,
  computeInsightMetrics,
  computeRunMetrics,
  cronHealthStatus,
} from "../admin-metrics";

const base: ProspectRecord = {
  pageId: "page_1",
  token: "tok-1",
  name: "Alex",
  email: "alex@test.com",
  status: "Phase 1 Complete",
  softBlockersTriggered: [],
  moduleSelections: [],
  extraLocations: 0,
  foundingMember: false,
  onboardingStep1Done: false,
  onboardingStep2Done: false,
  onboardingStep3Done: false,
  onboardingStep4Done: false,
  onboardingStep5Done: false,
  onboardingContentDone: false,
  changeRequests: [],
  notionUrl: "",
  moduleChangeLog: [],
};

function prospect(overrides: Partial<ProspectRecord>): ProspectRecord {
  return { ...base, ...overrides } as ProspectRecord;
}

describe("computeKpis", () => {
  test("counts statuses correctly", () => {
    const prospects = [
      prospect({ status: "Phase 1 Complete" }),
      prospect({ status: "Phase 2 Accepted" }),
      prospect({ status: "Paid", monthlyFeeCalculated: 29, setupFeeCalculated: 299 }),
      prospect({ status: "Onboarding Started", monthlyFeeCalculated: 35, setupFeeCalculated: 318 }),
      prospect({ status: "Live", monthlyFeeCalculated: 15, setupFeeCalculated: 99, foundingMember: true }),
      prospect({ status: "Cancelled" }),
    ];
    const kpis = computeKpis(prospects);

    expect(kpis.total).toBe(6);
    expect(kpis.enquiries).toBe(2);
    expect(kpis.onboarding).toBe(2);
    expect(kpis.live).toBe(1);
    expect(kpis.cancelled).toBe(1);
    expect(kpis.paid).toBe(3);
    expect(kpis.totalMrr).toBe(79);
    expect(kpis.totalSetupCollected).toBe(716);
    expect(kpis.foundingCount).toBe(1);
    expect(kpis.standardCount).toBe(2);
  });

  test("counts stuck builds and open change requests", () => {
    const eightDaysAgo = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const prospects = [
      prospect({
        status: "Onboarding Started",
        onboardingStartedAt: eightDaysAgo,
        onboardingStep1Done: true,
      }),
      prospect({
        status: "Onboarding Started",
        onboardingStartedAt: eightDaysAgo,
        onboardingStep1Done: true,
        onboardingStep2Done: true,
        onboardingStep3Done: true,
        onboardingStep4Done: true,
        onboardingStep5Done: true,
        onboardingContentDone: true,
      }),
      prospect({
        status: "Live",
        changeRequests: [
          { id: "cr1", submittedAt: "", message: "", status: "pending" },
          { id: "cr2", submittedAt: "", message: "", status: "resolved" },
        ] as ProspectRecord["changeRequests"],
      }),
    ];
    const kpis = computeKpis(prospects);
    expect(kpis.stuckBuilds).toBe(1);
    expect(kpis.openChangeRequests).toBe(1);
  });
});

describe("computeBuildMetrics", () => {
  test("includes only onboarding-status prospects", () => {
    const twoDaysAgo = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const prospects = [
      prospect({ status: "Phase 1 Complete" }),
      prospect({
        status: "Onboarding Started",
        onboardingStartedAt: twoDaysAgo,
        onboardingStep1Done: true,
        onboardingStep2Done: true,
      }),
      prospect({ status: "Live" }),
    ];
    const metrics = computeBuildMetrics(prospects);
    expect(metrics.onboardingCustomers).toHaveLength(1);
    expect(metrics.onboardingCustomers[0].stepsCompleted).toBe(2);
    expect(metrics.onboardingCustomers[0].totalSteps).toBe(6);
    expect(metrics.onboardingCustomers[0].isStuck).toBe(false);
  });

  test("flags stuck builds correctly", () => {
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const prospects = [
      prospect({
        status: "Onboarding Started",
        onboardingStartedAt: tenDaysAgo,
        onboardingStep1Done: true,
      }),
    ];
    const metrics = computeBuildMetrics(prospects);
    expect(metrics.onboardingCustomers[0].isStuck).toBe(true);
  });

  test("identifies upcoming launches", () => {
    const inFiveDays = new Date(
      Date.now() + 5 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    const prospects = [
      prospect({
        status: "Build Started",
        goLiveDate: inFiveDays,
        onboardingStartedAt: new Date().toISOString(),
      }),
    ];
    const metrics = computeBuildMetrics(prospects);
    expect(metrics.upcomingLaunches).toHaveLength(1);
    expect(metrics.upcomingLaunches[0].daysUntilLaunch).toBeLessThanOrEqual(5);
  });

  test("identifies build failures", () => {
    const prospects = [
      prospect({
        status: "Onboarding Started",
        onboardingStartedAt: new Date().toISOString(),
        previewBuildFailedAt: new Date().toISOString(),
      }),
    ];
    const metrics = computeBuildMetrics(prospects);
    expect(metrics.buildFailures).toHaveLength(1);
  });

  test("computes step completion rates", () => {
    const prospects = [
      prospect({
        status: "Paid",
        onboardingStep1Done: true,
        onboardingStep2Done: true,
      }),
      prospect({
        status: "Onboarding Started",
        onboardingStep1Done: true,
      }),
    ];
    const metrics = computeBuildMetrics(prospects);
    expect(metrics.stepCompletionRates["1. Cloudflare"]).toBe(100);
    expect(metrics.stepCompletionRates["2. Domain"]).toBe(50);
    expect(metrics.stepCompletionRates["3. Tools"]).toBe(0);
  });
});

describe("computeInsightMetrics", () => {
  test("builds conversion funnel", () => {
    const prospects = [
      prospect({ status: "Phase 1 Complete" }),
      prospect({ status: "Phase 1 Email Sent" }),
      prospect({ status: "Phase 2 Accepted" }),
      prospect({ status: "Phase 3 Complete" }),
      prospect({ status: "Paid" }),
      prospect({ status: "Onboarding Started" }),
      prospect({ status: "Live" }),
      prospect({ status: "Cancelled" }),
    ];
    const metrics = computeInsightMetrics(prospects);
    const funnel = Object.fromEntries(
      metrics.conversionFunnel.map((s) => [s.label, s.count]),
    );
    expect(funnel["Phase 1"]).toBe(2);
    expect(funnel["Phase 2"]).toBe(1);
    expect(funnel["Phase 3"]).toBe(1);
    expect(funnel["Paid"]).toBe(1);
    expect(funnel["Onboarding"]).toBe(1);
    expect(funnel["Live"]).toBe(1);
  });

  test("skips cancelled from funnel", () => {
    const prospects = [prospect({ status: "Cancelled" })];
    const metrics = computeInsightMetrics(prospects);
    const total = metrics.conversionFunnel.reduce((a, s) => a + s.count, 0);
    expect(total).toBe(0);
  });

  test("aggregates niche, module and location data", () => {
    const prospects = [
      prospect({
        status: "Paid",
        businessType: "Plumber",
        location: "Oxford",
        moduleSelections: ["Online Booking", "Newsletter"],
        monthlyFeeCalculated: 44,
        setupFeeCalculated: 367,
        foundingMember: false,
      }),
      prospect({
        status: "Live",
        businessType: "Plumber",
        location: "London",
        moduleSelections: ["Online Booking"],
        monthlyFeeCalculated: 15,
        setupFeeCalculated: 99,
        foundingMember: true,
      }),
      prospect({
        status: "Phase 1 Complete",
        businessType: "Electrician",
        location: "Oxford",
      }),
    ];
    const metrics = computeInsightMetrics(prospects);

    expect(metrics.pipelineByNiche[0]).toEqual({ niche: "Plumber", count: 2 });
    expect(metrics.pipelineByNiche[1]).toEqual({ niche: "Electrician", count: 1 });

    expect(metrics.modulePopularity[0]).toEqual({ module: "Online Booking", count: 2 });
    expect(metrics.modulePopularity[1]).toEqual({ module: "Newsletter", count: 1 });

    expect(metrics.locationSpread[0]).toEqual({ location: "Oxford", count: 2 });

    expect(metrics.totalMrr).toBe(59);
    expect(metrics.revenueByTier.founding).toEqual({ count: 1, mrr: 15 });
    expect(metrics.revenueByTier.standard).toEqual({ count: 1, mrr: 44 });
  });
});

describe("computeRunMetrics", () => {
  test("filters live sites and builds zone breakdown", () => {
    const prospects = [
      prospect({
        status: "Live",
        cloudflareZoneStatus: "active",
        siteLiveAt: "2026-05-20T00:00:00Z",
        business: "Acme Plumbing",
      }),
      prospect({
        status: "Live",
        cloudflareZoneStatus: "pending",
        business: "Bob Electric",
      }),
      prospect({ status: "Phase 1 Complete" }),
    ];
    const metrics = computeRunMetrics(prospects, [], [], 3, 5);
    expect(metrics.liveSites).toHaveLength(2);
    expect(metrics.zoneStatusBreakdown).toEqual({ active: 1, pending: 1 });
    expect(metrics.sentryOpen).toBe(3);
    expect(metrics.sentryResolved).toBe(5);
  });
});

describe("cronHealthStatus", () => {
  test("returns ok for recent timestamps", () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    expect(cronHealthStatus(oneHourAgo)).toBe("ok");
  });

  test("returns warn for stale timestamps (26-50h)", () => {
    const thirtyHoursAgo = new Date(
      Date.now() - 30 * 3_600_000,
    ).toISOString();
    expect(cronHealthStatus(thirtyHoursAgo)).toBe("warn");
  });

  test("returns error for very stale timestamps (>50h)", () => {
    const threeDaysAgo = new Date(
      Date.now() - 72 * 3_600_000,
    ).toISOString();
    expect(cronHealthStatus(threeDaysAgo)).toBe("error");
  });

  test("returns error for null", () => {
    expect(cronHealthStatus(null)).toBe("error");
  });
});
