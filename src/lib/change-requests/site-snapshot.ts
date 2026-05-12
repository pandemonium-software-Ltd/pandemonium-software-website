// Build the SiteSnapshot the Cowork classifier reads. Pulled from
// the same place the customer-site adapter reads — content step
// preferred, prospect record fallback. Shared between the cron
// (step6) and the admin endpoint (inline classify on Approve when
// the cron hasn't run yet).
//
// The snapshot is INPUT to Haiku — it sees the customer's current
// data so it can write a correct patch (e.g. "fix typo in tagline"
// → Haiku needs the current tagline). Sanitised: only public-facing
// fields the customer owns.

import type { SiteSnapshot } from "../haiku/classify-change-request";
import type { ProspectRecord } from "../notion-prospects";

export function buildSiteSnapshot(prospect: ProspectRecord): SiteSnapshot {
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const business = (content.business ?? {}) as Record<string, unknown>;
  const trust = (content.trust ?? {}) as Record<string, unknown>;
  const branding = (ob.branding ?? {}) as Record<string, unknown>;
  const services = Array.isArray(content.services) ? content.services : [];
  const faq = Array.isArray(content.faq) ? content.faq : [];
  const testimonials = Array.isArray(content.testimonials)
    ? content.testimonials
    : [];
  const aboutBullets = Array.isArray(content.aboutBullets)
    ? (content.aboutBullets as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : undefined;
  const openingHours =
    business.openingHours && typeof business.openingHours === "object"
      ? (business.openingHours as Record<
          string,
          { open: boolean; from?: string; to?: string }
        >)
      : undefined;
  return {
    business: {
      name: prospect.business ?? "",
      type: prospect.businessType ?? "",
      location: prospect.location ?? "",
      contactName: optionalString(business.contactName),
      phoneDisplay: optionalString(business.phoneDisplay) ?? prospect.phone,
      phoneTel: optionalString(business.phoneTel),
      publicEmail: optionalString(business.publicEmail) ?? prospect.email,
      address: optionalString(business.address),
      serviceArea: optionalString(business.serviceArea),
      openingHours,
    },
    copy: {
      tagline: optionalString(content.tagline),
      aboutBlurb: optionalString(content.aboutBlurb),
      aboutBullets,
    },
    trust:
      trust.yearsExperience !== undefined ||
      trust.associations !== undefined ||
      trust.awards !== undefined
        ? {
            yearsExperience:
              typeof trust.yearsExperience === "number"
                ? trust.yearsExperience
                : undefined,
            associations: optionalString(trust.associations),
            awards: optionalString(trust.awards),
          }
        : undefined,
    branding:
      branding.brandColorPrimary || branding.brandColorSecondary
        ? {
            primary: optionalString(branding.brandColorPrimary),
            secondary: optionalString(branding.brandColorSecondary),
          }
        : undefined,
    services: services
      .filter((s) => s && typeof s === "object")
      .map((s) => {
        const sObj = s as Record<string, unknown>;
        return {
          name: optionalString(sObj.serviceName) ?? "(unnamed)",
          description: optionalString(sObj.description),
          priceFrom:
            typeof sObj.priceFrom === "number" ? sObj.priceFrom : undefined,
          longDescription: optionalString(sObj.longDescription),
          features: Array.isArray(sObj.features)
            ? (sObj.features as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : undefined,
          pricingNotes: optionalString(sObj.pricingNotes),
        };
      }),
    faq: faq
      .filter((f) => f && typeof f === "object")
      .map((f) => {
        const fObj = f as Record<string, unknown>;
        return {
          question: optionalString(fObj.question) ?? "(unnamed)",
          answer: optionalString(fObj.answer),
        };
      }),
    testimonials: testimonials
      .filter((t) => t && typeof t === "object")
      .map((t) => {
        const tObj = t as Record<string, unknown>;
        return {
          name: optionalString(tObj.name) ?? "(unnamed)",
          quote: optionalString(tObj.quote),
          rating: typeof tObj.rating === "number" ? tObj.rating : undefined,
        };
      }),
    assets: extractAssetsSummary(ob.assets),
  };
}

function optionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Build the assets summary Haiku uses for rebuildOnly classification.
 *  Per-slot summary lets Haiku reason about "I uploaded a new logo"
 *  vs "I uploaded a new photo" and the recency check guards against
 *  customers claiming refreshes for stale assets.
 *
 *  Pulls everything from `onboardingData.assets` (step4AssetsSchema
 *  shape — see src/lib/onboarding.ts). Gracefully tolerates missing
 *  fields and odd shapes — the classifier shouldn't crash on bad
 *  input. */
function extractAssetsSummary(
  raw: unknown,
): SiteSnapshot["assets"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  const singleAsset = (
    key: string,
  ): { filename: string; uploadedAt: string } | null => {
    const a = r[key];
    if (!a || typeof a !== "object") return null;
    const obj = a as Record<string, unknown>;
    const filename = typeof obj.filename === "string" ? obj.filename : null;
    const uploadedAt =
      typeof obj.uploadedAt === "string" ? obj.uploadedAt : null;
    if (!filename || !uploadedAt) return null;
    return { filename, uploadedAt };
  };

  const logo = singleAsset("logo");
  const hero = singleAsset("hero");
  const about = singleAsset("about");

  const gallery = Array.isArray(r.gallery) ? r.gallery : [];
  const services = Array.isArray(r.services) ? r.services : [];

  // Collect all uploadedAt timestamps across every asset slot for
  // the lastUploadedAt heuristic (used by Haiku's recency check).
  const stamps: number[] = [];
  for (const a of [logo, hero, about]) {
    if (a) stamps.push(Date.parse(a.uploadedAt));
  }
  for (const arr of [gallery, services]) {
    for (const item of arr) {
      if (item && typeof item === "object") {
        const u = (item as Record<string, unknown>).uploadedAt;
        if (typeof u === "string") {
          const t = Date.parse(u);
          if (Number.isFinite(t)) stamps.push(t);
        }
      }
    }
  }
  const lastUploadedAt =
    stamps.length > 0
      ? new Date(Math.max(...stamps)).toISOString()
      : undefined;

  return {
    logo: logo ?? undefined,
    hero: hero ?? undefined,
    about: about ?? undefined,
    galleryCount: gallery.length,
    servicePhotoCount: services.length,
    lastUploadedAt,
  };
}
