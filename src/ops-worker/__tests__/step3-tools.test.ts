// Step 3 (GBP place_id resolution + first reviews fetch + email)
// tests. Covers the three independent transitions in the state
// machine: shouldRun gating, phase A resolution (URL parse vs
// text-search fallback), and phase C email latch.
//
// External deps mocked: google-places, d1-gbp, notion-prospects
// writes, and the customer email send.

import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ProspectRecord } from "../../lib/notion-prospects";
import type { ServerEnv } from "../../lib/env";
import type { D1Database } from "../../lib/d1-analytics";

vi.mock("../../lib/google-places", () => ({
  parseMapsUrl: vi.fn(),
  resolveMapsShortUrl: vi.fn((u: string) => Promise.resolve(u)),
  findPlaceByQuery: vi.fn(),
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
vi.mock("../../lib/notion-prospects", async (orig) => {
  const actual =
    await orig<typeof import("../../lib/notion-prospects")>();
  return {
    ...actual,
    updateProspectOnboarding: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../notify", () => ({
  sendCustomerEmail: vi.fn().mockResolvedValue({ messageId: "msg_test" }),
}));

import {
  parseMapsUrl,
  findPlaceByQuery,
  fetchPlaceDetails,
} from "../../lib/google-places";
import { upsertSnapshot } from "../../lib/d1-gbp";
import { updateProspectOnboarding } from "../../lib/notion-prospects";
import { sendCustomerEmail } from "../notify";
import { step3Tools } from "../steps/step3-tools";

const env = {
  GOOGLE_PLACES_API_KEY: "test-places-key",
  NOTION_API_KEY: "test-notion",
  RESEND_API_KEY: "test-resend",
} as unknown as ServerEnv;

const db = {
  prepare: vi.fn(),
  batch: vi.fn(),
} as unknown as D1Database;

const baseOnboarding = {
  domain: { domain: "alexsbakery.co.uk", registrar: "cloudflare" },
  business: { location: "Oxford" },
  tools: {
    gbpUrl: "https://maps.google.com/maps/place/Alexs+Bakery",
    gbpManagerInvited: true,
  },
};

const baseProspect: ProspectRecord = {
  pageId: "page_test",
  token: "tok_test",
  name: "Alex's Bakery",
  email: "alex@example.com",
  status: "Onboarding Started",
  softBlockersTriggered: [],
  moduleSelections: ["Google Business Profile Setup/Audit"],
  extraLocations: 0,
  foundingMember: false,
  onboardingStep1Done: true,
  onboardingStep2Done: true,
  onboardingStep3Done: true,
  onboardingStep4Done: false,
  onboardingStep5Done: false,
  cloudflareAccountId: "acc_test",
  onboardingData: baseOnboarding,
  changeRequests: [],
  notionUrl: "",
  moduleChangeLog: [],
  onboardingContentDone: false,
};

const sampleSnapshot = {
  rating: 4.8,
  totalReviews: 142,
  topReviews: [
    {
      authorName: "Sam Smith",
      rating: 5,
      text: "Great service",
      relativeTimeDescription: "2 weeks ago",
    },
  ],
  displayName: "Alex's Bakery",
  formattedAddress: "12 High St, Oxford OX1 4AB",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseMapsUrl).mockReturnValue({});
  vi.mocked(findPlaceByQuery).mockResolvedValue("ChIJfallback");
  vi.mocked(fetchPlaceDetails).mockResolvedValue(sampleSnapshot);
});

describe("step3Tools.shouldRun", () => {
  test("false when GBP not in module selections", () => {
    expect(
      step3Tools.shouldRun({ ...baseProspect, moduleSelections: [] }),
    ).toBe(false);
  });

  test("false when Step 3 not marked done", () => {
    expect(
      step3Tools.shouldRun({
        ...baseProspect,
        onboardingStep3Done: false,
      }),
    ).toBe(false);
  });

  test("false when gbpUrl not pasted yet", () => {
    expect(
      step3Tools.shouldRun({
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: { ...baseOnboarding.tools, gbpUrl: "" },
        },
      }),
    ).toBe(false);
  });

  test("false when manager-invited not ticked", () => {
    expect(
      step3Tools.shouldRun({
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: { ...baseOnboarding.tools, gbpManagerInvited: false },
        },
      }),
    ).toBe(false);
  });

  test("true on first qualifying tick (no placeId, no email)", () => {
    expect(step3Tools.shouldRun(baseProspect)).toBe(true);
  });

  test("false when pending but not yet confirmed (waiting on customer)", () => {
    expect(
      step3Tools.shouldRun({
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: {
            ...baseOnboarding.tools,
            gbpPlaceIdPending: "ChIJpending",
            gbpResolvedName: "Alex's Bakery",
          },
        },
      }),
    ).toBe(false);
  });

  test("true when pending AND confirmed (needs promotion)", () => {
    expect(
      step3Tools.shouldRun({
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: {
            ...baseOnboarding.tools,
            gbpPlaceIdPending: "ChIJpending",
            gbpListingConfirmed: true,
          },
        },
      }),
    ).toBe(true);
  });

  test("true when latched but email not yet sent", () => {
    expect(
      step3Tools.shouldRun({
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: {
            ...baseOnboarding.tools,
            gbpPlaceId: "ChIJexisting",
          },
        },
      }),
    ).toBe(true);
  });

  test("false once both latches are set", () => {
    expect(
      step3Tools.shouldRun({
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: {
            ...baseOnboarding.tools,
            gbpPlaceId: "ChIJexisting",
            gbpModuleReadyEmailSentAt: "2026-05-24T10:00:00Z",
          },
        },
      }),
    ).toBe(false);
  });
});

