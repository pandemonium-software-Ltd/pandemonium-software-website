// Step 2 — Domain (zone create + nameservers email + status poll
// + per-customer Worker provisioning + Custom Domain binding).
// Stage 2C C2.2 (zone work) + C2.3 (Worker placement).
//
// Per §4.3 Step 2.A. Six idempotency latches in Notion; shouldRun
// gates on Step 2 done + Cloudflare account known + still-work-to-do.
//
// run() is a state machine with six independent transitions, each
// gated on its own latch so re-running the step is always safe:
//
//   A. zone exists?              → create or discover, record id+status
//   B. need NS email?            → render + send, set Nameservers Email Sent At
//   C. zone status active + no DV?  → render + send, set Domain Verified At
//   D. zone active + no Worker?  → upload placeholder Worker, set Worker Name
//   E. Worker exists, hostname not bound? → bind apex + www
//   F. bindings active + no SiteLiveAt? → HTTP 200 verify, set Site Live At
//
// step2 stays in shouldRun=true until F succeeds. Once Site Live At
// is set, the placeholder is reachable at https://<domain>/ and
// step2 idles (step5 will replace the Worker with the real site at
// launch time).

import type { Step } from "../types";
import {
  listZones,
  createZone,
  getZone,
  uploadWorkerScript,
  listWorkerCustomDomains,
  createWorkerCustomDomain,
  CloudflareApiError,
  type Zone,
  type WorkerCustomDomain,
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
import {
  placeholderScript,
  workerNameForProspect,
} from "../placeholder-worker";

type DomainConfig = {
  domain: string;
  registrar: "cloudflare" | "already-have" | "external";
};

export const step2Domain: Step = {
  id: "step2",
  shouldRun: (p) => {
    if (!p.onboardingStep2Done) return false;
    if (!p.cloudflareAccountId) return false;
    // Still work if any latch isn't set yet:
    //   - zone isn't active  (phase A/B/C still in flight)
    //   - activation email   (Domain Verified At)
    //   - placeholder Worker (Worker Name)
    //   - bindings + verify  (Site Live At)
    if (p.cloudflareZoneStatus !== "active") return true;
    if (!p.domainVerifiedAt) return true;
    if (!p.workerName) return true;
    if (!p.siteLiveAt) return true;
    return false;
  },
  async run(prospect, env) {
    if (!env.BEN_CLOUDFLARE_API_TOKEN) {
      return {
        status: "skip",
        reason:
          "BEN_CLOUDFLARE_API_TOKEN not set — Step 2 idle until Ben creates the token (see src/lib/cloudflare.ts head comment)",
      };
    }

    const config = readDomainConfig(prospect.onboardingData);
    if (!config) {
      return {
        status: "skip",
        reason:
          "Customer hasn't entered domain + registrar in Hub Step 2 yet (onboardingData.domain.{domain, registrar} incomplete)",
      };
    }

    if (!prospect.cloudflareAccountId) {
      return {
        status: "skip",
        reason:
          "Customer's Cloudflare account id unknown — step1 hasn't completed yet",
      };
    }

    // ---------- A. Ensure zone exists ----------
    let zone: Zone;
    let zoneCreatedThisTick = false;

    if (prospect.cloudflareZoneId) {
      // Already have a zone id from a previous tick — fetch latest state.
      try {
        zone = await getZone(prospect.cloudflareZoneId);
      } catch (e) {
        throw new Error(
          `getZone(${prospect.cloudflareZoneId}) failed: ${cfErrorMessage(e)}`,
        );
      }
    } else {
      // Discover or create. List first (idempotency: customer might
      // already have set up the zone themselves before paying).
      let existing: Zone[];
      try {
        existing = await listZones({
          accountId: prospect.cloudflareAccountId,
          name: config.domain,
        });
      } catch (e) {
        throw new Error(`listZones failed: ${cfErrorMessage(e)}`);
      }

      if (existing.length > 0) {
        zone = existing[0];
      } else {
        try {
          zone = await createZone(
            prospect.cloudflareAccountId,
            config.domain,
          );
          zoneCreatedThisTick = true;
        } catch (e) {
          throw new Error(`createZone failed: ${cfErrorMessage(e)}`);
        }
      }

      await recordCloudflareZone(prospect.pageId, zone.id, zone.status);
    }

    // Sync status if it drifted (relevant for "already have zone"
    // path where prospect.cloudflareZoneStatus may be stale).
    if (
      prospect.cloudflareZoneId &&
      zone.status !== prospect.cloudflareZoneStatus
    ) {
      await updateZoneStatus(prospect.pageId, zone.status);
    }

    // ---------- B. Send nameservers email (external registrars only, latch) ----------
    let sentNameserversEmail = false;
    const isExternal =
      config.registrar === "external" || config.registrar === "already-have";
    if (isExternal && !prospect.nameserversEmailSentAt) {
      const [ns1, ns2] = zone.name_servers ?? [];
      if (!ns1 || !ns2) {
        throw new Error(
          `Cloudflare returned zone ${zone.id} without 2 nameservers (got ${zone.name_servers?.length ?? 0}); can't email customer`,
        );
      }
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://modu-forge.co.uk";
      await sendCustomerEmail(env, prospect.email, "domain-nameservers-pending", {
        customerName: prospect.name,
        domain: config.domain,
        ns1,
        ns2,
        confirmUrl: `${baseUrl}/api/onboarding/dns-confirm/${prospect.token}`,
      });
      await markNameserversEmailed(prospect.pageId);
      sentNameserversEmail = true;
    }

    // ---------- C. Send activation email (status active + latch) ----------
    let sentActivationEmail = false;
    if (zone.status === "active" && !prospect.domainVerifiedAt) {
      await sendCustomerEmail(env, prospect.email, "domain-zone-active", {
        customerName: prospect.name,
        domain: config.domain,
      });
      await markDomainVerified(prospect.pageId);
      sentActivationEmail = true;
    }

    // ---------- D. Upload placeholder Worker (latch: workerName) ----------
    // Only if zone is active. While zone is still pending, the Worker
    // would have nowhere to bind to.
    let workerName = prospect.workerName;
    let workerUploadedThisTick = false;
    if (zone.status === "active" && !workerName) {
      const desired = workerNameForProspect(prospect.token);
      const script = placeholderScript(prospect.name);
      try {
        await uploadWorkerScript(
          prospect.cloudflareAccountId,
          desired,
          script,
        );
      } catch (e) {
        throw new Error(
          `uploadWorkerScript(${desired}) failed: ${cfErrorMessage(e)}`,
        );
      }
      workerName = desired;
      await recordWorkerName(prospect.pageId, workerName);
      workerUploadedThisTick = true;
    }

    // ---------- E. Bind apex + www (no latch — checked dynamically) ----------
    // Each tick: list current bindings, create the missing ones.
    // Cloudflare's POST /workers/domains is idempotent on
    // (hostname, service) — but we list first to keep the audit
    // log clean (don't claim "bound foo.co.uk" every tick).
    const bindEvents: string[] = [];
    let allBindings: WorkerCustomDomain[] = [];
    if (workerName) {
      const hostnames = [config.domain, `www.${config.domain}`];
      for (const hostname of hostnames) {
        let existing: WorkerCustomDomain[];
        try {
          existing = await listWorkerCustomDomains(
            prospect.cloudflareAccountId,
            hostname,
          );
        } catch (e) {
          throw new Error(
            `listWorkerCustomDomains(${hostname}) failed: ${cfErrorMessage(e)}`,
          );
        }

        let binding: WorkerCustomDomain;
        if (existing.length > 0) {
          binding = existing[0];
        } else {
          try {
            binding = await createWorkerCustomDomain(
              prospect.cloudflareAccountId,
              { hostname, service: workerName, zoneId: zone.id },
            );
          } catch (e) {
            throw new Error(
              `createWorkerCustomDomain(${hostname}) failed: ${cfErrorMessage(e)}`,
            );
          }
          bindEvents.push(`bound ${hostname}`);
        }
        allBindings.push(binding);
      }
    }

    // ---------- F. HTTP 200 verify (latch: siteLiveAt) ----------
    // Run only when bindings are in place AND not yet verified.
    // Status field on binding may be absent for some Cloudflare
    // responses — treat absent as ready (consistent with
    // WorkerCustomDomain.status type).
    let verifiedThisTick = false;
    if (
      workerName &&
      allBindings.length > 0 &&
      allBindings.every((b) => b.status !== "pending") &&
      !prospect.siteLiveAt
    ) {
      const url = `https://${config.domain}/`;
      // Sentinel: -1 = fetch threw (network error); else HTTP status.
      // Avoids constructing a fake Response with status:0 (which the
      // Web Response API forbids — must be 200-599).
      let verifyStatus = -1;
      try {
        const res = await fetch(url, { redirect: "manual" });
        verifyStatus = res.status;
      } catch (e) {
        bindEvents.push(
          `HTTP verify ${url} threw (${e instanceof Error ? e.message : String(e)}) — will retry next tick`,
        );
      }

      if (verifyStatus >= 200 && verifyStatus < 400) {
        await markSiteLive(prospect.pageId);
        verifiedThisTick = true;
      } else if (verifyStatus > 0) {
        bindEvents.push(
          `HTTP ${verifyStatus} from ${url} — TLS likely still provisioning, will retry next tick`,
        );
      }
    }

    // ---------- Compose audit notes ----------
    const events: string[] = [];
    if (zoneCreatedThisTick) events.push(`created zone ${zone.id}`);
    else if (!prospect.cloudflareZoneId) events.push(`discovered zone ${zone.id}`);
    if (sentNameserversEmail) events.push("sent nameservers email");
    if (sentActivationEmail) events.push("sent activation email");
    if (workerUploadedThisTick && workerName)
      events.push(`uploaded Worker ${workerName}`);
    events.push(...bindEvents);
    if (verifiedThisTick) events.push("site verified live");
    if (events.length === 0) events.push(`status: ${zone.status}`);

    return {
      status: "ok",
      notes: `Zone ${zone.id} (${zone.name}) — ${events.join("; ")}`,
    };
  },
};

function readDomainConfig(data: unknown): DomainConfig | null {
  if (!data || typeof data !== "object") return null;
  const d = (data as { domain?: unknown }).domain;
  if (!d || typeof d !== "object") return null;
  const domain = (d as { domain?: unknown }).domain;
  const registrar = (d as { registrar?: unknown }).registrar;
  if (typeof domain !== "string" || domain.length === 0) return null;
  if (
    registrar !== "cloudflare" &&
    registrar !== "already-have" &&
    registrar !== "external"
  ) {
    return null;
  }
  return { domain, registrar };
}

function cfErrorMessage(e: unknown): string {
  if (e instanceof CloudflareApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
