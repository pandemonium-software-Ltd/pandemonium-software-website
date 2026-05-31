// Helper for deriving a customer SenderBrand from a ProspectRecord.
// Used by the public newsletter routes (and any future "send on
// behalf of customer" surface) so the email's HTML header, accent
// colour, and footer match the customer's site identity.
//
// Defensive defaults: if any field is missing (e.g. brand colour
// never set), we fall back to ModuForge navy so the email still
// renders rather than throwing. The whole point of senderBrand
// being optional in the wrap function is to keep customer
// branding a best-effort upgrade — never a hard requirement.

import type { ProspectRecord } from "./notion-prospects";
import type { SenderBrand } from "../ops-worker/notify";

/** Default fallback colour when the customer has no primary
 *  colour set yet (or the value isn't a valid hex). ModuForge navy. */
const FALLBACK_PRIMARY = "#0f1d30";

/** Build a customer SenderBrand from the prospect's Notion record.
 *  Reads from phase3Data.brand for the colour (the schema source
 *  of truth) and falls back to legacy paths defensively. Reads
 *  from onboardingData.domain for the domain. */
export function customerSenderBrand(prospect: ProspectRecord): SenderBrand {
  const phase3 = (prospect.phase3Data ?? {}) as Record<string, unknown>;
  const brand = (phase3.brand ?? {}) as Record<string, unknown>;
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const domainSlice = (ob.domain ?? {}) as { domain?: unknown };

  const businessName =
    (prospect.business?.trim() || prospect.name?.trim() || "").trim() ||
    "Our business";

  // Domain: hub Step 2 captures it under onboardingData.domain.domain.
  // Falls back to the prospect's stored `domain` field (post-launch).
  // Empty-string fallback means the footer just shows the businessName
  // without a link — better than rendering a broken URL.
  const domainRaw =
    (typeof domainSlice.domain === "string" ? domainSlice.domain.trim() : "") ||
    "";

  // Primary colour: phase3.brand.primaryColour is the schema source.
  // Validate hex shape — bad data falls through to FALLBACK_PRIMARY
  // so the email still renders (don't throw on bad branding data,
  // a customer reading the email doesn't care).
  const primaryRaw =
    typeof brand.primaryColour === "string" ? brand.primaryColour.trim() : "";
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(primaryRaw)
    ? primaryRaw
    : FALLBACK_PRIMARY;

  const contentSlice = (ob.content ?? {}) as {
    business?: { publicEmail?: unknown };
  };
  const publicEmail =
    typeof contentSlice.business?.publicEmail === "string"
      ? contentSlice.business.publicEmail.trim()
      : "";
  const replyTo = publicEmail || prospect.email || undefined;

  return {
    kind: "customer",
    businessName,
    primaryColor,
    domain: domainRaw,
    replyTo,
    resendDomainVerified: !!prospect.resendDomainVerifiedAt,
  };
}
