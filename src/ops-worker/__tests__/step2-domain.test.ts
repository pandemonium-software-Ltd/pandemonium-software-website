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
  listDnsRecords: vi.fn(),
  createDnsRecord: vi.fn(),
  listWorkerRoutes: vi.fn(),
  createWorkerRoute: vi.fn(),
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
  listDnsRecords,
  createDnsRecord,
  listWorkerRoutes,
  createWorkerRoute,
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
  moduleChangeLog: [],
  onboardingContentDone: false,
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
  // DNS + Worker Routes defaults (post-10405 workaround):
  //   - listDnsRecords / listWorkerRoutes return [] so phase E creates
  //     the record + route on first tick. Tests that need
  //     already-exists behaviour override per-test.
  //   - createDnsRecord / createWorkerRoute return minimal shapes
  //     (we only check call args, not return values).
  vi.mocked(listDnsRecords).mockResolvedValue([]);
  vi.mocked(createDnsRecord).mockResolvedValue({
    id: "dns_default",
    type: "A",
    name: "default.example.com",
    content: "192.0.2.1",
    proxied: true,
  });
  vi.mocked(listWorkerRoutes).mockResolvedValue([]);
  vi.mocked(createWorkerRoute).mockResolvedValue({
    id: "route_default",
    pattern: "default.example.com/*",
    script: "mf-default",
  });
  // Default fetch mock so phase F never accidentally hits the real
  // network (which would 5s timeout on test.co.uk). Tests that care
  // about specific HTTP status codes override with their own spy.
  // Use 525 by default — phase F runs unconditionally now (no
  // per-binding pending status), so most tests without explicit
  // phase F setup should NOT mark site live by accident.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 525 }),
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
        hubUrl: expect.stringContaining("/onboarding/tok_test"),
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

  test("sends domain-no-action-needed (not nameservers-pending, not activation) for cloudflare registrar", async () => {
    vi.mocked(listZones).mockResolvedValue([zoneActive]);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        onboardingData: {
          domain: { domain: "test.co.uk", registrar: "cloudflare" },
        },
      },
      env,
    );

    // Exactly one customer email — no-action — and section C's
    // activation email is suppressed so the customer doesn't get
    // two domain emails in a row.
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    expect(sendCustomerEmail).toHaveBeenCalledWith(
      env,
      baseProspect.email,
      "domain-no-action-needed",
      expect.objectContaining({
        customerName: "Test Customer",
        domain: "test.co.uk",
      }),
    );
    expect(markNameserversEmailed).toHaveBeenCalledWith("page_test");
    expect(markDomainVerified).toHaveBeenCalledWith("page_test");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("sent no-action-needed email");
      expect(result.notes).not.toContain("sent activation email");
    }
  });

  test("sends domain-no-action-needed for already-have when zone is instantly active (NS already point at CF)", async () => {
    vi.mocked(listZones).mockResolvedValue([zoneActive]);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        onboardingData: {
          domain: { domain: "test.co.uk", registrar: "already-have" },
        },
      },
      env,
    );

    expect(sendCustomerEmail).toHaveBeenCalledWith(
      env,
      baseProspect.email,
      "domain-no-action-needed",
      expect.objectContaining({ domain: "test.co.uk" }),
    );
    expect(markNameserversEmailed).toHaveBeenCalledWith("page_test");
    expect(result.status).toBe("ok");
  });

  test("sends domain-nameservers-pending for already-have when zone is still pending (NS need swapping)", async () => {
    vi.mocked(listZones).mockResolvedValue([zonePending]);

    const result = await step2Domain.run(
      {
        ...baseProspect,
        onboardingData: {
          domain: { domain: "test.co.uk", registrar: "already-have" },
        },
      },
      env,
    );

    expect(sendCustomerEmail).toHaveBeenCalledWith(
      env,
      baseProspect.email,
      "domain-nameservers-pending",
      expect.objectContaining({
        ns1: "aron.ns.cloudflare.com",
        ns2: "nina.ns.cloudflare.com",
        hubUrl: expect.stringContaining("/onboarding/tok_test"),
      }),
    );
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
    // Phase E defaults from beforeEach (empty list → create) work fine
    // here; this test only asserts on phase D.

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
    // Phase E defaults from beforeEach are fine; this test only
    // asserts that phase D is skipped when workerName is already set.

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

describe("step2Domain.run — phase E: DNS + Worker Routes (apex + www)", () => {
  const readyProspect = {
    ...baseProspect,
    token: "tok_test_uuid",
    cloudflareZoneId: "zone_pending",
    cloudflareZoneStatus: "active" as const,
    nameserversEmailSentAt: "2026-05-09T10:00:00Z",
    domainVerifiedAt: "2026-05-09T10:30:00Z",
    workerName: "mf-tokte",
  };

  test("creates A record + Worker route for apex and www when neither exists", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    // Defaults from beforeEach return empty lists → create both.

    const result = await step2Domain.run(readyProspect, env);

    expect(listDnsRecords).toHaveBeenCalledWith("zone_pending", {
      name: "test.co.uk",
      type: "A",
    });
    expect(listDnsRecords).toHaveBeenCalledWith("zone_pending", {
      name: "www.test.co.uk",
      type: "A",
    });
    expect(createDnsRecord).toHaveBeenCalledWith(
      "zone_pending",
      expect.objectContaining({
        type: "A",
        name: "test.co.uk",
        content: "192.0.2.1",
        proxied: true,
      }),
    );
    expect(createDnsRecord).toHaveBeenCalledWith(
      "zone_pending",
      expect.objectContaining({
        type: "A",
        name: "www.test.co.uk",
        content: "192.0.2.1",
        proxied: true,
      }),
    );
    expect(listWorkerRoutes).toHaveBeenCalledWith(
      "zone_pending",
      "test.co.uk/*",
    );
    expect(listWorkerRoutes).toHaveBeenCalledWith(
      "zone_pending",
      "www.test.co.uk/*",
    );
    expect(createWorkerRoute).toHaveBeenCalledWith("zone_pending", {
      pattern: "test.co.uk/*",
      script: "mf-tokte",
    });
    expect(createWorkerRoute).toHaveBeenCalledWith("zone_pending", {
      pattern: "www.test.co.uk/*",
      script: "mf-tokte",
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.notes).toContain("created A record test.co.uk");
      expect(result.notes).toContain("created A record www.test.co.uk");
      expect(result.notes).toContain("bound test.co.uk/* → mf-tokte");
      expect(result.notes).toContain("bound www.test.co.uk/* → mf-tokte");
    }
  });

  test("does NOT recreate DNS or route when both already exist (idempotency)", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listDnsRecords).mockImplementation(async (_zone, opts) => [
      {
        id: `dns_${opts!.name}`,
        type: "A",
        name: opts!.name!,
        content: "192.0.2.1",
        proxied: true,
      },
    ]);
    vi.mocked(listWorkerRoutes).mockImplementation(async (_zone, pattern) => [
      {
        id: `route_${pattern}`,
        pattern: pattern!,
        script: "mf-tokte",
      },
    ]);

    const result = await step2Domain.run(readyProspect, env);

    expect(createDnsRecord).not.toHaveBeenCalled();
    expect(createWorkerRoute).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  test("creates only the missing leg when DNS exists but route does not", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listDnsRecords).mockImplementation(async (_zone, opts) => [
      {
        id: `dns_${opts!.name}`,
        type: "A",
        name: opts!.name!,
        content: "192.0.2.1",
        proxied: true,
      },
    ]);
    // listWorkerRoutes default → [] (route missing, will be created)

    const result = await step2Domain.run(readyProspect, env);

    expect(createDnsRecord).not.toHaveBeenCalled();
    expect(createWorkerRoute).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("ok");
  });

  test("treats unproxied A records as missing (we need proxied for Worker routing)", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listDnsRecords).mockImplementation(async (_zone, opts) => [
      {
        id: `dns_${opts!.name}`,
        type: "A",
        name: opts!.name!,
        content: "203.0.113.1",
        proxied: false, // grey-cloud → won't intercept Worker traffic
      },
    ]);

    const result = await step2Domain.run(readyProspect, env);

    // We create a new proxied record alongside the existing unproxied
    // one rather than trying to flip it (avoids hijacking customer
    // records they may have set up themselves).
    expect(createDnsRecord).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("ok");
  });

  test("throws when listDnsRecords API fails", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listDnsRecords).mockRejectedValue(new Error("403 perms"));
    await expect(step2Domain.run(readyProspect, env)).rejects.toThrow(
      /listDnsRecords.*403 perms/,
    );
  });

  test("throws when createWorkerRoute API fails", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(createWorkerRoute).mockRejectedValue(
      new Error("10000 Authentication error"),
    );
    await expect(step2Domain.run(readyProspect, env)).rejects.toThrow(
      /createWorkerRoute.*Authentication error/,
    );
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

  // Phase F now runs unconditionally once DNS + route are ensured
  // (no per-binding "pending" state in the Routes API). HTTP itself
  // is the readiness signal — Universal SSL needs ~5-15 min on a
  // fresh zone, and the 5xx-→-retry branch handles the TLS warmup
  // window.

  test("marks site live on 200 OK from apex", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    // DNS + route already exist (idempotent) so we exercise pure phase F.
    vi.mocked(listDnsRecords).mockImplementation(async (_zone, opts) => [
      {
        id: `dns_${opts!.name}`,
        type: "A",
        name: opts!.name!,
        content: "192.0.2.1",
        proxied: true,
      },
    ]);
    vi.mocked(listWorkerRoutes).mockImplementation(async (_zone, pattern) => [
      { id: `route_${pattern}`, pattern: pattern!, script: "mf-tokte" },
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

  test("does NOT mark site live on 5xx (TLS warmup); logs for retry", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listDnsRecords).mockImplementation(async (_zone, opts) => [
      {
        id: `dns_${opts!.name}`,
        type: "A",
        name: opts!.name!,
        content: "192.0.2.1",
        proxied: true,
      },
    ]);
    vi.mocked(listWorkerRoutes).mockImplementation(async (_zone, pattern) => [
      { id: `route_${pattern}`, pattern: pattern!, script: "mf-tokte" },
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

  test("does NOT verify if Worker not yet uploaded (zone still pending)", async () => {
    // Zone pending → phase D skipped (would have nothing to bind to)
    // → workerName stays unset → phase E + F skipped.
    vi.mocked(getZone).mockResolvedValue(zonePending);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await step2Domain.run(
      {
        ...verifyProspect,
        cloudflareZoneStatus: "pending",
        domainVerifiedAt: undefined,
        workerName: undefined,
        nameserversEmailSentAt: "2026-05-09T10:00:00Z",
      },
      env,
    );

    expect(result.status).toBe("ok");
    expect(uploadWorkerScript).not.toHaveBeenCalled();
    expect(listDnsRecords).not.toHaveBeenCalled();
    expect(listWorkerRoutes).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(markSiteLive).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("does NOT verify if siteLiveAt latch already set (idempotency)", async () => {
    vi.mocked(getZone).mockResolvedValue(zoneActive);
    vi.mocked(listDnsRecords).mockImplementation(async (_zone, opts) => [
      {
        id: `dns_${opts!.name}`,
        type: "A",
        name: opts!.name!,
        content: "192.0.2.1",
        proxied: true,
      },
    ]);
    vi.mocked(listWorkerRoutes).mockImplementation(async (_zone, pattern) => [
      { id: `route_${pattern}`, pattern: pattern!, script: "mf-tokte" },
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
    vi.mocked(listDnsRecords).mockImplementation(async (_zone, opts) => [
      {
        id: `dns_${opts!.name}`,
        type: "A",
        name: opts!.name!,
        content: "192.0.2.1",
        proxied: true,
      },
    ]);
    vi.mocked(listWorkerRoutes).mockImplementation(async (_zone, pattern) => [
      { id: `route_${pattern}`, pattern: pattern!, script: "mf-tokte" },
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
