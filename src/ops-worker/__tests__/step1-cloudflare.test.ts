// Step 1 (Cloudflare membership accept) tests.
//
// Mocks the cloudflare.ts module's exports so we can assert the
// step's branching logic without hitting the real Cloudflare API.
// Also mocks the Notion writer so no actual Notion writes happen
// during tests.

import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ProspectRecord } from "../../lib/notion-prospects";
import type { ServerEnv } from "../../lib/env";

// vi.mock must be at module top before importing the SUT.
vi.mock("../../lib/cloudflare", () => ({
  listMemberships: vi.fn(),
  acceptMembership: vi.fn(),
  listAccounts: vi.fn(),
  CloudflareApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("../../lib/notion-prospects", async (orig) => {
  const actual = await orig<typeof import("../../lib/notion-prospects")>();
  return {
    ...actual,
    recordCloudflareMembership: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  listMemberships,
  acceptMembership,
  listAccounts,
} from "../../lib/cloudflare";
import { recordCloudflareMembership } from "../../lib/notion-prospects";
import { step1Cloudflare } from "../steps/step1-cloudflare";

const baseProspect: ProspectRecord = {
  pageId: "page_test",
  token: "tok_test",
  name: "Test Customer",
  email: "test@example.com",
  status: "Onboarding Started",
  softBlockersTriggered: [],
  moduleSelections: [],
  foundingMember: false,
  onboardingStep1Done: true,
  onboardingStep2Done: false,
  onboardingStep3Done: false,
  onboardingStep4Done: false,
  onboardingStep5Done: false,
  onboardingData: { cloudflare: { cloudflareEmail: "alex@bakery.co.uk" } },
  changeRequests: [],
  notionUrl: "",
};

const env = {
  BEN_CLOUDFLARE_API_TOKEN: "test-cf-token",
  NOTION_API_KEY: "test-notion-key",
  RESEND_API_KEY: "test-resend-key",
} as unknown as ServerEnv;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("step1Cloudflare.shouldRun", () => {
  test("true when Step 1 done and not yet verified", () => {
    expect(step1Cloudflare.shouldRun(baseProspect)).toBe(true);
  });

  test("false when Step 1 not done", () => {
    expect(
      step1Cloudflare.shouldRun({
        ...baseProspect,
        onboardingStep1Done: false,
      }),
    ).toBe(false);
  });

  test("false when already verified (idempotency)", () => {
    expect(
      step1Cloudflare.shouldRun({
        ...baseProspect,
        cloudflareMembershipVerifiedAt: "2026-05-09T10:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("step1Cloudflare.run", () => {
  test("skips when BEN_CLOUDFLARE_API_TOKEN not set", async () => {
    const result = await step1Cloudflare.run(baseProspect, {
      ...env,
      BEN_CLOUDFLARE_API_TOKEN: undefined as unknown as string,
    });
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toContain("BEN_CLOUDFLARE_API_TOKEN");
    }
    expect(listMemberships).not.toHaveBeenCalled();
  });

  test("skips when cloudflareEmail not yet captured in onboardingData", async () => {
    const result = await step1Cloudflare.run(
      { ...baseProspect, onboardingData: {} },
      env,
    );
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toContain("Cloudflare email");
    }
    expect(listMemberships).not.toHaveBeenCalled();
  });

  test("skips when no pending memberships (customer hasn't invited yet)", async () => {
    vi.mocked(listMemberships).mockResolvedValue([]);

    const result = await step1Cloudflare.run(baseProspect, env);

    expect(listMemberships).toHaveBeenCalledWith("pending");
    expect(acceptMembership).not.toHaveBeenCalled();
    expect(recordCloudflareMembership).not.toHaveBeenCalled();
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toContain("No pending Cloudflare memberships");
    }
  });

  test("accepts the membership when exactly one pending + records to Notion + confirms via /accounts", async () => {
    vi.mocked(listMemberships).mockResolvedValue([
      {
        id: "mem_abc",
        status: "pending",
        account: { id: "acc_xyz", name: "Bakery Account" },
      },
    ]);
    vi.mocked(acceptMembership).mockResolvedValue({
      id: "mem_abc",
      status: "accepted",
      account: { id: "acc_xyz", name: "Bakery Account" },
    });
    vi.mocked(listAccounts).mockResolvedValue([
      { id: "acc_xyz", name: "Bakery Account" },
    ]);

    const result = await step1Cloudflare.run(baseProspect, env);

    expect(acceptMembership).toHaveBeenCalledWith("mem_abc");
    expect(listAccounts).toHaveBeenCalled();
    expect(recordCloudflareMembership).toHaveBeenCalledWith(
      "page_test",
      "acc_xyz",
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("confirmed in /accounts");
    }
  });

  test("accepts even if /accounts list doesn't yet show the account (propagation lag)", async () => {
    vi.mocked(listMemberships).mockResolvedValue([
      {
        id: "mem_abc",
        status: "pending",
        account: { id: "acc_xyz", name: "Bakery Account" },
      },
    ]);
    vi.mocked(acceptMembership).mockResolvedValue({
      id: "mem_abc",
      status: "accepted",
      account: { id: "acc_xyz", name: "Bakery Account" },
    });
    vi.mocked(listAccounts).mockResolvedValue([]); // not yet propagated

    const result = await step1Cloudflare.run(baseProspect, env);

    expect(recordCloudflareMembership).toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("not yet visible in /accounts");
    }
  });

  test("still records membership when /accounts call itself throws (network blip)", async () => {
    vi.mocked(listMemberships).mockResolvedValue([
      {
        id: "mem_abc",
        status: "pending",
        account: { id: "acc_xyz", name: "Bakery Account" },
      },
    ]);
    vi.mocked(acceptMembership).mockResolvedValue({
      id: "mem_abc",
      status: "accepted",
      account: { id: "acc_xyz", name: "Bakery Account" },
    });
    vi.mocked(listAccounts).mockRejectedValue(new Error("network blip"));

    const result = await step1Cloudflare.run(baseProspect, env);

    // Notion still gets stamped — we know the membership succeeded.
    expect(recordCloudflareMembership).toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("not yet visible in /accounts");
    }
  });

  test("throws when multiple pending memberships exist (Ben must disambiguate)", async () => {
    vi.mocked(listMemberships).mockResolvedValue([
      {
        id: "mem_abc",
        status: "pending",
        account: { id: "acc_xyz", name: "Bakery Account" },
      },
      {
        id: "mem_def",
        status: "pending",
        account: { id: "acc_uvw", name: "Plumber Account" },
      },
    ]);

    await expect(step1Cloudflare.run(baseProspect, env)).rejects.toThrow(
      /2 pending Cloudflare memberships/,
    );
    expect(acceptMembership).not.toHaveBeenCalled();
    expect(recordCloudflareMembership).not.toHaveBeenCalled();
  });

  test("throws on listMemberships API failure", async () => {
    vi.mocked(listMemberships).mockRejectedValue(
      new Error("403 Authentication failure"),
    );

    await expect(step1Cloudflare.run(baseProspect, env)).rejects.toThrow(
      /listMemberships.*403/,
    );
  });

  test("throws on acceptMembership API failure", async () => {
    vi.mocked(listMemberships).mockResolvedValue([
      {
        id: "mem_abc",
        status: "pending",
        account: { id: "acc_xyz", name: "Bakery Account" },
      },
    ]);
    vi.mocked(acceptMembership).mockRejectedValue(
      new Error("400 Membership already in terminal state"),
    );

    await expect(step1Cloudflare.run(baseProspect, env)).rejects.toThrow(
      /acceptMembership.*Membership already in terminal state/,
    );
  });
});
