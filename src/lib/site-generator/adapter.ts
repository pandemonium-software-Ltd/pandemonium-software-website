// Prospect → SiteGeneratorInput adapter. Maps the three Notion
// JSON blobs (Phase 2 / Phase 3 / Onboarding Data) and the prospect
// record into the canonical input shape templates render from.
//
// This is the FAIL-FAST gate: if intake data is incomplete or
// malformed, this throws AdapterError with a customer-safe reason.
// Better to fail here than produce a half-built site that ships
// "undefined" in the hero.
//
// Defensive on input: tolerates missing optional fields, validates
// hex colours + URLs, falls back to sensible defaults from `business`
// for absent custom copy.

import type { ProspectRecord } from "../notion-prospects";
import type {
  BrandAssets,
  BrandColors,
  BusinessInfo,
  CustomCopy,
  FaqEntry,
  HexColor,
  ModuleConfig,
  Service,
  SiteGeneratorInput,
  Vibe,
} from "./types";

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const VALID_VIBES: ReadonlySet<Vibe> = new Set([
  "traditional",
  "modern",
  "premium",
  "friendly",
]);

/**
 * Build the canonical input from a fully-populated prospect.
 * Throws AdapterError if any required field is missing or invalid.
 *
 * Required for site generation:
 *   - business: name + type + location + phone + email
 *   - colors: primary + secondary as valid hex
 *   - vibe: one of the four standard vibes
 *   - domain: from onboardingData.domain.domain
 *   - At least one service (so the services section isn't empty)
 *   - logoUrl + heroPhotoUrl from brand assets in onboardingData
 *
 * Modules are optional individually — adapter only includes a
 * module config for modules in `prospect.moduleSelections`.
 */
