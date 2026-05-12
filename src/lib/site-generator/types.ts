// Site generator data contract — the single canonical input shape
// every template renders from. Adapters pull from Notion's three
// JSON blobs (Phase 2 / Phase 3 / Onboarding Data) into THIS shape;
// templates only ever see this shape.
//
// One contract = templates can be tested with hand-written fixtures,
// and adding a new template never requires touching the adapter.
//
// Keep this file dependency-free (no Notion types, no schemas) so
// templates can import it without dragging server deps.

/**
 * The four standard vibes (matches src/lib/schemas.ts VIBE_OPTIONS).
 * Each maps to one template directory under templates/.
 */
export type Vibe = "traditional" | "modern" | "premium" | "friendly";

/**
 * Hex colour string, including the leading #. Validation happens at
 * the adapter boundary — templates trust the value here is well-formed.
 */
export type HexColor = `#${string}`;

/**
 * Day-of-week keys used by the structured opening-hours record.
 * Keep these short three-letter forms aligned with the Hub Step 4
 * Site Content > Business details editor + Phase 3 intake.
 */
export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

/**
 * Per-day opening-hours entry. `from` / `to` are 24-hour HH:mm
 * strings (matching the Hub editor's <input type="time"> output).
 * When `open` is false, both `from` and `to` are ignored — render
 * as "Closed".
 */
export type OpeningHoursEntry = {
  open: boolean;
  from?: string;
  to?: string;
};

export type BusinessInfo = {
  /** Trading name shown in header / hero / footer. */
  name: string;
  /** e.g. "Plumber", "Solicitor" — used in JSON-LD + page copy. */
  type: string;
  /** Town / county for local SEO + footer. */
  location: string;
  /** Display phone (formatted, with spaces). */
  phone: string;
  /** Public-facing email (often `hello@` or `enquiries@`). */
  email: string;
  /** Optional postal address — populates footer NAP + JSON-LD. */
  address?: string;
  /** Compact human-readable hours summary for inline display
   *  (footer NAP, header banner). Compresses contiguous same-hours
   *  runs ("Mon-Fri 09:00-17:00, Sat 10:00-14:00"). Derived from
   *  `hoursStructured` when present; falls back to the customer's
   *  free-text hours if no structured record exists. */
  hours?: string;
  /** Per-day structured hours for the Contact page table render.
   *  Optional — only present when the customer set hours via the
   *  Hub Step 4 Business details opening-hours grid (not via the
   *  legacy free-text field). Keys are absent when the customer
   *  hasn't touched a particular day. */
  hoursStructured?: Partial<Record<DayOfWeek, OpeningHoursEntry>>;
};

export type Service = {
  /** Customer-facing name, e.g. "Boiler installation". */
  name: string;
  /** 1-2 sentence description (from Phase 3 intake, the canonical
   *  short-form summary used in compact contexts like a card grid). */
  description: string;
  /**
   * Long-form description from the Hub Step 4 Content step.
   * Renders on the dedicated services page when present; falls
   * back to `description` for compact card views.
   */
  longDescription?: string;
  /** "Key features" bullets from Hub Step 4 Content. Up to 8. */
  features?: readonly string[];
  /** Free-form pricing copy from Hub Step 4 Content (overrides the
   *  simple "From £X" rendering when set). */
  pricingNotes?: string;
  /** Optional starting price; integer pounds. */
  priceFrom?: number;
  /** Optional duration in minutes for booking. */
  durationMinutes?: number;
};

/**
 * Q&A pair captured in Hub Step 4 Content. Renders on the FAQ
 * page (and as JSON-LD FAQPage schema for SEO). Up to 10.
 */
export type FaqEntry = {
  question: string;
  answer: string;
};

/**
 * Customer testimonial captured in Hub Step 4 Content (seeded from
 * Phase 3 socialProof.testimonials, except `rating` which is
 * Hub-only — Phase 3 didn't capture star ratings). Renders on the
 * home page + About page. Up to 5.
 */
export type Testimonial = {
  name: string;
  /** Optional location ("Headington, Oxford"). */
  location?: string;
  quote: string;
  /** Optional 1-5 star rating. Drives both the visual star row
   *  on the customer site AND per-Review ratingValue in JSON-LD.
   *  Unset = no star row + AggregateRating treats as 5. */
  rating?: number;
};

/**
 * Trust signals captured in Hub Step 4 Content (seeded from Phase
 * 3 socialProof). Renders as a small horizontal strip on the
 * About page header. Every field optional.
 */
export type TrustSignals = {
  /** Years of experience. Renders as "15 years' experience". */
  yearsExperience?: number;
  /** Free-text list of professional bodies / certifications. */
  associations?: string;
  /** Free-text list of awards or recognitions. */
  awards?: string;
};

