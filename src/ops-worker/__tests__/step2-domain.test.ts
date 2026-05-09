// Step 2 (zone create + nameservers email + status poll) tests.
//
// All external deps mocked: Cloudflare REST client, Notion writers,
// and the customer-email send. Nine branch tests cover every
// transition in the state machine (zone create vs discover vs
// already-known, nameservers email latch, activation email latch,
// shouldRun gating).

import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ProspectRecord } from "../../lib/notion-prospects";
import type { ServerEnv } from "../../lib/env";
import type { Zone } from "../../lib/cloudflare";

vi.mock("../../lib/cloudflare", () => ({
  listZones: vi.fn(),
  createZone: vi.fn(),
  getZone: vi.fn(),
  uploadWorkerScript: vi.fn(),
  listWorkerCustomDomains: vi.fn(),
  createWorkerCustomDomain: vi.fn(),
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
    recordCloudflareZone: vi.fn().mockResolvedValue(undefined),
    updateZoneStatus: vi.fn().mockResolvedValue(undefined),
    markDomainVerified: vi.fn().mockResolvedValue(undefined),
    markNameserversEmailed: vi.fn().mockResolvedValue(undefined),
    recordWorkerName: vi.fn().mockResolvedValue(undefined),
    markSiteLive: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../notify", () => ({
  sendCustomerEmail: vi.fn().mockResolvedValue({ messageId: "msg_test" }),
}));

import {
  listZones,
  createZone,
  getZone,
  uploadWorkerScript,
  listWorkerCustomDomains,
  createWorkerCustomDomain,
} from "../../lib/cloudflare";
import {
  recordCloudflareZone,
  updateZoneStatus,
  markDomainVerified,
  markNameserversEmailed,
  recordWorkerName,
  markSiteLive,
} from "../../lib/notion-prospects";
import { sendCustomerEmail } from "../notify";
import { step2Domain } from "../steps/step2-domain";

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
  onboardingStep2Done: true,
  onboardingStep3Done: false,
  onboardingStep4Done: false,
  onboardingStep5Done: false,
  cloudflareAccountId: "acc_test",
  onboardingData: {
    domain: { domain: "test.co.uk", registrar: "external" },
  },
  changeRequests: [],
  notionUrl: "",
};

const env = {
  BEN_CLOUDFLARE_API_TOKEN: "test-cf-token",
  RESEND_API_KEY: "test-resend-key",
  NOTION_API_KEY: "test-notion-key",
} as unknown as ServerEnv;

const zonePending: Zone = {
  id: "zone_pending",
  name: "test.co.uk",
  status: "pending",
  name_servers: ["aron.ns.cloudflare.com", "nina.ns.cloudflare.com"],
  account: { id: "acc_test", name: "Test Account" },
};

const zoneActive: Zone = { ...zonePending, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // Sensible defaults for the new C2.3 mocks so older tests (which
  // don't care about phase D/E/F) don't accidentally trigger errors
  // when those phases run with default-undefined returns.
  vi.mocked(uploadWorkerScript).mockResolvedValue({ id: "script_default" });
  vi.mocked(listWorkerCustomDomains).mockResolvedValue([]);
  vi.mocked(createWorkerCustomDomain).mockResolvedValue({
    id: "dom_default",
    hostname: "default.example.com",
    service: "mf-default",
    zone_id: "zone_default",
    zone_name: "default.example.com",
    environment: "production",
    status: "pending", // pending = phase F won't trigger
  });
  // Default fetch mock so phase F never accidentally hits the real
  // network (which would 5s timeout on test.co.uk). Tests that care
  // about specific HTTP status codes override with their own spy.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 200 }),
  );
});