describe("step3Tools.run — skip paths", () => {
  test("skips when GOOGLE_PLACES_API_KEY not set", async () => {
    const result = await step3Tools.run(
      baseProspect,
      { ...env, GOOGLE_PLACES_API_KEY: undefined as unknown as string },
      { d1: db },
    );
    expect(result.status).toBe("skip");
    expect(findPlaceByQuery).not.toHaveBeenCalled();
  });

  test("skips when D1 binding missing", async () => {
    const result = await step3Tools.run(baseProspect, env, {});
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toContain("D1 binding");
    }
  });
});

describe("step3Tools.run — tick 1: resolve → pending", () => {
  test("URL with explicit place_id skips text-search, writes pending state", async () => {
    vi.mocked(parseMapsUrl).mockReturnValue({ placeId: "ChIJfromUrl" });

    const result = await step3Tools.run(baseProspect, env, { d1: db });

    expect(findPlaceByQuery).not.toHaveBeenCalled();
    // fetchPlaceDetails called for preview (name + address)
    expect(fetchPlaceDetails).toHaveBeenCalledWith("ChIJfromUrl", "test-places-key");
    // NOT yet seeded or emailed — waiting for customer confirmation
    expect(upsertSnapshot).not.toHaveBeenCalled();
    expect(sendCustomerEmail).not.toHaveBeenCalled();
    // One write: pending place_id + resolved name/address
    expect(updateProspectOnboarding).toHaveBeenCalledTimes(1);
    expect(updateProspectOnboarding).toHaveBeenCalledWith(
      "page_test",
      expect.objectContaining({
        data: expect.objectContaining({
          tools: expect.objectContaining({
            gbpPlaceIdPending: "ChIJfromUrl",
            gbpResolvedName: "Alex's Bakery",
            gbpResolvedAddress: "12 High St, Oxford OX1 4AB",
          }),
        }),
      }),
    );
    expect(result.status).toBe("ok");
  });

  test("URL without place_id falls back to text-search, writes pending state", async () => {
    const result = await step3Tools.run(baseProspect, env, { d1: db });

    expect(findPlaceByQuery).toHaveBeenCalledWith(
      "Alex's Bakery, Oxford",
      "test-places-key",
      undefined,
    );
    // Preview fetch for the resolved ID
    expect(fetchPlaceDetails).toHaveBeenCalledWith("ChIJfallback", "test-places-key");
    // Pending, not latched
    expect(upsertSnapshot).not.toHaveBeenCalled();
    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect(updateProspectOnboarding).toHaveBeenCalledWith(
      "page_test",
      expect.objectContaining({
        data: expect.objectContaining({
          tools: expect.objectContaining({
            gbpPlaceIdPending: "ChIJfallback",
          }),
        }),
      }),
    );
    expect(result.status).toBe("ok");
  });

  test("URL with name + lat/lng biases the text-search call", async () => {
    vi.mocked(parseMapsUrl).mockReturnValue({
      name: "Bens Cafe",
      lat: 51.7521,
      lng: -1.2577,
    });

    const result = await step3Tools.run(baseProspect, env, { d1: db });

    expect(findPlaceByQuery).toHaveBeenCalledWith(
      "Bens Cafe",
      "test-places-key",
      { lat: 51.7521, lng: -1.2577 },
    );
    expect(result.status).toBe("ok");
  });
});

