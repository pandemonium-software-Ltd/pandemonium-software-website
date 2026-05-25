// Tests for the GDPR scrub tick — verifies the right prospects
// are picked up, the right D1 + Notion writes happen, and that
// the safety latch (Data Scrubbed At) is respected.

import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ProspectRecord } from "../../lib/notion-prospects";
import type { D1Database } from "../../lib/d1-analytics";

vi.mock("../../lib/env", () => ({
  getServerEnv: vi.fn().mockReturnValue({}),
}));
vi.mock("../../lib/notion-prospects", async (orig) => {
  const actual = await orig<typeof import("../../lib/notion-prospects")>();
  return {
    ...actual,
    listAllProspects: vi.fn().mockResolvedValue([]),
    scrubPersonalDataFields: vi.fn().mockResolvedValue(undefined),
    markScrubbed: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  listAllProspects,
  scrubPersonalDataFields,
  markScrubbed,
} from "../../lib/notion-prospects";
import { runGdprScrubTick } from "../gdpr-scrub-tick";

const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

const prospect = (
  overrides: Partial<ProspectRecord>,
): ProspectRecord =>
  ({
    pageId: `page_${overrides.token ?? "x"}`,
    token: "tok",
    name: "Test",
    email: "test@example.com",
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
    ...overrides,
  }) as ProspectRecord;

const runMock = vi.fn().mockResolvedValue(undefined);
const bindMock = vi.fn(() => ({ run: runMock }));
const prepareMock = vi.fn(() => ({ bind: bindMock }));
const db = {
  prepare: prepareMock,
  batch: vi.fn(),
} as unknown as D1Database;

beforeEach(() => {
  vi.clearAllMocks();
  prepareMock.mockReturnValue({ bind: bindMock });
  bindMock.mockReturnValue({ run: runMock });
});

describe("runGdprScrubTick", () => {
  test("only scrubs prospects that are Cancelled + past retention + not already scrubbed", async () => {
    vi.mocked(listAllProspects).mockResolvedValue([
      prospect({
        token: "due-alex",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
      }),
      prospect({
        token: "not-due-sam",
        status: "Cancelled",
        dataRetentionUntil: tomorrow, // future date
      }),
      prospect({
        token: "live-priya",
        status: "Live", // not cancelled
        dataRetentionUntil: yesterday,
      }),
      prospect({
        token: "already-done-bob",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
        dataScrubbedAt: "2026-05-01T00:00:00Z", // latch
      }),
    ]);

    await runGdprScrubTick({ db });

    // Only alex should have been scrubbed (3 D1 deletes + 1 Notion scrub + 1 latch)
    expect(scrubPersonalDataFields).toHaveBeenCalledTimes(1);
    expect(scrubPersonalDataFields).toHaveBeenCalledWith("page_due-alex");
    expect(markScrubbed).toHaveBeenCalledTimes(1);
    expect(markScrubbed).toHaveBeenCalledWith("page_due-alex");
    // Exactly 3 D1 delete statements prepared (1 per table for alex)
    expect(prepareMock).toHaveBeenCalledTimes(3);
  });

  test("a Notion failure for one prospect doesn't kill the loop", async () => {
    vi.mocked(listAllProspects).mockResolvedValue([
      prospect({
        token: "alex",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
      }),
      prospect({
        token: "sam",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
      }),
    ]);
    vi.mocked(scrubPersonalDataFields)
      .mockRejectedValueOnce(new Error("notion 502"))
      .mockResolvedValueOnce(undefined);

    await runGdprScrubTick({ db });

    // markScrubbed only fires on success — alex skipped, sam done.
    expect(markScrubbed).toHaveBeenCalledTimes(1);
    expect(markScrubbed).toHaveBeenCalledWith("page_sam");
  });

  test("D1 delete failure prevents the safety-latch stamp (will re-try tomorrow)", async () => {
    vi.mocked(listAllProspects).mockResolvedValue([
      prospect({
        token: "alex",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
      }),
    ]);
    runMock.mockRejectedValueOnce(new Error("d1 timeout"));

    await runGdprScrubTick({ db });

    expect(scrubPersonalDataFields).not.toHaveBeenCalled();
    expect(markScrubbed).not.toHaveBeenCalled();
  });
});