describe("step2Domain.shouldRun", () => {
  test("true when Step 2 done + acc id + zone not active", () => {
    expect(step2Domain.shouldRun(baseProspect)).toBe(true);
  });

  test("false when Step 2 not done", () => {
    expect(
      step2Domain.shouldRun({ ...baseProspect, onboardingStep2Done: false }),
    ).toBe(false);
  });

  test("false when no Cloudflare account id (step1 not run yet)", () => {
    expect(
      step2Domain.shouldRun({
        ...baseProspect,
        cloudflareAccountId: undefined,
      }),
    ).toBe(false);
  });

  test("true when zone active but activation email not yet sent (latch)", () => {
    expect(
      step2Domain.shouldRun({
        ...baseProspect,
        cloudflareZoneStatus: "active",
        // domainVerifiedAt unset = activation email still owed
      }),
    ).toBe(true);
  });

  test("true when domain verified but Worker not yet uploaded (C2.3 latch)", () => {
    expect(
      step2Domain.shouldRun({
        ...baseProspect,
        cloudflareZoneStatus: "active",
        domainVerifiedAt: "2026-05-09T10:00:00Z",
      }),
    ).toBe(true);
  });

  test("true when Worker uploaded but site not yet verified (Site Live At latch)", () => {
    expect(
      step2Domain.shouldRun({
        ...baseProspect,
        cloudflareZoneStatus: "active",
        domainVerifiedAt: "2026-05-09T10:00:00Z",
        workerName: "mf-d2f42fb6",
      }),
    ).toBe(true);
  });

  test("false when fully done (zone active + verified + Worker + site live)", () => {
    expect(
      step2Domain.shouldRun({
        ...baseProspect,
        cloudflareZoneStatus: "active",
        domainVerifiedAt: "2026-05-09T10:00:00Z",
        workerName: "mf-d2f42fb6",
        siteLiveAt: "2026-05-09T11:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("step2Domain.run — skip paths", () => {
  test("skips when BEN_CLOUDFLARE_API_TOKEN missing", async () => {
    const result = await step2Domain.run(baseProspect, {
      ...env,
      BEN_CLOUDFLARE_API_TOKEN: undefined as unknown as string,
    });
    expect(result.status).toBe("skip");
    expect(listZones).not.toHaveBeenCalled();
  });

  test("skips when domain config not yet entered", async () => {
    const result = await step2Domain.run(
      { ...baseProspect, onboardingData: {} },
      env,
    );
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toContain("domain + registrar");
    }
  });

  test("skips when registrar value is invalid", async () => {
    const result = await step2Domain.run(
      {
        ...baseProspect,
        onboardingData: {
          domain: { domain: "test.co.uk", registrar: "bogus" },
        },
      },
      env,
    );
    expect(result.status).toBe("skip");
  });
});

describe("step2Domain.run — first-tick happy path (external registrar)", () => {
  test("creates zone + records to Notion + sends nameservers email", async () => {
    vi.mocked(listZones).mockResolvedValue([]);
    vi.mocked(createZone).mockResolvedValue(zonePending);

    const result = await step2Domain.run(baseProspect, env);

    expect(listZones).toHaveBeenCalledWith({
      accountId: "acc_test",
      name: "test.co.uk",
    });
    expect(createZone).toHaveBeenCalledWith("acc_test", "test.co.uk");
    expect(recordCloudflareZone).toHaveBeenCalledWith(
      "page_test",
      "zone_pending",
      "pending",
    );
    expect(sendCustomerEmail).toHaveBeenCalledWith(
      env,
      baseProspect.email,
      "domain-nameservers-pending",
      expect.objectContaining({
        customerName: "Test Customer",
        domain: "test.co.uk",
        ns1: "aron.ns.cloudflare.com",
        ns2: "nina.ns.cloudflare.com",
        confirmUrl: expect.stringContaining(
          "/api/onboarding/dns-confirm/tok_test",
        ),
      }),
    );
    expect(markNameserversEmailed).toHaveBeenCalledWith("page_test");
    expect(markDomainVerified).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("created zone zone_pending");
      expect(result.notes).toContain("sent nameservers email");
    }
  });

  test("uses existing zone if one already exists in customer's account (idempotency)", async () => {
    vi.mocked(listZones).mockResolvedValue([zonePending]);

    const result = await step2Domain.run(baseProspect, env);

    expect(createZone).not.toHaveBeenCalled();
    expect(recordCloudflareZone).toHaveBeenCalledWith(
      "page_test",
      "zone_pending",
      "pending",
    );
    expect(sendCustomerEmail).toHaveBeenCalled(); // still send NS email if not yet sent
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("discovered zone zone_pending");
    }
  });
});

describe("step2Domain.run — nameservers email latch", () => {
  test("does NOT resend nameservers email if already sent", async () => {
    vi.mocked(listZones).mockResolvedValue([zonePending]);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
      },
      env,
    );

    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect(markNameserversEmailed).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  test("does NOT send nameservers email for cloudflare-registered domains", async () => {
    vi.mocked(listZones).mockResolvedValue([zonePending]);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        onboardingData: {
          domain: { domain: "test.co.uk", registrar: "cloudflare" },
        },
      },
      env,
    );

    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

describe("step2Domain.run — subsequent-tick polling", () => {
  test("uses getZone (not list+create) when zone id already in Notion", async () => {
    vi.mocked(getZone).mockResolvedValue(zonePending);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        cloudflareZoneId: "zone_pending",
        cloudflareZoneStatus: "pending",
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
      },
      env,
    );

    expect(getZone).toHaveBeenCalledWith("zone_pending");
    expect(listZones).not.toHaveBeenCalled();
    expect(createZone).not.toHaveBeenCalled();
    expect(recordCloudflareZone).not.toHaveBeenCalled();
    expect(updateZoneStatus).not.toHaveBeenCalled(); // status unchanged
    expect(result.status).toBe("ok");
  });

  test("syncs status to Notion when status changes between ticks", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        cloudflareZoneId: "zone_pending",
        cloudflareZoneStatus: "pending",
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
      },
      env,
    );

    expect(updateZoneStatus).toHaveBeenCalledWith("page_test", "active");
    expect(result.status).toBe("ok");
  });
});

