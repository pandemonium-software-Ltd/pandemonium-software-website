import { describe, expect, test } from "vitest";
import type { ProspectRecord } from "../notion-prospects";
import {
  computeKpis,
  computeBuildMetrics,
  computeInsightMetrics,
  computeRunMetrics,
  computeDeploymentStatus,
  computePaymentHealth,
  summariseR2Objects,
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

  test("includes deployment, payment and r2 sub-metrics", () => {
    const metrics = computeRunMetrics(
      [prospect({ status: "Live", stripeSubscriptionId: "sub_1" })],
      [],
      [],
      0,
      0,
      null,
    );
    expect(metrics.deployment).toBeDefined();
    expect(metrics.payment.payingCustomers).toBe(1);
    expect(metrics.r2).toBeNull();
  });
});

describe("computeDeploymentStatus", () => {
  const now = new Date("2026-06-03T12:00:00Z");

  test("flags in-progress, failed, live and idle states", () => {
    const recent = new Date(now.getTime() - 5 * 60_000).toISOString();
    const stale = new Date(now.getTime() - 60 * 60_000).toISOString();
    const prospects = [
      prospect({
        token: "building",
        status: "Build Started",
        previewBuildTriggeredAt: recent,
      }),
      prospect({
        token: "failed",
        status: "Onboarding Complete",
        previewBuildFailedAt: stale,
      }),
      prospect({ token: "live", status: "Live" }),
      prospect({ token: "idle", status: "Paid" }),
      // Not paid yet — excluded from the pipeline entirely.
      prospect({ token: "enquiry", status: "Phase 1 Complete" }),
    ];

    const d = computeDeploymentStatus(prospects, now);

    expect(d.inProgress.map((e) => e.token)).toEqual(["building"]);
    expect(d.failed.map((e) => e.token)).toEqual(["failed"]);
    expect(d.liveCount).toBe(1);
    // recent list only contains entries with a build timestamp.
    expect(d.recent.map((e) => e.token).sort()).toEqual(["building", "failed"]);
  });

  test("failure takes precedence over a recent trigger", () => {
    const recent = new Date(now.getTime() - 2 * 60_000).toISOString();
    const d = computeDeploymentStatus(
      [
        prospect({
          token: "x",
          status: "Build Started",
          previewBuildTriggeredAt: recent,
          previewBuildFailedAt: recent,
        }),
      ],
      now,
    );
    expect(d.failed).toHaveLength(1);
    expect(d.inProgress).toHaveLength(0);
  });

  test("go-live builds are labelled distinctly", () => {
    const recent = new Date(now.getTime() - 3 * 60_000).toISOString();
    const d = computeDeploymentStatus(
      [
        prospect({
          token: "x",
          status: "Build Started",
          finalLaunchTriggeredAt: recent,
        }),
      ],
      now,
    );
    expect(d.inProgress[0].kind).toBe("go-live");
  });
});

describe("computePaymentHealth", () => {
  test("counts subscriptions and flags missing ones", () => {
    const p = computePaymentHealth([
      prospect({ status: "Live", stripeSubscriptionId: "sub_1", monthlyFeeCalculated: 15 }),
      prospect({ status: "Paid", monthlyFeeCalculated: 29 }), // no sub id
      prospect({ status: "Phase 1 Complete" }), // not paying
    ]);
    expect(p.payingCustomers).toBe(2);
    expect(p.activeSubscriptions).toBe(1);
    expect(p.missingSubscription).toHaveLength(1);
    expect(p.totalMrr).toBe(44);
    expect(p.status).toBe("warn");
  });

  test("billing failures drive error status", () => {
    const p = computePaymentHealth([
      prospect({
        status: "Live",
        stripeSubscriptionId: "sub_1",
        moduleChangeLog: [
          {
            id: "e1",
            submittedAt: "2026-06-01T00:00:00Z",
            fromModules: [],
            toModules: ["Newsletter"],
            setupDelta: 0,
            monthlyDelta: 9,
            newSetupTotal: 0,
            newMonthlyTotal: 24,
            status: "billing-failed",
            resolvedAt: "2026-06-02T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(p.billingFailures).toHaveLength(1);
    expect(p.billingFailures[0].modules).toEqual(["Newsletter"]);
    expect(p.status).toBe("error");
  });

  test("pending stripe ops are surfaced with a summary", () => {
    const p = computePaymentHealth([
      prospect({
        status: "Live",
        stripeSubscriptionId: "sub_1",
        moduleChangeLog: [
          {
            id: "e2",
            submittedAt: "2026-06-01T00:00:00Z",
            fromModules: ["Offers"],
            toModules: ["Offers", "Newsletter"],
            setupDelta: 49,
            monthlyDelta: 9,
            newSetupTotal: 49,
            newMonthlyTotal: 24,
            status: "pending-stripe",
            effectiveDate: "2026-07-01",
            kind: "modules-post-launch",
          },
        ],
      }),
    ]);
    expect(p.pendingStripeOps).toHaveLength(1);
    expect(p.pendingStripeOps[0].summary).toContain("Newsletter");
    expect(p.pendingStripeOps[0].effectiveDate).toBe("2026-07-01");
    expect(p.status).toBe("warn");
  });
});

describe("summariseR2Objects", () => {
  test("rolls up bytes per customer token from assets/<token>/ keys", () => {
    const names = new Map([
      ["tok-a", "Acme"],
      ["tok-b", "Bravo"],
    ]);
    const usage = summariseR2Objects(
      [
        { key: "assets/tok-a/logo.png", size: 1000 },
        { key: "assets/tok-a/hero.jpg", size: 2000 },
        { key: "assets/tok-b/logo.png", size: 500 },
      ],
      names,
      false,
    );
    expect(usage.totalBytes).toBe(3500);
    expect(usage.objectCount).toBe(3);
    expect(usage.perCustomer[0]).toEqual({
      token: "tok-a",
      name: "Acme",
      bytes: 3000,
      objects: 2,
    });
    expect(usage.truncated).toBe(false);
  });

  test("buckets unknown-shaped keys under their first segment", () => {
    const usage = summariseR2Objects(
      [{ key: "stray-file.txt", size: 10 }],
      new Map(),
      true,
    );
    expect(usage.perCustomer[0].token).toBe("stray-file.txt");
    expect(usage.truncated).toBe(true);
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