export function adaptProspect(prospect: ProspectRecord): SiteGeneratorInput {
  // --- Onboarding data (preferred source for most fields) ---
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const domain = readDomainSlug(ob);
  const tools = (ob.tools ?? {}) as Record<string, unknown>;
  const assets = (ob.assets ?? {}) as Record<string, unknown>;
  const branding = (ob.branding ?? {}) as Record<string, unknown>;
  // Hub Step 4 Content — rich site copy. Customer-edited list of
  // services + tagline + about + bullets + FAQ. Empty/absent if
  // the customer hasn't touched the new content step yet.
  const content = (ob.content ?? {}) as Record<string, unknown>;
  // Phase 3 intake (services baseline, vibe, hours, etc.). Provides
  // the SHORT description + priceFrom that the content step doesn't
  // duplicate.
  const intake = (prospect.phase3Data ?? {}) as Record<string, unknown>;

  // --- Business info ---
  const businessName = prospect.business?.trim() || "";
  if (!businessName) {
    throw new AdapterError(
      "Business name missing — set Business Name on the prospect.",
    );
  }
  const business: BusinessInfo = {
    name: businessName,
    type: prospect.businessType?.trim() || "Local business",
    location: prospect.location?.trim() || "",
    phone: prospect.phone?.trim() || "",
    email: prospect.email?.trim() || "",
    address: optionalString(intake.address) ?? optionalString(ob.address),
    hours: optionalString(intake.hours) ?? optionalString(ob.hours),
  };
  if (!business.phone || !business.email) {
    throw new AdapterError(
      "Business phone + email both required for the site footer / contact section.",
    );
  }

  // --- Vibe ---
  const vibeRaw =
    optionalString(intake.vibe) ?? optionalString(branding.vibe);
  if (!vibeRaw || !VALID_VIBES.has(vibeRaw as Vibe)) {
    throw new AdapterError(
      `Vibe missing or invalid (got ${JSON.stringify(vibeRaw)}). ` +
        `Must be one of: traditional, modern, premium, friendly.`,
    );
  }
  const vibe = vibeRaw as Vibe;

  // --- Colours ---
  // Sourced from intake (where the colour wheel lives) or the
  // branding sub-blob if a future UI puts them elsewhere. Required.
  const primaryRaw =
    optionalString(intake.brandColorPrimary) ??
    optionalString(branding.brandColorPrimary);
  const secondaryRaw =
    optionalString(intake.brandColorSecondary) ??
    optionalString(branding.brandColorSecondary);
  if (!primaryRaw || !HEX_RE.test(primaryRaw)) {
    throw new AdapterError(
      `Brand primary colour missing or not a valid hex (got ${JSON.stringify(primaryRaw)}).`,
    );
  }
  if (!secondaryRaw || !HEX_RE.test(secondaryRaw)) {
    throw new AdapterError(
      `Brand secondary colour missing or not a valid hex (got ${JSON.stringify(secondaryRaw)}).`,
    );
  }
  const colors: BrandColors = {
    primary: primaryRaw as HexColor,
    secondary: secondaryRaw as HexColor,
  };

  // --- Services ---
  // Canonical list: content step services (post-edit) preferred,
  // Phase 3 intake as fallback. Each canonical entry merges with
  // its Phase 3 counterpart by name to pick up `description` +
  // `priceFrom` + `durationMinutes` (which the content step doesn't
  // duplicate). Renamed services lose the Phase 3 match — expected,
  // since the content step's name IS the canonical post-edit value.
  const phase3Services = (
    Array.isArray(intake.services) ? intake.services : []
  )
    .map((s) => normaliseService(s))
    .filter((s): s is Service => s !== null);
  const phase3ByName = new Map(phase3Services.map((s) => [s.name, s]));

  const contentServicesRaw = (
    Array.isArray(content.services) ? content.services : []
  ) as unknown[];

  let services: Service[];
  if (contentServicesRaw.length > 0) {
    // Content step has services — use them as the canonical list,
    // merging in Phase 3 description/price/duration where names match.
    services = contentServicesRaw
      .map((cs): Service | null => {
        if (!cs || typeof cs !== "object") return null;
        const obj = cs as Record<string, unknown>;
        const name = optionalString(obj.serviceName);
        if (!name) return null;
        const longDescription = optionalString(obj.longDescription);
        const featuresRaw = obj.features;
        const features = Array.isArray(featuresRaw)
          ? featuresRaw
              .filter((f): f is string => typeof f === "string")
              .map((f) => f.trim())
              .filter((f) => f.length > 0)
          : undefined;
        const pricingNotes = optionalString(obj.pricingNotes);

        const phase3Match = phase3ByName.get(name);
        // Description fallback chain: long → phase3 short → first
        // sentence of long description → bare placeholder. We always
        // need *some* description so cards aren't empty.
        const description =
          phase3Match?.description ??
          (longDescription
            ? longDescription.split(/[.!?]\s/)[0] + "."
            : "Get in touch for details.");
        return {
          name,
          description,
          longDescription,
          features: features && features.length > 0 ? features : undefined,
          pricingNotes,
          priceFrom: phase3Match?.priceFrom,
          durationMinutes: phase3Match?.durationMinutes,
        };
      })
      .filter((s): s is Service => s !== null);
  } else {
    // No content step services yet — use Phase 3 directly.
    services = phase3Services;
  }

  if (services.length === 0) {
    throw new AdapterError(
      "At least one service is required. Add one in the Hub Step 4 Content step, or fill in the Phase 3 intake services list.",
    );
  }

  // --- Brand assets ---
  // C5.3 introduced semantic asset roles (hero / about / services /
  // backgrounds / gallery). The adapter prefers semantic fields when
  // present, falls back to the legacy `photos` array (treats first
  // as hero, rest as gallery) so prospects from before the redesign
  // keep working.
  const logoUrl = readAssetUrl(assets.logo);
  if (!logoUrl) {
    throw new AdapterError(
      "Logo missing — Step 4 of the Onboarding Hub needs a logo upload.",
    );
  }

  // Legacy `photos` provides a fallback pool when semantic fields
  // aren't set yet. New uploads should populate `hero`, `about`,
  // `services[]`, `backgrounds[]`, `gallery[]` directly.
  const legacyPhotos = (assets.photos ?? []) as unknown[];
  const legacyPhotoUrls = Array.isArray(legacyPhotos)
    ? legacyPhotos.map(readAssetUrl).filter((u): u is string => u !== null)
    : [];

  // Hero: prefer semantic field; fall back to legacy[0]; fall back
  // to gallery[0] (in case the customer migrated everything to
  // gallery without picking a hero).
  const semanticGallery = (assets.gallery ?? []) as unknown[];
  const galleryUrls = Array.isArray(semanticGallery)
    ? semanticGallery.map(readAssetUrl).filter((u): u is string => u !== null)
    : [];

  const heroPhotoUrl =
    readAssetUrl(assets.hero) ??
    legacyPhotoUrls[0] ??
    galleryUrls[0];
  if (!heroPhotoUrl) {
    throw new AdapterError(
      "Hero photo missing — Step 4 needs at least one photo (use the Hero slot).",
    );
  }

  // About is intentional only — no auto-fallback. If the customer
  // didn't upload an About photo, the About page just omits the
  // image area.
  const aboutPhotoUrl = readAssetUrl(assets.about) ?? undefined;

  // Service photos map by serviceName so reordering services
  // doesn't break the mapping. Drop entries whose serviceName
  // doesn't match any current service (customer may have removed
  // the service after uploading).
  const serviceAssetsRaw = (assets.services ?? []) as unknown[];
  const serviceNames = new Set(services.map((s) => s.name));
  const servicePhotos = (
    Array.isArray(serviceAssetsRaw) ? serviceAssetsRaw : []
  )
    .map((sa) => {
      if (!sa || typeof sa !== "object") return null;
      const obj = sa as Record<string, unknown>;
      const url = readAssetUrl(obj);
      const name = optionalString(obj.serviceName);
      if (!url || !name || !serviceNames.has(name)) return null;
      return { serviceName: name, url };
    })
    .filter((p): p is { serviceName: string; url: string } => p !== null);

  const backgroundsRaw = (assets.backgrounds ?? []) as unknown[];
  const backgroundUrls = Array.isArray(backgroundsRaw)
    ? backgroundsRaw.map(readAssetUrl).filter((u): u is string => u !== null)
    : [];

  // Gallery: prefer semantic field; fall back to legacy photos
  // minus whatever became the hero.
  const galleryPhotoUrls = galleryUrls.length
    ? galleryUrls
    : legacyPhotoUrls.filter((u) => u !== heroPhotoUrl);

  const brandAssets: BrandAssets = {
    logoUrl,
    heroPhotoUrl,
    aboutPhotoUrl,
    servicePhotos,
    backgroundUrls,
    galleryPhotoUrls,
  };

  // --- Modules (optional) ---
  const modules: ModuleConfig = {};
  const selected = new Set(prospect.moduleSelections);
  if (selected.has("Online Booking")) {
    const calcomUrl = optionalString(tools.calcomBookingUrl);
    if (calcomUrl) modules.booking = { calcomUrl };
  }
  if (selected.has("Newsletter")) {
    const senderEmail = optionalString(tools.resendSignupEmail);
    if (senderEmail) modules.newsletter = { senderEmail };
  }
  if (selected.has("Enquiry Form")) {
    // Enquiry form posts back to a per-customer endpoint (Phase 2C
    // C5.3 wires that). For now, default to the customer's contact
    // email — the form sends straight to them via Resend transactional.
    modules.enquiry = { recipientEmail: business.email };
  }
  if (selected.has("Google Business Profile Setup/Audit")) {
    const listingUrl = optionalString(tools.gbpUrl);
    if (listingUrl) modules.gbp = { listingUrl };
  }

  // --- Custom copy (all optional) ---
  // Content step (post-payment, deeper) overrides Phase 3 intake
  // (pre-payment, scoping) for fields they share. New fields
  // (`aboutBullets`, `faq`) only exist in the content step.
  const aboutBulletsRaw = content.aboutBullets;
  const aboutBullets = Array.isArray(aboutBulletsRaw)
    ? aboutBulletsRaw
        .filter((b): b is string => typeof b === "string")
        .map((b) => b.trim())
        .filter((b) => b.length > 0)
    : undefined;

  const faqRaw = content.faq;
  const faq = Array.isArray(faqRaw)
    ? faqRaw
        .map((entry): FaqEntry | null => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const question = optionalString(obj.question);
          const answer = optionalString(obj.answer);
          return question && answer ? { question, answer } : null;
        })
        .filter((e): e is FaqEntry => e !== null)
    : undefined;

  const copy: CustomCopy = {
    tagline:
      optionalString(content.tagline) ?? optionalString(intake.tagline),
    aboutBlurb:
      optionalString(content.aboutBlurb) ?? optionalString(intake.aboutBlurb),
    aboutBullets: aboutBullets && aboutBullets.length > 0 ? aboutBullets : undefined,
    servicesIntro: optionalString(intake.servicesIntro),
    faq: faq && faq.length > 0 ? faq : undefined,
  };

  return {
    business,
    services,
    modules,
    brandAssets,
    colors,
    copy,
    vibe,
    domain,
  };
}