describe("step2Domain.run — activation email", () => {
  test("sends activation email when status flips to active (latch)", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        cloudflareZoneId: "zone_pending",
        cloudflareZoneStatus: "pending",
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
      },
      env,
    );

    expect(sendCustomerEmail).toHaveBeenCalledWith(
      env,
      "test@example.com",
      "domain-zone-active",
      { customerName: "Test Customer", domain: "test.co.uk" },
    );
    expect(markDomainVerified).toHaveBeenCalledWith("page_test");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("sent activation email");
    }
  });

  test("does NOT resend activation email when latch already set", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        cloudflareZoneId: "zone_pending",
        cloudflareZoneStatus: "active",
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
        domainVerifiedAt: "2026-05-09T11:00:00Z",
      },
      env,
    );

    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect(markDomainVerified).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

describe("step2Domain.run — error paths", () => {
  test("throws when listZones API fails", async () => {
    vi.mocked(listZones).mockRejectedValue(new Error("403 perms"));
    await expect(step2Domain.run(baseProspect, env)).rejects.toThrow(
      /listZones failed: 403 perms/,
    );
  });

  test("throws when createZone API fails", async () => {
    vi.mocked(listZones).mockResolvedValue([]);
    vi.mocked(createZone).mockRejectedValue(
      new Error("1061 Zone already exists"),
    );
    await expect(step2Domain.run(baseProspect, env)).rejects.toThrow(
      /createZone failed: 1061/,
    );
  });

  test("throws when CF returns zone without nameservers (defensive)", async () => {
    vi.mocked(listZones).mockResolvedValue([]);
    vi.mocked(createZone).mockResolvedValue({
      ...zonePending,
      name_servers: [],
    });
    await expect(step2Domain.run(baseProspect, env)).rejects.toThrow(
      /without 2 nameservers/,
    );
  });
});

// ---------- C2.3 Worker provisioning + Custom Domain bind + verify ----------

