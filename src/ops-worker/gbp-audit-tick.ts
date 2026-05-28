// Weekly GBP audit tick — runs every Monday at 02:30 UTC.
//
// Co-located with the daily GBP reviews refresh cron (same
// "30 2 * * *" schedule). The reviews tick runs daily; this
// audit tick checks day-of-week and exits early on non-Mondays.
//
// For every customer with a resolved gbpPlaceId:
//   1. Fetch extended place details (website, phone, hours,
//      categories, photos, description).
//   2. Read intake data (phase3Data, onboardingData) for the
//      customer's stated business info.
//   3. Send both to Claude (Haiku 4.5) for structured analysis.
//   4. Email the audit report to Ben for manual action.
//
// No GBP API / OAuth needed — we only READ via Places API.
// Ben applies recommendations manually via Manager access.

import { getServerEnv } from "../lib/env";
import { listProspectsNeedingOps } from "../lib/notion-prospects";
import {
  fetchPlaceDetailsForAudit,
  PlacesApiError,
  type PlaceAuditSnapshot,
} from "../lib/google-places";
import type { ProspectRecord } from "../lib/notion-prospects";
import { sendInternalNotification, type EmailAttachment } from "../lib/email";
import { callHaiku } from "../lib/haiku/client";
import {
  generateAuditPdf,
  parseAuditMarkdown,
  type AuditPdfInput,
} from "../lib/gbp-audit-pdf";

