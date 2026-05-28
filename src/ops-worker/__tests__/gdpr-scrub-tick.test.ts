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
    ...overrides,
  }) as ProspectRecord;

const runMock = vi.fn().mockResolvedValue(undefined);
const bindMock = vi.fn(() => ({ run: runMock }));
const prepareMock = vi.fn(() => ({ bind: bindMock }));
const db = {
  prepare: prepareMock,
  batch: vi.fn(),
} as unknown as D1Database;

const r2ListMock = vi.fn().mockResolvedValue({ objects: [], truncated: false });
const r2DeleteMock = vi.fn().mockResolvedValue(undefined);
const r2 = { list: r2ListMock, delete: r2DeleteMock };

beforeEach(() => {
  vi.clearAllMocks();
  prepareMock.mockReturnValue({ bind: bindMock });
  bindMock.mockReturnValue({ run: runMock });
  r2ListMock.mockResolvedValue({ objects: [], truncated: false });
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

    await runGdprScrubTick({ db, r2 });

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

    await runGdprScrubTick({ db, r2 });

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

    await runGdprScrubTick({ db, r2 });

    expect(scrubPersonalDataFields).not.toHaveBeenCalled();
    expect(markScrubbed).not.toHaveBeenCalled();
  });

  test("deletes R2 brand assets under assets/<token>/ prefix", async () => {
    vi.mocked(listAllProspects).mockResolvedValue([
      prospect({
        token: "tok-r2",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
      }),
    ]);
    r2ListMock.mockResolvedValueOnce({
      objects: [
        { key: "assets/tok-r2/logo/abc.png" },
        { key: "assets/tok-r2/photos/def.jpg" },
      ],
      truncated: false,
    });

    await runGdprScrubTick({ db, r2 });

    expect(r2ListMock).toHaveBeenCalledWith({ prefix: "assets/tok-r2/", cursor: undefined });
    expect(r2DeleteMock).toHaveBeenCalledWith([
      "assets/tok-r2/logo/abc.png",
      "assets/tok-r2/photos/def.jpg",
    ]);
    expect(markScrubbed).toHaveBeenCalledTimes(1);
  });

  test("handles paginated R2 list (truncated results)", async () => {
    vi.mocked(listAllProspects).mockResolvedValue([
      prospect({
        token: "tok-paged",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
      }),
    ]);
    r2ListMock
      .mockResolvedValueOnce({
        objects: [{ key: "assets/tok-paged/logo/a.png" }],
        truncated: true,
        cursor: "page2",
      })
      .mockResolvedValueOnce({
        objects: [{ key: "assets/tok-paged/photos/b.jpg" }],
        truncated: false,
      });

    await runGdprScrubTick({ db, r2 });

    expect(r2ListMock).toHaveBeenCalledTimes(2);
    expect(r2ListMock).toHaveBeenCalledWith({ prefix: "assets/tok-paged/", cursor: "page2" });
    expect(r2DeleteMock).toHaveBeenCalledTimes(2);
  });

  test("still scrubs successfully when R2 binding is missing", async () => {
    vi.mocked(listAllProspects).mockResolvedValue([
      prospect({
        token: "tok-nor2",
        status: "Cancelled",
        dataRetentionUntil: yesterday,
      }),
    ]);

    await runGdprScrubTick({ db });

    expect(scrubPersonalDataFields).toHaveBeenCalledTimes(1);
    expect(markScrubbed).toHaveBeenCalledTimes(1);
    expect(r2DeleteMock).not.toHaveBeenCalled();
  });
});
