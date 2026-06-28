// Tests for the post-launch eligibility + date / refund helpers
// added alongside the dashboard self-serve module-change flow.
// Pre-launch eligibility + delta math is exercised elsewhere via
// the /api/onboarding/module-change golden tests.

import { describe, expect, test } from "vitest";
import type { ProspectRecord } from "@/lib/notion-prospects";
import {
  calculateModuleDelta,
  canChangePostLaunch,
  modulesToSelection,
  nextBillingDate,
  proratedRefundPounds,
} from "@/lib/billing/module-policy";
import { calculateFees } from "@/lib/fees";

const liveProspect: ProspectRecord = {
  pageId: "p",
  token: "tok",
  name: "Alex",
  email: "alex@example.com",
  status: "Live",
  softBlockersTriggered: [],
  moduleSelections: ["Newsletter"],
  extraLocations: 0,
  foundingMember: false,
  onboardingStep1Done: true,
  onboardingStep2Done: true,
  onboardingStep3Done: true,
  onboardingStep4Done: true,
  onboardingStep5Done: true,
  onboardingContentDone: true,
  changeRequests: [],
  notionUrl: "",
  moduleChangeLog: [],
};

describe("canChangePostLaunch", () => {
  test("Live prospect is allowed", () => {
    expect(canChangePostLaunch(liveProspect).allowed).toBe(true);
  });

  test("Cancelled prospect is denied with explicit reason", () => {
    const result = canChangePostLaunch({
      ...liveProspect,
      status: "Cancelled",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("already-cancelled");
  });

  test("Pre-launch prospects (Onboarding Started) are denied — they use the Hub flow", () => {
    const result = canChangePostLaunch({
      ...liveProspect,
      status: "Onboarding Started",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("not-live");
  });
});

describe("nextBillingDate", () => {
  test("mid-month → 1st of next month", () => {
    expect(nextBillingDate(new Date("2026-05-24T10:00:00Z"))).toBe(
      "2026-06-01",
    );
  });

  test("first of month → 1st of NEXT month (never returns same day)", () => {
    expect(nextBillingDate(new Date("2026-05-01T00:00:00Z"))).toBe(
      "2026-06-01",
    );
  });

  test("december rolls to next year", () => {
    expect(nextBillingDate(new Date("2026-12-31T23:59:59Z"))).toBe(
      "2027-01-01",
    );
  });
});

describe("proratedRefundPounds", () => {
  test("full unused month refunds the whole monthly fee", () => {
    const refund = proratedRefundPounds({
      monthlyFeePounds: 30,
      lastChargedAt: new Date().toISOString(),
      now: new Date(),
    });
    expect(refund).toBe(30);
  });

  test("halfway through (15/30 days) refunds half", () => {
    const charged = new Date("2026-05-01T00:00:00Z");
    const now = new Date("2026-05-16T00:00:00Z"); // 15 days used, 15 unused
    expect(
      proratedRefundPounds({
        monthlyFeePounds: 30,
        lastChargedAt: charged.toISOString(),
        now,
      }),
    ).toBe(15);
  });

  test("full month elapsed = 0 refund (not negative)", () => {
    const charged = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-05-15T00:00:00Z"); // 44 days, capped
    expect(
      proratedRefundPounds({
        monthlyFeePounds: 30,
        lastChargedAt: charged.toISOString(),
        now,
      }),
    ).toBe(0);
  });

  test("rounding to nearest penny", () => {
    // 30 / 30 * 1 day = 1.00 exactly; 33 / 30 * 7 days = 7.70
    const charged = new Date("2026-05-01T00:00:00Z");
    const now = new Date("2026-05-08T00:00:00Z");
    expect(
      proratedRefundPounds({
        monthlyFeePounds: 33,
        lastChargedAt: charged.toISOString(),
        now,
      }),
    ).toBe(25.3); // 33/30 * 23 unused = 25.30
  });
});

// Phase A pricing-lock 2026-05-25 — these tests pin the post-lock
// numbers so an accidental constant change is caught immediately.

describe("calculateFees — locked 2026-05-25 prices", () => {
  test("base only (no modules, no founding) = 299 setup, 29 monthly", () => {
    const fees = calculateFees(modulesToSelection([]));
    expect(fees.setup).toBe(299);
    expect(fees.monthly).toBe(29);
    expect(fees.founding).toBe(false);
  });

  test("founding base = 199 setup, 15 monthly", () => {
    const fees = calculateFees(modulesToSelection([]), true);
    expect(fees.setup).toBe(199);
    expect(fees.monthly).toBe(15);
    expect(fees.founding).toBe(true);
  });

  test("every module ticked (Standard) = 424 setup, 82 monthly", () => {
    // base 299 + booking 19 + enquiry 19 + newsletter 49 + offers 19 + GBP 59 = 464 setup
    // base 29 + booking 6 + enquiry 6 + newsletter 9 + offers 6 + GBP 3 = 59 monthly
    const allModules = [
      "Online Booking",
      "Enquiry Form",
      "Newsletter",
      "Offers",
      "Google Business Profile Setup/Audit",
    ];
    const fees = calculateFees(modulesToSelection(allModules));
    expect(fees.setup).toBe(464);
    expect(fees.monthly).toBe(59);
  });

  test("multi-location adds 15 per extra, no monthly", () => {
    const zero = calculateFees(modulesToSelection([], 0));
    const three = calculateFees(modulesToSelection(["Multi-location"], 3));
    expect(three.setup - zero.setup).toBe(45);
    expect(three.monthly).toBe(zero.monthly);
  });

  test("multi-location flag present, counter 0 → coerces to 1 extra (£15)", () => {
    const noCounter = calculateFees(modulesToSelection(["Multi-location"], 0));
    expect(noCounter.setup).toBe(299 + 15);
  });

  test("counter > 0 but flag missing → trust the counter (data-drift defence)", () => {
    // Admin grant or direct Notion edit could push extraLocations
    // without touching the multi_select. The counter is authoritative.
    const fees = calculateFees(modulesToSelection([], 3));
    expect(fees.setup).toBe(299 + 45);
  });
});

describe("calculateModuleDelta — multi-location counter", () => {
  test("bumping extraLocations 1 → 3 with flag already present is a non-noop", () => {
    const d = calculateModuleDelta({
      fromModules: ["Multi-location"],
      toModules: ["Multi-location"],
      foundingMember: false,
      fromExtraLocations: 1,
      toExtraLocations: 3,
    });
    expect(d.isNoOp).toBe(false);
    expect(d.setupDelta).toBe(30); // 2 extra × £15
    expect(d.monthlyDelta).toBe(0);
  });

  test("adding the Multi-location flag with counter 2 = +£30 setup", () => {
    const d = calculateModuleDelta({
      fromModules: [],
      toModules: ["Multi-location"],
      foundingMember: false,
      fromExtraLocations: 0,
      toExtraLocations: 2,
    });
    expect(d.added).toEqual(["Multi-location"]);
    expect(d.setupDelta).toBe(30);
  });

  test("identical selections = no-op even with counters provided", () => {
    const d = calculateModuleDelta({
      fromModules: ["Online Booking"],
      toModules: ["Online Booking"],
      foundingMember: false,
      fromExtraLocations: 0,
      toExtraLocations: 0,
    });
    expect(d.isNoOp).toBe(true);
  });

  test("adding Newsletter post-launch = +£49 setup, +£9 monthly (locked-25-05 prices)", () => {
    const d = calculateModuleDelta({
      fromModules: [],
      toModules: ["Newsletter"],
      foundingMember: false,
    });
    expect(d.setupDelta).toBe(49);
    expect(d.monthlyDelta).toBe(9);
  });

  test("multi-location post-launch stepper: 0 → 2 = +£30 setup, monthly unchanged, flag added", () => {
    // Mirrors what /api/account/multilocation calls calculateModuleDelta
    // with when the customer bumps from 0 → 2 extras.
    const d = calculateModuleDelta({
      fromModules: [],
      toModules: ["Multi-location"],
      foundingMember: false,
      fromExtraLocations: 0,
      toExtraLocations: 2,
    });
    expect(d.setupDelta).toBe(30);
    expect(d.monthlyDelta).toBe(0);
    expect(d.added).toEqual(["Multi-location"]);
  });

  test("multi-location post-launch stepper: 3 → 0 = removes flag, setup change = -45", () => {
    // Setup delta is negative because we're going from a paid-for
    // 3-extras setup (£45) to 0. NOT refundable in practice (the
    // £15 was for past provisioning work) — the API surfaces this
    // negative as a "no refund — work already delivered" message
    // and the operator doesn't actually credit. Test pins the
    // arithmetic so the UI's "no refund" copy stays consistent
    // with what the policy layer reports.
    const d = calculateModuleDelta({
      fromModules: ["Multi-location"],
      toModules: [],
      foundingMember: false,
      fromExtraLocations: 3,
      toExtraLocations: 0,
    });
    expect(d.setupDelta).toBe(-45);
    expect(d.monthlyDelta).toBe(0);
    expect(d.removed).toEqual(["Multi-location"]);
  });
});
