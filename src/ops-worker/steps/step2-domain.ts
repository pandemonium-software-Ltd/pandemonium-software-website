// Step 2 — Domain (zone create + nameservers email + status poll).
// Stage 2C C2.2.
//
// Per §4.3 Step 2.A:
//   - For external/already-have registrars: POST /zones on the
//     customer's Cloudflare account, email them the assigned
//     nameservers, then poll until status:active and email confirm.
//   - For Cloudflare registrars: zone is auto-created when the
//     customer registers the domain through Cloudflare. We just
//     find it and confirm. No nameserver email needed.
//
// Worker Custom Domain binding (the "bind hostname → mf-<token-prefix>"
// step) is C2.3, not this commit. step2 stops at "zone is active in
// the customer's Cloudflare account".
//
// Three idempotency latches — all in Notion. shouldRun gates on:
//   1. Step 2 done? (customer has marked the Hub step done)
//   2. Cloudflare account id known? (step1 has accepted membership)
//   3. Zone status != active OR domainVerifiedAt unset
//      (still work to do, OR we still owe an activation email)
//
// run() is a state machine with three independent transitions:
//   A. zone exists?           → create or discover, record id+status
//   B. need to send NS email? → render template + Resend, set latch
//   C. status active + no DV? → render activation template, set DV latch
//
// Each transition is gated on its own latch so re-running the
// step is always safe. Cloudflare's POST /zones returns 1061
// "Zone already exists" if duplicated; we sidestep that by listing
// first.

import type { Step } from "../types";
import {
  listZones,
  createZone,
  getZone,
  CloudflareApiError,
  type Zone,
} from "../../lib/cloudflare";
import {
  recordCloudflareZone,
  updateZoneStatus,
  markDomainVerified,
  markNameserversEmailed,
} from "../../lib/notion-prospects";
import { sendCustomerEmail } from "../notify";

type DomainConfig = {
  domain: string;
  registrar: "cloudflare" | "already-have" | "external";
};

export const step2Domain: Step = {
  id: "step2",
  shouldRun: (p) => {
    if (!p.onboardingStep2Done) return false;
    if (!p.cloudflareAccountId) return false;
    // Still work if zone isn't active yet, OR we still owe the
    // activation email (the latch).
    if (p.cloudflareZoneStatus !== "active") return true;
    if (!p.domainVerifiedAt) return true;
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
      await sendCustomerEmail(env, prospect, "domain-nameservers-pending", {
        customerName: prospect.name,
        domain: config.domain,
        ns1,
        ns2,
      });
      await markNameserversEmailed(prospect.pageId);
      sentNameserversEmail = true;
    }

    // ---------- C. Send activation email (status active + latch) ----------
    let sentActivationEmail = false;
    if (zone.status === "active" && !prospect.domainVerifiedAt) {
      await sendCustomerEmail(env, prospect, "domain-zone-active", {
        customerName: prospect.name,
        domain: config.domain,
      });
      await markDomainVerified(prospect.pageId);
      sentActivationEmail = true;
    }

    // ---------- Compose audit notes ----------
    const events: string[] = [];
    if (zoneCreatedThisTick) events.push(`created zone ${zone.id}`);
    else if (!prospect.cloudflareZoneId) events.push(`discovered zone ${zone.id}`);
    if (sentNameserversEmail) events.push("sent nameservers email");
    if (sentActivationEmail) events.push("sent activation email");
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