// ---------- Internals ----------

function optionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function readDomainSlug(ob: Record<string, unknown>): string {
  const d = (ob.domain ?? {}) as Record<string, unknown>;
  const value = optionalString(d.domain);
  if (!value) {
    throw new AdapterError(
      "Domain missing — Step 2 of the Onboarding Hub needs a domain entered.",
    );
  }
  return value;
}

function normaliseService(s: unknown): Service | null {
  if (!s || typeof s !== "object") return null;
  const obj = s as Record<string, unknown>;
  const name = optionalString(obj.name);
  const description = optionalString(obj.description);
  if (!name || !description) return null;
  const priceFrom =
    typeof obj.priceFrom === "number" && obj.priceFrom >= 0
      ? Math.round(obj.priceFrom)
      : undefined;
  const durationMinutes =
    typeof obj.durationMinutes === "number" && obj.durationMinutes > 0
      ? Math.round(obj.durationMinutes)
      : undefined;
  return { name, description, priceFrom, durationMinutes };
}

function readAssetUrl(asset: unknown): string | null {
  if (!asset || typeof asset !== "object") return null;
  const a = asset as Record<string, unknown>;
  // Prefer a precomputed publicUrl (set by the upload route) or
  // fall back to the R2 key that the deploy step will resolve to a
  // URL using R2_PUBLIC_URL_BASE.
  const publicUrl = optionalString(a.publicUrl);
  if (publicUrl) return publicUrl;
  const key = optionalString(a.key);
  if (!key) return null;
  // For now, the deploy step is responsible for prefixing
  // R2_PUBLIC_URL_BASE. The adapter just returns the raw key with
  // a placeholder marker so callers can post-process. This avoids
  // baking env access into a pure adapter.
  return `r2://${key}`;
}