describe("step2Domain.run — phase D: upload placeholder Worker", () => {
  test("uploads Worker after zone is active + records name", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(uploadWorkerScript).mockResolvedValue({ id: "script_test" });
    vi.mocked(listWorkerCustomDomains).mockResolvedValue([]);
    vi.mocked(createWorkerCustomDomain).mockResolvedValue({
      id: "dom_apex",
      hostname: "test.co.uk",
      service: "mf-tokte",
      zone_id: "zone_pending",
      zone_name: "test.co.uk",
      environment: "production",
      status: "pending",
    });

    const result = await step2Domain.run(
      {
        ...baseProspect,
        token: "tok_test_uuid",
        cloudflareZoneId: "zone_pending",
        cloudflareZoneStatus: "active",
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
        domainVerifiedAt: "2026-05-09T10:30:00Z",
      },
      env,
    );

    expect(uploadWorkerScript).toHaveBeenCalledWith(
      "acc_test",
      expect.stringMatching(/^mf-/),
      expect.stringContaining("export default"),
    );
    expect(recordWorkerName).toHaveBeenCalledWith(
      "page_test",
      expect.stringMatching(/^mf-/),
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("uploaded Worker");
    }
  });

  test("does NOT upload Worker if zone not yet active", async () => {
    vi.mocked(getZone).mockResolvedValue(zonePending);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        cloudflareZoneId: "zone_pending",
        cloudflareZoneStatus: "pending",
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
      },
      env,
    );

    expect(uploadWorkerScript).not.toHaveBeenCalled();
    expect(recordWorkerName).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  test("does NOT re-upload Worker if name already recorded (idempotency)", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockResolvedValue([]);
    vi.mocked(createWorkerCustomDomain).mockResolvedValue({
      id: "dom_apex",
      hostname: "test.co.uk",
      service: "mf-tokte",
      zone_id: "zone_pending",
      zone_name: "test.co.uk",
      environment: "production",
      status: "active",
    });

    const result = await step2Domain.run(
      {
        ...baseProspect,
        token: "tok_test_uuid",
        cloudflareZoneId: "zone_pending",
        cloudflareZoneStatus: "active",
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
        domainVerifiedAt: "2026-05-09T10:30:00Z",
        workerName: "mf-tokte",
      },
      env,
    );

    expect(uploadWorkerScript).not.toHaveBeenCalled();
    expect(recordWorkerName).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  test("throws if uploadWorkerScript API fails", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(uploadWorkerScript).mockRejectedValue(
      new Error("10000 Authentication error"),
    );

    await expect(
      step2Domain.run(
        {
          ...baseProspect,
          token: "tok_test_uuid",
          cloudflareZoneId: "zone_pending",
          cloudflareZoneStatus: "active",
          nameserversEmailSentAt: "2026-05-09T10:00:00Z",
          domainVerifiedAt: "2026-05-09T10:30:00Z",
        },
        env,
      ),
    ).rejects.toThrow(/uploadWorkerScript.*Authentication error/);
  });
});