describe("step3Tools.run — tick 2: confirmed → latch + seed + email", () => {
  test("promotes pending to latched, seeds reviews, sends email", async () => {
    const confirmedProspect = {
      ...baseProspect,
      onboardingData: {
        ...baseOnboarding,
        tools: {
          ...baseOnboarding.tools,
          gbpPlaceIdPending: "ChIJfromUrl",
          gbpResolvedName: "Alex's Bakery",
          gbpResolvedAddress: "12 High St, Oxford OX1 4AB",
          gbpListingConfirmed: true,
        },
      },
    };

    const result = await step3Tools.run(confirmedProspect, env, { d1: db });

    // Seeds reviews
    expect(fetchPlaceDetails).toHaveBeenCalledWith("ChIJfromUrl", "test-places-key");
    expect(upsertSnapshot).toHaveBeenCalledWith(db, {
      token: "tok_test",
      placeId: "ChIJfromUrl",
      snapshot: sampleSnapshot,
    });
    // Sends confirmation email
    expect(sendCustomerEmail).toHaveBeenCalledWith(
      env,
      baseProspect.email,
      "gbp-module-ready",
      expect.objectContaining({
        customerName: "Alex's Bakery",
        domain: "alexsbakery.co.uk",
      }),
    );
    // Three writes: promote pending→latched, seed is D1 not Notion,
    // then email-sent latch
    expect(updateProspectOnboarding).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("ok");
  });
});

describe("step3Tools.run — latches", () => {
  test("does not re-resolve place_id when already set", async () => {
    const result = await step3Tools.run(
      {
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: { ...baseOnboarding.tools, gbpPlaceId: "ChIJexisting" },
        },
      },
      env,
      { d1: db },
    );

    expect(parseMapsUrl).not.toHaveBeenCalled();
    expect(findPlaceByQuery).not.toHaveBeenCalled();
    // Still seeds + emails (those latches haven't fired).
    expect(fetchPlaceDetails).toHaveBeenCalledWith("ChIJexisting", "test-places-key");
    expect(sendCustomerEmail).toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  test("does not re-send email when latch already set", async () => {
    const result = await step3Tools.run(
      {
        ...baseProspect,
        onboardingData: {
          ...baseOnboarding,
          tools: {
            ...baseOnboarding.tools,
            gbpPlaceId: "ChIJexisting",
            gbpModuleReadyEmailSentAt: "2026-05-24T09:00:00Z",
          },
        },
      },
      env,
      { d1: db },
    );

    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect(fetchPlaceDetails).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

describe("step3Tools.run — failure paths", () => {
  test("text-search failure throws (dispatcher converts to fail)", async () => {
    vi.mocked(findPlaceByQuery).mockRejectedValue(new Error("not found"));

    await expect(
      step3Tools.run(baseProspect, env, { d1: db }),
    ).rejects.toThrow(/place_id resolution failed/);

    expect(updateProspectOnboarding).toHaveBeenCalledWith(
      "page_test",
      expect.objectContaining({
        data: expect.objectContaining({
          tools: expect.objectContaining({
            gbpResolutionError: expect.stringContaining("not found"),
          }),
        }),
      }),
    );
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  test("preview fetch failure during resolution throws (pending not set)", async () => {
    vi.mocked(parseMapsUrl).mockReturnValue({ placeId: "ChIJfromUrl" });
    vi.mocked(fetchPlaceDetails).mockRejectedValue(new Error("503"));

    await expect(
      step3Tools.run(baseProspect, env, { d1: db }),
    ).rejects.toThrow(/place_id resolution failed/);

    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  test("reviews fetch failure on confirmed tick throws (email latch not set)", async () => {
    const confirmedProspect = {
      ...baseProspect,
      onboardingData: {
        ...baseOnboarding,
        tools: {
          ...baseOnboarding.tools,
          gbpPlaceIdPending: "ChIJfromUrl",
          gbpResolvedName: "Alex's Bakery",
          gbpResolvedAddress: "12 High St, Oxford OX1 4AB",
          gbpListingConfirmed: true,
        },
      },
    };
    vi.mocked(fetchPlaceDetails).mockRejectedValue(new Error("503"));

    await expect(
      step3Tools.run(confirmedProspect, env, { d1: db }),
    ).rejects.toThrow(/reviews fetch failed/);

    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });
});
