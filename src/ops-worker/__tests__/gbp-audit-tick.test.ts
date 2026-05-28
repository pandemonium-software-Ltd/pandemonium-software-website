import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ProspectRecord } from "../../lib/notion-prospects";

vi.mock("../../lib/env", () => ({
  getServerEnv: vi.fn(() => ({
    GOOGLE_PLACES_API_KEY: "test-places-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    NOTION_API_KEY: "test-notion",
    RESEND_API_KEY: "test-resend",
    ADMIN_PASSWORD: "test-password-long-enough",
  })),
}));

vi.mock("../../lib/notion-prospects", async (orig) => {
  const actual = await orig<typeof import("../../lib/notion-prospects")>();
  return {
    ...actual,
    listProspectsNeedingOps: vi.fn(),
  };
});

vi.mock("../../lib/google-places", () => ({
  fetchPlaceDetailsForAudit: vi.fn(),
  PlacesApiError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

vi.mock("../../lib/email", () => ({
  sendInternalNotification: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/haiku/client", () => ({
  HAIKU_MODEL: "claude-haiku-4-5",
  callHaiku: vi.fn(),
}));

import { listProspectsNeedingOps } from "../../lib/notion-prospects";
import { fetchPlaceDetailsForAudit } from "../../lib/google-places";
import { sendInternalNotification } from "../../lib/email";
import { callHaiku } from "../../lib/haiku/client";
import { getServerEnv } from "../../lib/env";
import { runGbpAuditTick } from "../gbp-audit-tick";

const baseProspect: ProspectRecord = {
  pageId: "page_test",
  token: "tok_test",
  name: "Alex Baker",
  email: "alex@example.com",
  business: "Alex's Bakery",
  businessType: "Baker",
  location: "Oxford",
  phone: "07700900123",
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
  cloudflareAccountId: "acc_test",
  onboardingData: {
    domain: { domain: "alexsbakery.co.uk" },
    tools: { gbpPlaceId: "ChIJtest123" },
    content: {
      services: [
        { name: "Wedding Cakes" },
        { name: "Sourdough Bread" },
      ],
    },
  },
  phase3Data: {
    businessBasics: { elevatorPitch: "Oxford's finest artisan bakery" },
    contactDetails: {
      address: "12 High St, Oxford OX1 4AB",
      serviceArea: "Oxfordshire",
    },
  },
  changeRequests: [],
  notionUrl: "",
  moduleChangeLog: [],
  onboardingContentDone: true,
};

const sampleAuditSnapshot = {
  rating: 4.8,
  totalReviews: 142,
  topReviews: [
    {
      authorName: "Sam Smith",
      rating: 5,
      text: "Great sourdough",
      relativeTimeDescription: "2 weeks ago",
    },
  ],
  displayName: "Alex's Bakery",
  formattedAddress: "12 High St, Oxford OX1 4AB",
  websiteUri: "https://alexsbakery.co.uk",
  nationalPhoneNumber: "07700 900123",
  primaryType: "bakery",
  types: ["bakery", "food"],
  editorialSummary: "Popular local bakery",
  regularOpeningHours: "Mon: 7am–5pm; Tue: 7am–5pm",
  photoCount: 8,
  googleMapsUri: "https://maps.google.com/?cid=123",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerEnv).mockReturnValue({
    GOOGLE_PLACES_API_KEY: "test-places-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    NOTION_API_KEY: "test-notion",
    RESEND_API_KEY: "test-resend",
    ADMIN_PASSWORD: "test-password-long-enough",
  } as ReturnType<typeof getServerEnv>);
  vi.mocked(listProspectsNeedingOps).mockResolvedValue([baseProspect]);
  vi.mocked(fetchPlaceDetailsForAudit).mockResolvedValue(sampleAuditSnapshot);
  vi.mocked(callHaiku).mockResolvedValue(
    "## Alex's Bakery — GBP Audit\n\n### Score: 8/10\n\nLooks great!",
  );
});

describe("runGbpAuditTick", () => {
  test("skips on non-Monday", async () => {
    const tuesday = new Date("2026-06-02T02:30:00Z"); // Tuesday
    vi.setSystemTime(tuesday);

    await runGbpAuditTick();

    expect(listProspectsNeedingOps).not.toHaveBeenCalled();
    expect(sendInternalNotification).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  test("runs full audit on Monday", async () => {
    const monday = new Date("2026-06-01T02:30:00Z"); // Monday
    vi.setSystemTime(monday);

    await runGbpAuditTick();

    expect(fetchPlaceDetailsForAudit).toHaveBeenCalledWith(
      "ChIJtest123",
      "test-places-key",
    );
    expect(callHaiku).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 1500,
        system: expect.stringContaining("Google Business Profile"),
        prompt: expect.stringContaining("Alex's Bakery"),
      }),
    );
    expect(sendInternalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Weekly GBP Audit"),
        body: expect.stringContaining("Score: 8/10"),
      }),
    );

    vi.useRealTimers();
  });

  test("skips prospects without gbpPlaceId", async () => {
    const monday = new Date("2026-06-01T02:30:00Z");
    vi.setSystemTime(monday);

    vi.mocked(listProspectsNeedingOps).mockResolvedValue([
      {
        ...baseProspect,
        onboardingData: { tools: {} },
      },
    ]);

    await runGbpAuditTick();

    expect(fetchPlaceDetailsForAudit).not.toHaveBeenCalled();
    expect(sendInternalNotification).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  test("skips prospects without GBP module", async () => {
    const monday = new Date("2026-06-01T02:30:00Z");
    vi.setSystemTime(monday);

    vi.mocked(listProspectsNeedingOps).mockResolvedValue([
      { ...baseProspect, moduleSelections: ["Online Booking"] },
    ]);

    await runGbpAuditTick();

    expect(fetchPlaceDetailsForAudit).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  test("falls back to snapshot when Claude returns null", async () => {
    const monday = new Date("2026-06-01T02:30:00Z");
    vi.setSystemTime(monday);
    vi.mocked(callHaiku).mockResolvedValue(null);

    await runGbpAuditTick();

    expect(sendInternalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Claude returned no audit"),
      }),
    );

    vi.useRealTimers();
  });

  test("per-customer Places API failure doesn't kill the loop", async () => {
    const monday = new Date("2026-06-01T02:30:00Z");
    vi.setSystemTime(monday);

    const second = {
      ...baseProspect,
      pageId: "page_2",
      name: "Bob Builder",
      business: "Bob's Plumbing",
      onboardingData: {
        tools: { gbpPlaceId: "ChIJtest456" },
      },
    };
    vi.mocked(listProspectsNeedingOps).mockResolvedValue([
      baseProspect,
      second,
    ]);
    vi.mocked(fetchPlaceDetailsForAudit)
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce(sampleAuditSnapshot);

    await runGbpAuditTick();

    // Single email with both customers — one failed, one succeeded
    const call = vi.mocked(sendInternalNotification).mock.calls[0][0];
    expect(call.body).toContain("Audit failed:");
    expect(call.body).toContain("Score: 8/10");

    vi.useRealTimers();
  });

  test("skips when GOOGLE_PLACES_API_KEY not set", async () => {
    const monday = new Date("2026-06-01T02:30:00Z");
    vi.setSystemTime(monday);
    vi.mocked(getServerEnv).mockReturnValue({
      GOOGLE_PLACES_API_KEY: undefined,
      ANTHROPIC_API_KEY: "test",
    } as ReturnType<typeof getServerEnv>);

    await runGbpAuditTick();

    expect(listProspectsNeedingOps).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  test("skips when ANTHROPIC_API_KEY not set", async () => {
    const monday = new Date("2026-06-01T02:30:00Z");
    vi.setSystemTime(monday);
    vi.mocked(getServerEnv).mockReturnValue({
      GOOGLE_PLACES_API_KEY: "test",
      ANTHROPIC_API_KEY: undefined,
    } as ReturnType<typeof getServerEnv>);

    await runGbpAuditTick();

    expect(listProspectsNeedingOps).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  test("includes intake data in Claude prompt", async () => {
    const monday = new Date("2026-06-01T02:30:00Z");
    vi.setSystemTime(monday);

    await runGbpAuditTick();

    const haikuCall = vi.mocked(callHaiku).mock.calls[0][0];
    expect(haikuCall.prompt).toContain("Oxford's finest artisan bakery");
    expect(haikuCall.prompt).toContain("Wedding Cakes");
    expect(haikuCall.prompt).toContain("Sourdough Bread");
    expect(haikuCall.prompt).toContain("alexsbakery.co.uk");
    expect(haikuCall.prompt).toContain("Oxfordshire");

    vi.useRealTimers();
  });
});
