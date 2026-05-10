// Customer-site data contract — local copy of the SiteGeneratorInput
// shape from the marketing-site repo. Kept in sync manually for now;
// could be lifted into a shared package later if the maintenance
// burden becomes meaningful.
//
// IMPORTANT: this MUST stay structurally identical to
// `src/lib/site-generator/types.ts` in the marketing-site repo so
// the same `adaptProspect` adapter feeds both consumers without
// translation.

export type Vibe = "traditional" | "modern" | "premium" | "friendly";
export type HexColor = `#${string}`;

/** Day-of-week keys for the structured opening-hours record.
 *  Mirror of marketing-site DayOfWeek. NEW C5.5+. */
export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

/** Per-day opening-hours entry. `from` / `to` are 24-hour HH:mm.
 *  NEW C5.5+. */
export type OpeningHoursEntry = {
  open: boolean;
  from?: string;
  to?: string;
};

export type BusinessInfo = {
  name: string;
  type: string;
  location: string;
  phone: string;
  email: string;
  address?: string;
  /** Compact one-liner for the footer ("Mon-Fri 09:00-17:00, Sat
   *  10:00-14:00"). Derived from `hoursStructured` or free-text. */
  hours?: string;
  /** Per-day structured hours — populates the Contact page table
   *  with explicit "Closed" rows for unset days. NEW C5.5+. */
  hoursStructured?: Partial<Record<DayOfWeek, OpeningHoursEntry>>;
};

export type Service = {
  name: string;
  description: string;
  /** Long-form description from the Hub Step 4 Content step.
   *  Renders on the dedicated services page; falls back to
   *  `description` for compact card views. NEW C5.5. */
  longDescription?: string;
  /** "Key features" bullets, up to 8. NEW C5.5. */
  features?: readonly string[];
  /** Free-form pricing copy — overrides "From £X" rendering when
   *  set. NEW C5.5. */
  pricingNotes?: string;
  priceFrom?: number;
  durationMinutes?: number;
};

/** Q&A pair from Hub Step 4 Content. Renders on /faq. NEW C5.5. */
export type FaqEntry = {
  question: string;
  answer: string;
};

/** Customer testimonial — renders on home + about pages.
 *  From Hub Step 4 Content (seeded from Phase 3). NEW C5.5+. */
export type Testimonial = {
  name: string;
  location?: string;
  quote: string;
};

/** Trust signals — renders as a strip on the About page.
 *  From Hub Step 4 Content (seeded from Phase 3). NEW C5.5+. */
export type TrustSignals = {
  yearsExperience?: number;
  associations?: string;
  awards?: string;
};

export type ModuleConfig = {
  booking?: { calcomUrl: string };
  newsletter?: { senderEmail: string };
  enquiry?: { recipientEmail: string };
  gbp?: { listingUrl: string };
};

export type BrandAssets = {
  logoUrl: string;
  heroPhotoUrl: string;
  /** Optional team / owner / about-us photo. About page omits the
   *  image area if not set. NEW C5.3. */
  aboutPhotoUrl?: string;
  /** Service-specific photos keyed by service name. NEW C5.3. */
  servicePhotos: readonly { serviceName: string; url: string }[];
  /** Background imagery for section dividers. NEW C5.3. */
  backgroundUrls: readonly string[];
  galleryPhotoUrls: readonly string[];
};

export type BrandColors = {
  primary: HexColor;
  secondary: HexColor;
};

export type CustomCopy = {
  tagline?: string;
  aboutBlurb?: string;
  /** "What makes us different" bullets — rendered on the About
   *  page as a styled list. From Hub Step 4 Content. NEW C5.5. */
  aboutBullets?: readonly string[];
  servicesIntro?: string;
  /** FAQ Q&A pairs — rendered on /faq + emitted as FAQPage
   *  JSON-LD for SEO. From Hub Step 4 Content. NEW C5.5. */
  faq?: readonly FaqEntry[];
  /** Customer testimonials. NEW C5.5+. */
  testimonials?: readonly Testimonial[];
  /** Trust signals (years, associations, awards). NEW C5.5+. */
  trust?: TrustSignals;
};

export type SiteData = {
  business: BusinessInfo;
  services: readonly Service[];
  modules: ModuleConfig;
  brandAssets: BrandAssets;
  colors: BrandColors;
  copy: CustomCopy;
  vibe: Vibe;
  domain: string;
};
