// Tests for the post-launch eligibility + date / refund helpers
// added alongside the dashboard self-serve module-change flow.
// Pre-launch eligibility + delta math is exercised elsewhere via
// the /api/onboarding/module-change golden tests.

import { describe, expect, test } from "vitest";
import type { ProspectRecord } from "@/lib/notion-prospects";
import {
  canChangePostLaunch,
  nextBillingDate,
  proratedRefundPounds,
} from "@/lib/billing/module-policy";

const liveProspect: ProspectRecord = {
  pageId: "p",
  token: "tok",
  name: "Alex",
  email: "alex@example.com",
  status: "Live",
  softBlockersTriggered: [],
  moduleSelections: ["Newsletter"],
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
