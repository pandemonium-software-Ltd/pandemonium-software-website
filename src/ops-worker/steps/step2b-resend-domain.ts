// Step 2b — Resend domain verification.
//
// Runs after step2-domain once the Cloudflare zone is active and
// the customer has a domain. Registers the domain with Resend,
// adds the required DNS records (SPF, DKIM) via Cloudflare, and
// triggers verification. Once verified, newsletter emails send
// from the customer's domain instead of modu-forge.co.uk.
//
// State machine with three transitions:
//   A. No resendDomainId → register domain with Resend, store id
//   B. resendDomainId + DNS records missing → add them via CF
//   C. resendDomainId + not verified → trigger verify, poll status
//
// Idempotent: each phase checks its latch before acting.

import type { Step } from "../types";
import {
  createResendDomain,
  getResendDomain,
  verifyResendDomain,
  listResendDomains,
  type ResendDnsRecord,
  ResendApiError,
} from "../../lib/resend";
import {
  listDnsRecords,
  createDnsRecord,
  CloudflareApiError,
} from "../../lib/cloudflare";
import {
  recordResendDomainId,
  markResendDomainVerified,
} from "../../lib/notion-prospects";

export const step2bResendDomain: Step = {
  id: "step2b",
  shouldRun(prospect) {
    if (!prospect.cloudflareZoneId) return false;
    if (prospect.cloudflareZoneStatus !== "active") return false;
    if (prospect.resendDomainVerifiedAt) return false;
    const domain = readCustomerDomain(prospect.onboardingData);
    if (!domain) return false;
    return true;
  },

  async run(prospect, env) {
    const domain = readCustomerDomain(prospect.onboardingData)!;
    const zoneId = prospect.cloudflareZoneId!;
    const events: string[] = [];

    // ---------- A. Register domain with Resend ----------
    let resendDomainId = prospect.resendDomainId;
    let dnsRecords: ResendDnsRecord[] = [];

    if (!resendDomainId) {
      // Check if already registered (idempotency — domain may have
      // been created in a previous tick that failed before stamping).
      try {
        const existing = await listResendDomains();
        const match = existing.data.find(
          (d) => d.name === domain,
        );
        if (match) {
          resendDomainId = match.id;
          events.push(`found existing Resend domain ${match.id}`);
        }
      } catch (e) {
        const msg = e instanceof ResendApiError ? e.message : String(e);
        throw new Error(`listResendDomains failed: ${msg}`);
      }

      if (!resendDomainId) {
        try {
          const created = await createResendDomain(domain);
          resendDomainId = created.id;
          dnsRecords = created.records;
          events.push(`created Resend domain ${created.id}`);
        } catch (e) {
          const msg = e instanceof ResendApiError ? e.message : String(e);
          throw new Error(`createResendDomain(${domain}) failed: ${msg}`);
        }
      }

      try {
        await recordResendDomainId(prospect.pageId, resendDomainId);
      } catch (e) {
        console.error(
          `[step2b] Resend domain created but Notion stamp failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // ---------- B. Fetch DNS records if we don't have them ----------
    if (dnsRecords.length === 0) {
      try {
        const domainInfo = await getResendDomain(resendDomainId);
        dnsRecords = domainInfo.records;

        // Already verified? Stamp and return early.
        if (domainInfo.status === "verified") {
          await markResendDomainVerified(prospect.pageId);
          return {
            status: "ok",
            notes: `Resend domain ${domain} already verified.`,
          };
        }
      } catch (e) {
        const msg = e instanceof ResendApiError ? e.message : String(e);
        throw new Error(`getResendDomain(${resendDomainId}) failed: ${msg}`);
      }
    }

    // ---------- C. Add DNS records via Cloudflare ----------
    if (!env.BEN_CLOUDFLARE_API_TOKEN) {
      return {
        status: "skip",
        reason: "BEN_CLOUDFLARE_API_TOKEN not set — can't add Resend DNS records",
      };
    }

    for (const rec of dnsRecords) {
      if (rec.status === "verified") continue;
      // Only add SPF and DKIM records — skip Tracking (optional)
      if (rec.record !== "SPF" && rec.record !== "DKIM") continue;

      const fullName = rec.name.includes(".")
        ? rec.name
        : `${rec.name}.${domain}`;

      try {
        const existing = await listDnsRecords(zoneId, {
          name: fullName,
          type: rec.type,
        });

        const alreadyExists = existing.some(
          (r) => r.content === rec.value || r.content === rec.value.replace(/^"|"$/g, ""),
        );

        if (!alreadyExists) {
          await createDnsRecord(zoneId, {
            type: rec.type,
            name: fullName,
            content: rec.type === "TXT"
              ? rec.value.replace(/^"|"$/g, "")
              : rec.value,
            proxied: false,
            comment: `ModuForge: Resend ${rec.record} verification`,
          });
          events.push(`added ${rec.type} ${rec.record} record for ${fullName}`);
        } else {
          events.push(`${rec.record} record already exists for ${fullName}`);
        }
      } catch (e) {
        const msg = e instanceof CloudflareApiError ? e.message : String(e);
        throw new Error(`DNS record for ${rec.record} (${fullName}) failed: ${msg}`);
      }
    }

    // ---------- D. Trigger verification ----------
    try {
      await verifyResendDomain(resendDomainId);
      events.push("triggered Resend verification");
    } catch (e) {
      const msg = e instanceof ResendApiError ? e.message : String(e);
      events.push(`verify trigger failed: ${msg}`);
    }

    // Check if verification completed immediately
    try {
      const status = await getResendDomain(resendDomainId);
      if (status.status === "verified") {
        await markResendDomainVerified(prospect.pageId);
        events.push("domain verified!");
      } else {
        events.push(`status: ${status.status} — will re-check next tick`);
      }
    } catch {
      events.push("status poll failed — will retry next tick");
    }

    return {
      status: "ok",
      notes: `Resend domain ${domain} (${resendDomainId}) — ${events.join("; ")}`,
    };
  },
};

function readCustomerDomain(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = (data as { domain?: unknown }).domain;
  if (!d || typeof d !== "object") return null;
  const domain = (d as { domain?: unknown }).domain;
  if (typeof domain !== "string" || domain.length === 0) return null;
  return domain;
}