export async function runGbpAuditTick(): Promise<void> {
  const now = new Date();
  if (now.getUTCDay() !== 1) return; // Monday only

  const tickId = now.toISOString();
  console.log(`[gbp-audit:${tickId}] starting weekly audit`);

  const env = getServerEnv();
  if (!env.GOOGLE_PLACES_API_KEY) {
    console.warn(`[gbp-audit:${tickId}] GOOGLE_PLACES_API_KEY not set — skipping`);
    return;
  }
  if (!env.ANTHROPIC_API_KEY) {
    console.warn(`[gbp-audit:${tickId}] ANTHROPIC_API_KEY not set — skipping`);
    return;
  }

  let prospects: ProspectRecord[];
  try {
    prospects = await listProspectsNeedingOps();
  } catch (e) {
    console.error(
      `[gbp-audit:${tickId}] failed to list prospects: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const targets = prospects
    .filter((p) => p.moduleSelections.includes("Google Business Profile Setup/Audit"))
    .map((p) => ({ prospect: p, placeId: readPlaceId(p) }))
    .filter((t): t is { prospect: ProspectRecord; placeId: string } => !!t.placeId);

  if (targets.length === 0) {
    console.log(`[gbp-audit:${tickId}] no GBP customers with resolved place_id — done`);
    return;
  }

  console.log(`[gbp-audit:${tickId}] auditing ${targets.length} customer(s)`);

  const reports: string[] = [];
  const attachments: EmailAttachment[] = [];
  let ok = 0;
  let failed = 0;
  const dateStr = now.toISOString().slice(0, 10);

  for (const { prospect, placeId } of targets) {
    const biz = prospect.business ?? prospect.name;
    try {
      const snapshot = await fetchPlaceDetailsForAudit(
        placeId,
        env.GOOGLE_PLACES_API_KEY,
      );
      const intake = buildIntakeContext(prospect);
      const report = await generateAuditReport(prospect, snapshot, intake);

      if (report) {
        reports.push(report);

        // Generate PDF
        try {
          const parsed = parseAuditMarkdown(report);
          const pdfInput: AuditPdfInput = {
            businessName: biz,
            auditDate: dateStr,
            score: parsed.score,
            mapsUrl: snapshot.googleMapsUri,
            snapshot,
            sections: parsed.sections,
            reviewsSummary: parsed.reviewsSummary,
            consistencyNotes: parsed.consistencyNotes,
          };
          const pdfBytes = await generateAuditPdf(pdfInput);
          const slug = biz.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
          attachments.push({
            filename: `gbp-audit-${slug}-${dateStr}.pdf`,
            content: pdfBytes,
            contentType: "application/pdf",
          });
        } catch (pdfErr) {
          console.warn(
            `[gbp-audit:${tickId}] PDF generation failed for ${biz}: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`,
          );
        }
        ok++;
      } else {
        reports.push(
          `## ${biz}\n\n⚠️ Claude returned no audit — raw snapshot below.\n\n${formatSnapshotFallback(snapshot)}`,
        );
        ok++;
      }
    } catch (e) {
      const msg = e instanceof PlacesApiError ? e.message : String(e);
      console.error(`[gbp-audit:${tickId}] ${prospect.name} — ${msg}`);
      reports.push(`## ${biz}\n\n❌ Audit failed: ${msg}`);
      failed++;
    }
  }

  const emailBody = [
    `Weekly GBP Audit — ${dateStr}`,
    `${targets.length} customer(s) audited, ${ok} ok, ${failed} failed.`,
    attachments.length > 0
      ? `${attachments.length} PDF report(s) attached.`
      : "",
    "",
    "━".repeat(60),
    "",
    ...reports,
  ]
    .filter(Boolean)
    .join("\n");

  const err = await sendInternalNotification({
    subject: `📋 Weekly GBP Audit — ${targets.length} customer(s) — ${dateStr}`,
    body: emailBody,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
  if (err) {
    console.error(`[gbp-audit:${tickId}] email failed: ${err}`);
  }

  console.log(
    `[gbp-audit:${tickId}] complete — ok=${ok}, failed=${failed}, pdfs=${attachments.length}`,
  );
}

type IntakeContext = {
  businessName: string;
  businessType: string;
  location: string;
  phone: string;
  domain: string;
  elevatorPitch: string;
  address: string;
  serviceArea: string;
  services: string[];
  openingHours: string;
};

function buildIntakeContext(prospect: ProspectRecord): IntakeContext {
  const phase3 = (prospect.phase3Data ?? {}) as Record<string, unknown>;
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;

  const basics = (phase3.businessBasics ?? {}) as Record<string, unknown>;
  const contact = (phase3.contactDetails ?? {}) as Record<string, unknown>;
  const domain = (ob.domain ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;

  const services: string[] = [];
  const rawServices = content.services;
  if (Array.isArray(rawServices)) {
    for (const s of rawServices) {
      if (s && typeof s === "object") {
        const svc = s as Record<string, unknown>;
        const name = typeof svc.name === "string" ? svc.name : "";
        if (name) services.push(name);
      }
    }
  }

  const hours = content.openingHours;
  let hoursStr = "";
  if (Array.isArray(hours)) {
    hoursStr = hours
      .filter((h): h is Record<string, unknown> => h != null && typeof h === "object")
      .map((h) => `${h.day ?? "?"}: ${h.open ?? "closed"} – ${h.close ?? ""}`.trim())
      .join("; ");
  }

  return {
    businessName: prospect.business ?? prospect.name,
    businessType: prospect.businessType ?? "",
    location: prospect.location ?? "",
    phone: prospect.phone ?? (typeof contact.phoneTel === "string" ? contact.phoneTel : ""),
    domain: typeof domain.domain === "string" ? domain.domain : "",
    elevatorPitch: typeof basics.elevatorPitch === "string" ? basics.elevatorPitch : "",
    address: typeof contact.address === "string" ? contact.address : "",
    serviceArea: typeof contact.serviceArea === "string" ? contact.serviceArea : "",
    services,
    openingHours: hoursStr,
  };
}

const AUDIT_SYSTEM_PROMPT = `You are a Google Business Profile (GBP) expert auditing a UK tradesperson's listing. You have Manager access to their profile and will action these recommendations yourself — write them as a to-do list for the operator (Ben), not advice for the business owner.

Be specific and actionable. Reference exact fields, categories, and text where possible. Flag mismatches between the GBP listing and the customer's intake data or website. Prioritise by impact on local search ranking.

Format your response as markdown with these sections:
## {Business Name} — GBP Audit

### Score: X/10
(Overall GBP health. 10 = nothing to fix.)

### 🔴 Critical Issues (fix immediately)
(Listing suspended risk, wrong info, policy violations. Omit section if none.)

### 🟠 High-Impact Improvements
(Category, description, photos, hours — things that directly affect ranking.)

### 🟡 Nice-to-Have
(Minor optimisations. Omit section if none.)

### ✅ What's Working Well
(Positive reinforcement — what's already good.)

### Reviews Summary
(Review health: count, rating, sentiment themes, suggested responses if any negative reviews need addressing.)

### GBP ↔ Website Consistency
(Mismatches between GBP and intake/website data: hours, phone, address, services listed.)`;

async function generateAuditReport(
  prospect: ProspectRecord,
  snapshot: PlaceAuditSnapshot,
  intake: IntakeContext,
): Promise<string | null> {
  const prompt = `Audit this Google Business Profile listing for "${intake.businessName}".

## Current GBP Listing (from Google Places API)
- Display Name: ${snapshot.displayName ?? "(not set)"}
- Address: ${snapshot.formattedAddress ?? "(not set)"}
- Phone: ${snapshot.nationalPhoneNumber ?? "(not set)"}
- Website: ${snapshot.websiteUri ?? "(not set)"}
- Primary Category: ${snapshot.primaryType ?? "(not set)"}
- All Categories: ${snapshot.types?.join(", ") || "(none)"}
- Description: ${snapshot.editorialSummary ?? "(not set)"}
- Rating: ${snapshot.rating ?? "no rating"} (${snapshot.totalReviews ?? 0} reviews)
- Photos: ${snapshot.photoCount} uploaded
- Opening Hours: ${snapshot.regularOpeningHours ?? "(not set)"}
- Google Maps: ${snapshot.googleMapsUri ?? "(no link)"}

## Top Reviews
${snapshot.topReviews.length > 0 ? snapshot.topReviews.map((r) => `- ★${r.rating} by ${r.authorName} (${r.relativeTimeDescription}): "${r.text}"`).join("\n") : "(no reviews with text)"}

## Customer Intake Data (what they told us)
- Business Name: ${intake.businessName}
- Business Type: ${intake.businessType}
- Location: ${intake.location}
- Phone: ${intake.phone || "(not provided)"}
- Website Domain: ${intake.domain || "(not set up yet)"}
- Elevator Pitch: ${intake.elevatorPitch || "(not provided)"}
- Address: ${intake.address || "(not provided)"}
- Service Area: ${intake.serviceArea || "(not provided)"}
- Services: ${intake.services.length > 0 ? intake.services.join(", ") : "(not listed yet)"}
- Opening Hours (from Hub): ${intake.openingHours || "(not set yet)"}

Generate the audit report.`;

  return callHaiku({
    system: AUDIT_SYSTEM_PROMPT,
    prompt,
    maxTokens: 1500,
  });
}

function formatSnapshotFallback(snapshot: PlaceAuditSnapshot): string {
  return [
    `**Name:** ${snapshot.displayName ?? "?"}`,
    `**Address:** ${snapshot.formattedAddress ?? "?"}`,
    `**Rating:** ${snapshot.rating ?? "?"} (${snapshot.totalReviews ?? 0} reviews)`,
    `**Phone:** ${snapshot.nationalPhoneNumber ?? "?"}`,
    `**Website:** ${snapshot.websiteUri ?? "?"}`,
    `**Category:** ${snapshot.primaryType ?? "?"}`,
    `**Photos:** ${snapshot.photoCount}`,
    `**Hours:** ${snapshot.regularOpeningHours ?? "?"}`,
    `**Description:** ${snapshot.editorialSummary ?? "(none)"}`,
  ].join("\n");
}

function readPlaceId(prospect: ProspectRecord): string | null {
  const ob = prospect.onboardingData;
  if (!ob || typeof ob !== "object") return null;
  const tools = (ob as { tools?: unknown }).tools;
  if (!tools || typeof tools !== "object") return null;
  const pid = (tools as { gbpPlaceId?: unknown }).gbpPlaceId;
  return typeof pid === "string" && pid.length > 0 ? pid : null;
}