export type ModuleConfig = {
  /** Cal.com event link if booking module bought. */
  booking?: { calcomUrl: string };
  /** Newsletter module — subscribe widget config + sender info.
   *  When present, the customer-site footer renders the
   *  SubscribeWidget. Submissions POST to the marketing-site
   *  endpoint at `apiOrigin` with `customerToken`. */
  newsletter?: {
    customerToken: string;
    widgetHeadline: string;
    widgetBody: string;
    widgetCta: string;
    apiOrigin: string;
    /** Resend sender email — used by the dashboard composer's
     *  preview + the Phase 1B send pipeline. */
    senderEmail?: string;
  };
  /** Form-recipient email if enquiry form bought. */
  enquiry?: { recipientEmail: string };
  /** Public GBP listing URL if GBP audit bought. */
  gbp?: { listingUrl: string };
  /** Active promotional offer — only present when the Offers
   *  module was bought AND the customer has set an offer whose
   *  date range straddles "now" (the build-time `now`, but the
   *  rendered strip also checks at render time to handle stale
   *  builds). All fields the customer wrote in Hub Step 4 are
   *  passed through verbatim. */
  offer?: {
    headline: string;
    body?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    /** ISO date YYYY-MM-DD inclusive. */
    startsAt: string;
    endsAt: string;
  };
};

export type BrandAssets = {
  /** R2 public URL for the customer's logo. */
  logoUrl: string;
  /** R2 public URL for the hero photo (full-width, home page). */
  heroPhotoUrl: string;
  /** R2 public URL for the about-us / team photo. Optional —
   *  the About page omits the image area if not set. NEW C5.3. */
  aboutPhotoUrl?: string;
  /**
   * Service-specific photos, paired by service name. The customer-
   * site Services page maps each into the corresponding service card.
   * Order is NOT positional — match by `serviceName`. NEW C5.3.
   */
  servicePhotos: readonly { serviceName: string; url: string }[];
  /** Background imagery for section dividers / subtle decoration.
   *  Optional. NEW C5.3. */
  backgroundUrls: readonly string[];
  /** R2 public URLs for additional gallery photos. */
  galleryPhotoUrls: readonly string[];
};

export type BrandColors = {
  /** Primary brand colour — used for buttons, links, hero accents. */
  primary: HexColor;
  /** Secondary brand colour — used for subtle accents, hover states. */
  secondary: HexColor;
};

/**
 * Customer-written copy that overrides template defaults. All
 * optional — templates have sensible fallbacks built from
 * `business` if these are absent.
 */
export type CustomCopy = {
  /** Hero tagline, ≤80 chars ideally. */
  tagline?: string;
  /** Multi-paragraph "about us" blurb. */
  aboutBlurb?: string;
  /** "What makes us different" bullets — rendered on the About
   *  page as a styled list. From Hub Step 4 Content. Up to 8. */
  aboutBullets?: readonly string[];
  /** Lead-in copy for the services section. */
  servicesIntro?: string;
  /** FAQ Q&A pairs — rendered on the dedicated /faq page +
   *  emitted as FAQPage JSON-LD. From Hub Step 4 Content. */
  faq?: readonly FaqEntry[];
  /** Customer testimonials — rendered on home + About pages.
   *  Up to 5. From Hub Step 4 Content (seeded from Phase 3). */
  testimonials?: readonly Testimonial[];
  /** Trust signals — rendered as a strip on the About page.
   *  From Hub Step 4 Content (seeded from Phase 3). */
  trust?: TrustSignals;
};

/**
 * The single canonical input passed to every template's render
 * function. Adapters normalise from Notion into this shape.
 */
export type SiteGeneratorInput = {
  business: BusinessInfo;
  services: readonly Service[];
  modules: ModuleConfig;
  brandAssets: BrandAssets;
  colors: BrandColors;
  copy: CustomCopy;
  vibe: Vibe;
  /** Customer's primary domain (apex). Used for canonical URLs +
   *  open-graph tags. e.g. "alexsbakery.co.uk". */
  domain: string;
};

/**
 * Template render output: a map of asset paths (relative to site
 * root) → file contents. Workers Static Assets bundles consume
 * this directly.
 *
 * String values are text files (HTML, CSS, JS). Uint8Array values
 * are binary (favicons, copied images). Templates emit at minimum
 * `index.html` + `styles.css`; richer templates may emit more
 * pages (`/about/index.html`) and assets.
 */
export type SiteAssetBundle = {
  [path: string]: string | Uint8Array;
};

/**
 * Template render function signature. Every template under
 * src/lib/site-generator/templates/<vibe>/index.ts default-exports
 * a function matching this shape.
 */
export type TemplateRenderer = (input: SiteGeneratorInput) => SiteAssetBundle;
