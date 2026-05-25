// Daily GBP reviews refresh tick tests. Covers: API-key absence,
// target filtering (only prospects with a resolved gbpPlaceId),
// per-customer error isolation (one customer 404 doesn't kill the
// loop), happy-path upsert call shape.

import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ProspectRecord } from "../../lib/notion-prospects";
import type { D1Database } from "../../lib/d1-analytics";

vi.mock("../../lib/env", () => ({
  getServerEnv: vi.fn(),
}));
vi.mock("../../lib/notion-prospects", async (orig) => {
  const actual =
    await orig<typeof import("../../lib/notion-prospects")>();
  return {
    ...actual,
    listProspectsNeedingOps: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("../../lib/google-places", () => ({
  fetchPlaceDetails: vi.fn(),
  PlacesApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("../../lib/d1-gbp", () => ({
  upsertSnapshot: vi.fn().mockResolvedValue(undefined),
}));

import { getServerEnv } from "../../lib/env";
import { listProspectsNeedingOps } from "../../lib/notion-prospects";
import { fetchPlaceDetails } from "../../lib/google-places";
import { upsertSnapshot } from "../../lib/d1-gbp";
import { runGbpReviewsTick } from "../gbp-reviews-tick";

const baseProspect = (
  token: string,
  placeId: string | undefined,
): ProspectRecord =>
  ({
    pageId: `page_${token}`,
    token,
    name: `Customer ${token}`,
    email: `${token}@example.com`,
    status: "Live",
    softBlockersTriggered: [],
    moduleSelections: ["Google Business Profile Setup/Audit"],
  extraLocations: 0,
    foundingMember: false,
    onboardingStep1Done: true,
    onboardingStep2Done: true,
    onboardingStep3Done: true,
    onboardingStep4Done: true,
    onboardingStep5Done: true,
    onboardingData: placeId ? { tools: { gbpPlaceId: placeId } } : {},
    changeRequests: [],
    notionUrl: "",
    moduleChangeLog: [],
    onboardingContentDone: true,
  }) as ProspectRecord;

const snapshot = (rating: number) => ({
  rating,
  totalReviews: 100,
  topReviews: [
    {
      authorName: "Sam",
      rating,
      text: "great",
      relativeTimeDescription: "2 weeks ago",
    },
  ],
  displayName: "Test Listing",
  formattedAddress: "1 Test St",
});

const prepareMock = vi.fn();
const runMock = vi.fn().mockResolvedValue(undefined);
const bindMock = vi.fn();
const db = {
  prepare: prepareMock,
  batch: vi.fn(),
} as unknown as D1Database;

beforeEach(() => {
  vi.clearAllMocks();
  prepareMock.mockReturnValue({ bind: bindMock });
  bindMock.mockReturnValue({ run: runMock });
  vi.mocked(getServerEnv).mockReturnValue({
    GOOGLE_PLACES_API_KEY: "test-places-key",
  } as unknown as ReturnType<typeof getServerEnv>);
});

describe("runGbpReviewsTick", () => {
  test("returns early when GOOGLE_PLACES_API_KEY missing", async () => {
    vi.mocked(getServerEnv).mockReturnValue(
      {} as unknown as ReturnType<typeof getServerEnv>,
    );
    await runGbpReviewsTick({ db });
    expect(listProspectsNeedingOps).not.toHaveBeenCalled();
    expect(fetchPlaceDetails).not.toHaveBeenCalled();
  });

  test("only targets prospects with a resolved gbpPlaceId", async () => {
    vi.mocked(listProspectsNeedingOps).mockResolvedValue([
      baseProspect("alex", "ChIJalex"),
      baseProspect("priya", undefined), // not yet resolved — skip
      baseProspect("sam", "ChIJsam"),
    ]);
    vi.mocked(fetchPlaceDetails).mockResolvedValue(snapshot(4.8));

    await runGbpReviewsTick({ db });

    expect(fetchPlaceDetails).toHaveBeenCalledTimes(2);
    expect(fetchPlaceDetails).toHaveBeenCalledWith(
      "ChIJalex",
      "test-places-key",
    );
    expect(fetchPlaceDetails).toHaveBeenCalledWith(
      "ChIJsam",
      "test-places-key",
    );
    expect(upsertSnapshot).toHaveBeenCalledTimes(2);
  });

  test("per-customer error doesn't kill the loop + records last_error", async () => {
    vi.mocked(listProspectsNeedingOps).mockResolvedValue([
      baseProspect("alex", "ChIJalex"),
      baseProspect("priya", "ChIJpriya"),
      baseProspect("sam", "ChIJsam"),
    ]);
    vi.mocked(fetchPlaceDetails)
      .mockResolvedValueOnce(snapshot(4.8))
      .mockRejectedValueOnce(new Error("404 NOT_FOUND"))
      .mockResolvedValueOnce(snapshot(4.6));

    await runGbpReviewsTick({ db });

    // Two successful upserts (alex + sam).
    expect(upsertSnapshot).toHaveBeenCalledTimes(2);
    // One last_error UPDATE for priya. Captures both the message
    // and the timestamp ordering.
    expect(prepareMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE gbp_reviews"),
    );
    expect(bindMock).toHaveBeenCalledWith(
      expect.stringContaining("404 NOT_FOUND"),
      expect.any(String),
      "priya",
    );
  });
});
