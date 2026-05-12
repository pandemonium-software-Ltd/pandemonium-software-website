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
  DayOfWeek,
  FaqEntry,
  HexColor,
  ModuleConfig,
  OpeningHoursEntry,
  Service,
  SiteGeneratorInput,
  Testimonial,
  TrustSignals,
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
  // Three-tier preference (most specific wins):
  //   1. content.business (Hub Step 4 Site Content > G. Business
  //      details — customer-edited canonical post-onboarding)
  //   2. prospect.* (set at Phase 1 / Phase 3 — original intake)
  //   3. intake.contactDetails / intake.address (Phase 3 deeper
  //      contact fields, may be richer than the bare prospect rec)
  const contentBusiness = (content.business ?? {}) as Record<string, unknown>;
  const intakeContact = (intake.contactDetails ?? {}) as Record<
    string,
    unknown
  >;
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
    phone:
      optionalString(contentBusiness.phoneDisplay) ??
      optionalString(intakeContact.phoneDisplay) ??
      prospect.phone?.trim() ??
      "",
    email:
      optionalString(contentBusiness.publicEmail) ??
      optionalString(intakeContact.publicEmail) ??
      prospect.email?.trim() ??
      "",
    address:
      optionalString(contentBusiness.address) ??
      optionalString(intakeContact.address) ??
      optionalString(intake.address) ??
      optionalString(ob.address),
    hours:
      formatOpeningHours(contentBusiness.openingHours) ??
      formatOpeningHours(intakeContact.openingHours) ??
      optionalString(intake.hours) ??
      optionalString(ob.hours),
    // Structured per-day record for the Contact page hours table.
    // Same source preference as `hours` (content step → intake
    // contactDetails). Undefined when neither has structured data
    // — Contact page falls back to the flat string render.
    hoursStructured:
      readOpeningHoursStructured(contentBusiness.openingHours) ??
      readOpeningHoursStructured(intakeContact.openingHours),
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
    // Content step has services — use them as the canonical list.
    // For description + priceFrom + duration, prefer content step
    // values (NEW C5.5 — these are now editable in Site Content),
    // fall back to Phase 3 by name match, then to a derived /
    // placeholder description so cards are never empty.
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

        // Description: content step preferred, Phase 3 fallback,
        // derive-from-long fallback, placeholder last.
        const contentDescription = optionalString(obj.description);
        const description =
          contentDescription ??
          phase3Match?.description ??
          (longDescription
            ? longDescription.split(/[.!?]\s/)[0] + "."
            : "Get in touch for details.");

        // Price: content step preferred (allows updates), Phase 3
        // fallback. Either may be undefined ("from £X" not shown).
        const contentPriceFrom =
          typeof obj.priceFrom === "number" && obj.priceFrom >= 0
            ? Math.round(obj.priceFrom)
            : undefined;
        const priceFrom = contentPriceFrom ?? phase3Match?.priceFrom;

        return {
          name,
          description,
          longDescription,
          features: features && features.length > 0 ? features : undefined,
          pricingNotes,
          priceFrom,
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
  // Newsletter sender email is set further below alongside the
  // full newsletter widget config (single source of truth so the
  // customer-site template gets a complete object).

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
  // Newsletter — emit the subscribe widget config when the
  // customer's bought the module. The widget renders in the
  // footer regardless of whether subscribers exist; what gates
  // it is the module being bought + the customer having a
  // verified Resend sender domain (Step 3 Tools).
  if (selected.has("Newsletter")) {
    const newsletterCfg = (content.newsletter ?? {}) as {
      config?: {
        widgetHeadline?: unknown;
        widgetBody?: unknown;
        widgetCta?: unknown;
        senderEmailLocal?: unknown;
      };
    };
    const cfg = newsletterCfg.config ?? {};
    // Build the sender email: customer's local-part + their
    // domain. Fall back to whatever was captured in Step 3 Tools
    // (resendSignupEmail) if newsletter setup hasn't been done.
    const senderLocal = optionalString(cfg.senderEmailLocal);
    const customerDomain =
      ((prospect.onboardingData ?? {}) as {
        domain?: { domain?: unknown };
      }).domain?.domain;
    const customerDomainStr =
      typeof customerDomain === "string" ? customerDomain : null;
    const senderEmail =
      senderLocal && customerDomainStr
        ? `${senderLocal}@${customerDomainStr}`
        : optionalString(tools.resendSignupEmail);
    modules.newsletter = {
      customerToken: prospect.token,
      // Adapter applies the same defaults as the Hub form preview
      // so the customer-site template can render directly without
      // a fallback layer.
      widgetHeadline:
        optionalString(cfg.widgetHeadline) ?? "Stay in the loop",
      widgetBody:
        optionalString(cfg.widgetBody) ??
        "One short update a month — tips, offers, news. No spam.",
      widgetCta: optionalString(cfg.widgetCta) ?? "Subscribe",
      // Marketing site origin — submissions POST here. Built-time
      // env so each Worker bundle ships with a known endpoint.
      apiOrigin:
        process.env.NEXT_PUBLIC_SITE_URL ??
        "https://modu-forge.co.uk",
      senderEmail,
    };
  }
  // Offers — only emit when the customer has a current offer
  // configured. The customer-site does an additional date-range
  // check at render time, so a stale build won't show an expired
  // strip indefinitely. We still skip emitting expired offers here
  // (saves a render pass that'd do nothing).
  if (selected.has("Offers")) {
    const offersRaw = (content.offers ?? {}) as {
      current?: {
        headline?: unknown;
        body?: unknown;
        ctaLabel?: unknown;
        ctaUrl?: unknown;
        startsAt?: unknown;
        endsAt?: unknown;
      };
    };
    const cur = offersRaw.current;
    if (
      cur &&
      typeof cur.headline === "string" &&
      cur.headline.trim() &&
      typeof cur.startsAt === "string" &&
      typeof cur.endsAt === "string"
    ) {
      // Skip emit if the offer has already ended at build time —
      // saves the site shipping a strip that's stale on day one.
      const today = new Date().toISOString().slice(0, 10);
      if (cur.endsAt >= today) {
        modules.offer = {
          headline: cur.headline.trim(),
          body: optionalString(cur.body),
          ctaLabel: optionalString(cur.ctaLabel),
          ctaUrl: optionalString(cur.ctaUrl),
          startsAt: cur.startsAt,
          endsAt: cur.endsAt,
        };
      }
    }
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

  // Testimonials — content step canonical, Phase 3 socialProof
  // fallback (so older customers without content-step testimonials
  // still see their intake quotes on the live site).
  const intakeSocial = (intake.socialProof ?? {}) as Record<string, unknown>;
  const testimonialsRaw =
    Array.isArray(content.testimonials) && content.testimonials.length > 0
      ? (content.testimonials as unknown[])
      : Array.isArray(intakeSocial.testimonials)
        ? (intakeSocial.testimonials as unknown[])
        : [];
  const testimonials = testimonialsRaw
    .map((t): Testimonial | null => {
      if (!t || typeof t !== "object") return null;
      const obj = t as Record<string, unknown>;
      const name = optionalString(obj.name);
      const quote = optionalString(obj.quote);
      if (!name || !quote) return null;
      // Rating: only accept clean integers in 1-5 range. Anything
      // else (NaN, floats, out-of-range) silently drops to undefined
      // so a corrupted Notion blob can't poison the JSON-LD.
      const ratingRaw = obj.rating;
      const rating =
        typeof ratingRaw === "number" &&
        Number.isInteger(ratingRaw) &&
        ratingRaw >= 1 &&
        ratingRaw <= 5
          ? ratingRaw
          : undefined;
      return {
        name,
        quote,
        location: optionalString(obj.location),
        ...(rating ? { rating } : {}),
      };
    })
    .filter((t): t is Testimonial => t !== null);

  // Trust signals — content step canonical, Phase 3 socialProof
  // fallback for each individual field.
  const contentTrust = (content.trust ?? {}) as Record<string, unknown>;
  const trust: TrustSignals = {
    yearsExperience:
      (typeof contentTrust.yearsExperience === "number"
        ? contentTrust.yearsExperience
        : undefined) ??
      (typeof intakeSocial.yearsExperience === "number"
        ? intakeSocial.yearsExperience
        : undefined),
    associations:
      optionalString(contentTrust.associations) ??
      optionalString(intakeSocial.associations),
    awards:
      optionalString(contentTrust.awards) ??
      optionalString(intakeSocial.awards),
  };
  const trustHasAny =
    typeof trust.yearsExperience === "number" ||
    !!trust.associations ||
    !!trust.awards;

  const copy: CustomCopy = {
    tagline:
      optionalString(content.tagline) ?? optionalString(intake.tagline),
    aboutBlurb:
      optionalString(content.aboutBlurb) ?? optionalString(intake.aboutBlurb),
    aboutBullets: aboutBullets && aboutBullets.length > 0 ? aboutBullets : undefined,
    servicesIntro: optionalString(intake.servicesIntro),
    faq: faq && faq.length > 0 ? faq : undefined,
    testimonials: testimonials.length > 0 ? testimonials : undefined,
    trust: trustHasAny ? trust : undefined,
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

/**
 * Convert a structured openingHours record (from Hub Step 4 G or
 * Phase 3 contactDetails) into a single human-readable string for
 * the BusinessInfo.hours field. Returns undefined if the record is
 * missing or every day is closed.
 *
 * Example output: "Mon-Fri 09:00-17:00, Sat 10:00-14:00, closed Sun"
 */
function formatOpeningHours(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  const entries: { day: string; from: string; to: string }[] = [];
  for (const day of days) {
    const slot = (raw as Record<string, unknown>)[day];
    if (!slot || typeof slot !== "object") continue;
    const obj = slot as { open?: boolean; from?: string; to?: string };
    if (obj.open && obj.from && obj.to) {
      entries.push({ day, from: obj.from, to: obj.to });
    }
  }
  if (entries.length === 0) return undefined;
  // Compress contiguous same-hours runs into ranges (Mon-Fri 09:00-17:00).
  const groups: { days: string[]; from: string; to: string }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.from === e.from && last.to === e.to) {
      last.days.push(e.day);
    } else {
      groups.push({ days: [e.day], from: e.from, to: e.to });
    }
  }
  return groups
    .map((g) => {
      const range =
        g.days.length === 1 ? g.days[0] : `${g.days[0]}-${g.days[g.days.length - 1]}`;
      return `${range} ${g.from}-${g.to}`;
    })
    .join(", ");
}

/**
 * Validate + normalise a raw openingHours record into the typed
 * structured shape templates can render directly. Returns
 * undefined if the input is missing or has zero usable entries
 * (every day either absent or `open: false` with nothing else),
 * so the caller can fall back to a free-text representation.
 *
 * Defensive: tolerates extra/wrong keys, coerces only what
 * matches the {open, from?, to?} shape. Only known weekday keys
 * (Mon-Sun) get through — typos or wrong-case keys ("monday",
 * "MON") are dropped silently rather than rendered as "Closed".
 */
function readOpeningHoursStructured(
  raw: unknown,
): Partial<Record<DayOfWeek, OpeningHoursEntry>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const validDays: ReadonlySet<DayOfWeek> = new Set([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  const out: Partial<Record<DayOfWeek, OpeningHoursEntry>> = {};
  let hasAny = false;
  for (const [day, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!validDays.has(day as DayOfWeek)) continue;
    if (!val || typeof val !== "object") continue;
    const obj = val as Record<string, unknown>;
    const open = typeof obj.open === "boolean" ? obj.open : false;
    const from = typeof obj.from === "string" ? obj.from : undefined;
    const to = typeof obj.to === "string" ? obj.to : undefined;
    out[day as DayOfWeek] = { open, from, to };
    hasAny = true;
  }
  return hasAny ? out : undefined;
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
