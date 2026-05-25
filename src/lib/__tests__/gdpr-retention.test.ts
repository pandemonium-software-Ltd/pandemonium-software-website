// Tests for the GDPR retention pure helpers. The cron orchestration
// is mocked separately in ops-worker/__tests__/gdpr-scrub-tick.test.ts.

import { describe, expect, test } from "vitest";
import type { ProspectRecord } from "@/lib/notion-prospects";
import {
  isDueForScrub,
  personalDataRetentionUntil,
  PERSONAL_DATA_RETENTION_DAYS,
} from "@/lib/gdpr-retention";

const baseProspect: ProspectRecord = {
  pageId: "p",
  token: "tok",
  name: "Alex",
  email: "alex@example.com",
  status: "Cancelled",
  softBlockersTriggered: [],
  moduleSelections: [],
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

describe("personalDataRetentionUntil", () => {
  test("adds the default 30 days to the cancellation date", () => {
    expect(
      personalDataRetentionUntil("2026-05-01T12:00:00Z"),
    ).toBe("2026-05-31");
  });

  test("rolls into the next month + year correctly", () => {
    expect(
      personalDataRetentionUntil("2026-12-15T00:00:00Z"),
    ).toBe("2027-01-14");
  });

  test("honours the constant for documentation", () => {
    expect(PERSONAL_DATA_RETENTION_DAYS).toBe(30);
  });

  test("custom retention-day count works (for future ops overrides)", () => {
    expect(
      personalDataRetentionUntil("2026-05-01T00:00:00Z", 7),
    ).toBe("2026-05-08");
  });
});

describe("isDueForScrub", () => {
  const now = new Date("2026-06-15T03:00:00Z");

  test("Cancelled + retention date past + not yet scrubbed = due", () => {
    expect(
      isDueForScrub(baseProspect, "2026-05-31", undefined, now),
    ).toBe(true);
  });

  test("retention date is today = due (>= check is inclusive)", () => {
    expect(
      isDueForScrub(baseProspect, "2026-06-15", undefined, now),
    ).toBe(true);
  });

  test("retention date is tomorrow = NOT due", () => {
    expect(
      isDueForScrub(baseProspect, "2026-06-16", undefined, now),
    ).toBe(false);
  });

  test("already scrubbed = NOT due (safety latch)", () => {
    expect(
      isDueForScrub(
        baseProspect,
        "2026-05-31",
        "2026-06-01T00:00:00Z",
        now,
      ),
    ).toBe(false);
  });

  test("not Cancelled = NOT due (Live customers never scrubbed)", () => {
    expect(
      isDueForScrub(
        { ...baseProspect, status: "Live" },
        "2026-05-31",
        undefined,
        now,
      ),
    ).toBe(false);
  });

  test("retention date never set = NOT due (defensive)", () => {
    expect(
      isDueForScrub(baseProspect, undefined, undefined, now),
    ).toBe(false);
  });
});