describe("step2Domain.run — phase E: bind apex + www", () => {
  const readyProspect = {
    ...baseProspect,
    token: "tok_test_uuid",
    cloudflareZoneId: "zone_pending",
    cloudflareZoneStatus: "active" as const,
    nameserversEmailSentAt: "2026-05-09T10:00:00Z",
    domainVerifiedAt: "2026-05-09T10:30:00Z",
    workerName: "mf-tokte",
  };

  test("binds apex + www when neither exists yet", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockResolvedValue([]);
    vi.mocked(createWorkerCustomDomain).mockResolvedValue({
      id: "dom_test",
      hostname: "test.co.uk",
      service: "mf-tokte",
      zone_id: "zone_pending",
      zone_name: "test.co.uk",
      environment: "production",
      status: "pending",
    });

    const result = await step2Domain.run(readyProspect, env);

    expect(listWorkerCustomDomains).toHaveBeenCalledWith(
      "acc_test",
      "test.co.uk",
    );
    expect(listWorkerCustomDomains).toHaveBeenCalledWith(
      "acc_test",
      "www.test.co.uk",
    );
    expect(createWorkerCustomDomain).toHaveBeenCalledWith(
      "acc_test",
      expect.objectContaining({ hostname: "test.co.uk", service: "mf-tokte" }),
    );
    expect(createWorkerCustomDomain).toHaveBeenCalledWith(
      "acc_test",
      expect.objectContaining({ hostname: "www.test.co.uk", service: "mf-tokte" }),
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("bound test.co.uk");
      expect(result.notes).toContain("bound www.test.co.uk");
    }
  });

  test("does NOT re-bind hostnames that already exist", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockImplementation(async (_acc, host) => [
      {
        id: `dom_${host}`,
        hostname: host!,
        service: "mf-tokte",
        zone_id: "zone_pending",
        zone_name: "test.co.uk",
        environment: "production",
        status: "active",
      },
    ]);

    const result = await step2Domain.run(readyProspect, env);

    expect(createWorkerCustomDomain).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

describe("step2Domain.run — phase F: HTTP 200 verify", () => {
  const verifyProspect = {
    ...baseProspect,
    token: "tok_test_uuid",
    cloudflareZoneId: "zone_pending",
    cloudflareZoneStatus: "active" as const,
    nameserversEmailSentAt: "2026-05-09T10:00:00Z",
    domainVerifiedAt: "2026-05-09T10:30:00Z",
    workerName: "mf-tokte",
  };

  test("marks site live on 200 OK from apex", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockImplementation(async (_acc, host) => [
      {
        id: `dom_${host}`,
        hostname: host!,
        service: "mf-tokte",
        zone_id: "zone_pending",
        zone_name: "test.co.uk",
        environment: "production",
        status: "active",
      },
    ]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const result = await step2Domain.run(verifyProspect, env);

    expect(fetchSpy).toHaveBeenCalledWith("https://test.co.uk/", {
      redirect: "manual",
    });
    expect(markSiteLive).toHaveBeenCalledWith("page_test");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("site verified live");
    }
    fetchSpy.mockRestore();
  });

  test("does NOT mark site live on 5xx (TLS not ready); will retry", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockImplementation(async (_acc, host) => [
      {
        id: `dom_${host}`,
        hostname: host!,
        service: "mf-tokte",
        zone_id: "zone_pending",
        zone_name: "test.co.uk",
        environment: "production",
        status: "active",
      },
    ]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 525 }));

    const result = await step2Domain.run(verifyProspect, env);

    expect(markSiteLive).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("HTTP 525");
    }
    fetchSpy.mockRestore();
  });

  test("does NOT verify if any binding still pending TLS", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockImplementation(async (_acc, host) => [
      {
        id: `dom_${host}`,
        hostname: host!,
        service: "mf-tokte",
        zone_id: "zone_pending",
        zone_name: "test.co.uk",
        environment: "production",
        status: "pending", // not yet active
      },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await step2Domain.run(verifyProspect, env);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(markSiteLive).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    fetchSpy.mockRestore();
  });

  test("does NOT verify if siteLiveAt latch already set (idempotency)", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockImplementation(async (_acc, host) => [
      {
        id: `dom_${host}`,
        hostname: host!,
        service: "mf-tokte",
        zone_id: "zone_pending",
        zone_name: "test.co.uk",
        environment: "production",
        status: "active",
      },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await step2Domain.run(
      { ...verifyProspect, siteLiveAt: "2026-05-09T11:00:00Z" },
      env,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(markSiteLive).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    fetchSpy.mockRestore();
  });

  test("does NOT throw on fetch network error; logs in notes for next-tick retry", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listWorkerCustomDomains).mockImplementation(async (_acc, host) => [
      {
        id: `dom_${host}`,
        hostname: host!,
        service: "mf-tokte",
        zone_id: "zone_pending",
        zone_name: "test.co.uk",
        environment: "production",
        status: "active",
      },
    ]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("DNS lookup failed"));

    const result = await step2Domain.run(verifyProspect, env);

    expect(markSiteLive).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("threw");
    }
    fetchSpy.mockRestore();
  });
});
