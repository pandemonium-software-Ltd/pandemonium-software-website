// Mini home-page mockup used on the marketing site + the Phase 3
// intake vibe picker. Shows what a customer-site looks like in each
// of the four vibes (modern / traditional / premium / friendly) so
// the customer can SEE the difference rather than read a tagline
// and guess.
//
// Design notes:
//  - Uses a single fixed colour for the "primary" + "secondary" CTA
//    so the preview is about typography + layout feel, not the
//    customer's eventual dual-colour scheme. The actual customer
//    site will pick those colours per-customer.
//  - Per-vibe styling matches the customer-site-template's CSS
//    (see customer-site-template/src/app/globals.css [data-vibe]
//    blocks). Mirror any changes there here so the preview stays
//    accurate.
//  - Fonts are loaded via <link rel="preconnect"> + the
//    `loadVibePreviewFonts()` helper imported once in the marketing
//    site root layout. The preview itself doesn't load fonts to
//    avoid duplicate requests.
//  - Self-contained — no Tailwind utility classes from the customer-
//    site-template, just inline style + a few utility classes.
//    Renders the same way regardless of where it's embedded.

import type { CSSProperties } from "react";

export type Vibe = "modern" | "traditional" | "premium" | "friendly";

/** Per-vibe style tokens. Mirror of the [data-vibe="..."] CSS
 *  variable overrides in the customer-site-template. */
const VIBE_STYLES: Record<
  Vibe,
  {
    headingFont: string;
    bodyFont: string;
    headingWeight: number;
    headingLetterSpacing: string;
    bodyLetterSpacing: string;
    btnRadius: string;
    cardRadius: string;
    inputRadius: string;
    summary: string;
    label: string;
  }
> = {
  modern: {
    headingFont: `"Geist", system-ui, sans-serif`,
    bodyFont: `"Geist", system-ui, sans-serif`,
    headingWeight: 600,
    headingLetterSpacing: "-0.02em",
    bodyLetterSpacing: "0",
    btnRadius: "9999px",
    cardRadius: "1rem",
    inputRadius: "0.75rem",
    label: "Modern",
    summary:
      "Clean, contemporary, lots of whitespace. The current ModuForge default — best for new businesses building a first impression.",
  },
  traditional: {
    headingFont: `"Playfair Display", "Times New Roman", Georgia, serif`,
    bodyFont: `"Lora", Georgia, "Times New Roman", serif`,
    headingWeight: 700,
    headingLetterSpacing: "-0.005em",
    bodyLetterSpacing: "0.005em",
    btnRadius: "0.25rem",
    cardRadius: "0.375rem",
    inputRadius: "0.25rem",
    label: "Traditional",
    summary:
      "Classic, established, set-in-print feel. Best for businesses with years of history they want visitors to feel.",
  },
  premium: {
    headingFont: `"Cormorant Garamond", "Playfair Display", Georgia, serif`,
    bodyFont: `"Inter", "Geist", system-ui, sans-serif`,
    headingWeight: 500,
    headingLetterSpacing: "0.005em",
    bodyLetterSpacing: "0.01em",
    btnRadius: "0.125rem",
    cardRadius: "0.5rem",
    inputRadius: "0.25rem",
    label: "Premium",
    summary:
      "Refined, airy, sophisticated. Lots of negative space, light typography. Best for higher-ticket / luxury / craft businesses.",
  },
  friendly: {
    headingFont: `"Nunito", "Quicksand", system-ui, sans-serif`,
    bodyFont: `"Nunito", "Quicksand", system-ui, sans-serif`,
    headingWeight: 800,
    headingLetterSpacing: "-0.015em",
    bodyLetterSpacing: "0",
    btnRadius: "9999px",
    cardRadius: "1.5rem",
    inputRadius: "1rem",
    label: "Friendly",
    summary:
      "Warm, approachable, rounded-everything. Best for community-facing / family-run / customer-service-led businesses.",
  },
};

/** Fixed preview accent. Used for ALL vibes so the customer compares
 *  TYPOGRAPHY + LAYOUT, not "did I pick the right teal". Same value
 *  serves as primary AND secondary so a real customer's eventual
 *  dual-colour pairing isn't pre-empted. */
const PREVIEW_ACCENT = "#0f766e"; // teal-700
const PREVIEW_ACCENT_TEXT = "#ffffff";

export const VIBE_PREVIEW_LIST: Vibe[] = [
  "modern",
  "traditional",
  "premium",
  "friendly",
];

/** Export so the marketing site layout can pre-link all 4 fonts in
 *  <head> without each preview re-declaring them on mount. Loading
 *  once at the layout level keeps the document weight predictable
 *  even when multiple previews render on a single page. */
export const VIBE_PREVIEW_FONTS_URL =
  "https://fonts.googleapis.com/css2" +
  "?family=Geist:wght@400;500;600" +
  "&family=Playfair+Display:wght@500;600;700" +
  "&family=Lora:wght@400;500;600" +
  "&family=Cormorant+Garamond:wght@400;500;600" +
  "&family=Inter:wght@400;500;600" +
  "&family=Nunito:wght@400;600;700;800" +
  "&display=swap";

type Size = "thumb" | "full";

type Props = {
  vibe: Vibe;
  /** "thumb" = compact for grids (~320px wide, 4-in-a-row).
   *  "full"  = larger preview for the qualification form picker. */
  size?: Size;
  /** Business name to show in the preview's nav + hero. Defaults to
   *  a neutral placeholder so the preview works without context. */
  businessName?: string;
  /** Optional className to merge with the preview's wrapper. */
  className?: string;
};

export default function VibePreview({
  vibe,
  size = "thumb",
  businessName = "Your Business",
  className,
}: Props) {
  const s = VIBE_STYLES[vibe];

  // Size-driven scale tokens. We pick rem-equivalents (px) so the
  // preview renders consistently regardless of the parent element's
  // font-size. Browser-frame chrome stays constant; only interior
  // content scales.
  const scale = size === "full" ? 1 : 0.72;
  const headingPx = Math.round(28 * scale);
  const bodyPx = Math.round(13 * scale);
  const captionPx = Math.round(10 * scale);
  const navPx = Math.round(11 * scale);

  const wrapperStyle: CSSProperties = {
    fontFamily: s.bodyFont,
    letterSpacing: s.bodyLetterSpacing,
    fontSize: `${bodyPx}px`,
    color: "#0f172a", // navy-900
    background: "#fefdf8", // cream-50
    borderRadius: s.cardRadius,
    overflow: "hidden",
    boxShadow:
      "0 1px 2px rgba(15,23,42,0.06), 0 6px 18px rgba(15,23,42,0.08)",
    border: "1px solid rgba(15,23,42,0.08)",
    display: "flex",
    flexDirection: "column",
  };

  const headingStyle: CSSProperties = {
    fontFamily: s.headingFont,
    fontWeight: s.headingWeight,
    letterSpacing: s.headingLetterSpacing,
    fontSize: `${headingPx}px`,
    lineHeight: 1.1,
    color: "#0f172a",
    margin: 0,
  };

  const btnStyle: CSSProperties = {
    background: PREVIEW_ACCENT,
    color: PREVIEW_ACCENT_TEXT,
    borderRadius: s.btnRadius,
    fontFamily: s.bodyFont,
    fontWeight: 600,
    fontSize: `${Math.round(11 * scale)}px`,
    padding: `${Math.round(7 * scale)}px ${Math.round(14 * scale)}px`,
    display: "inline-block",
    lineHeight: 1.2,
  };

  const btnSecondaryStyle: CSSProperties = {
    background: "transparent",
    color: "#0f172a",
    border: `1.5px solid rgba(15,23,42,0.7)`,
    borderRadius: s.btnRadius,
    fontFamily: s.bodyFont,
    fontWeight: 600,
    fontSize: `${Math.round(11 * scale)}px`,
    padding: `${Math.round(7 * scale)}px ${Math.round(14 * scale)}px`,
    display: "inline-block",
    lineHeight: 1.2,
  };

  const navItemStyle: CSSProperties = {
    fontFamily: s.bodyFont,
    fontSize: `${navPx}px`,
    color: "#475569",
    letterSpacing: s.bodyLetterSpacing,
  };

  const serviceCardStyle: CSSProperties = {
    background: "#ffffff",
    borderRadius: s.cardRadius,
    border: "1px solid rgba(15,23,42,0.08)",
    padding: `${Math.round(14 * scale)}px ${Math.round(12 * scale)}px`,
    flex: "1 1 0",
    minWidth: 0,
  };

  return (
    <div
      className={className}
      role="img"
      aria-label={`${s.label} vibe — mini preview of a customer home page`}
    >
      {/* Browser chrome frame — three macOS-style dots + a faux
          address bar give the "screenshot" affordance immediately. */}
      <div style={wrapperStyle}>
        <div
          style={{
            background: "#f1f5f9",
            padding: `${Math.round(8 * scale)}px ${Math.round(12 * scale)}px`,
            display: "flex",
            alignItems: "center",
            gap: `${Math.round(8 * scale)}px`,
            borderBottom: "1px solid rgba(15,23,42,0.06)",
          }}
        >
          <span
            style={{
              width: `${Math.round(8 * scale)}px`,
              height: `${Math.round(8 * scale)}px`,
              borderRadius: "9999px",
              background: "#ef4444",
            }}
          />
          <span
            style={{
              width: `${Math.round(8 * scale)}px`,
              height: `${Math.round(8 * scale)}px`,
              borderRadius: "9999px",
              background: "#f59e0b",
            }}
          />
          <span
            style={{
              width: `${Math.round(8 * scale)}px`,
              height: `${Math.round(8 * scale)}px`,
              borderRadius: "9999px",
              background: "#10b981",
            }}
          />
          <span
            style={{
              marginLeft: `${Math.round(8 * scale)}px`,
              flex: 1,
              background: "#ffffff",
              borderRadius: "0.375rem",
              padding: `${Math.round(3 * scale)}px ${Math.round(8 * scale)}px`,
              fontSize: `${Math.round(9 * scale)}px`,
              color: "#94a3b8",
              fontFamily: s.bodyFont,
              border: "1px solid rgba(15,23,42,0.06)",
            }}
          >
            {businessName.toLowerCase().replace(/\s+/g, "")}.co.uk
          </span>
        </div>

        {/* Nav row — logo placeholder + 3 items. Logo block uses the
            preview accent so the page reads as "branded". */}
        <div
          style={{
            padding: `${Math.round(12 * scale)}px ${Math.round(18 * scale)}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: `${Math.round(12 * scale)}px`,
            borderBottom: "1px solid rgba(15,23,42,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: `${Math.round(8 * scale)}px`,
            }}
          >
            <span
              style={{
                width: `${Math.round(18 * scale)}px`,
                height: `${Math.round(18 * scale)}px`,
                background: PREVIEW_ACCENT,
                borderRadius: s.btnRadius,
              }}
            />
            <span
              style={{
                fontFamily: s.headingFont,
                fontWeight: s.headingWeight,
                fontSize: `${Math.round(13 * scale)}px`,
                color: "#0f172a",
                letterSpacing: s.headingLetterSpacing,
              }}
            >
              {businessName}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: `${Math.round(14 * scale)}px`,
            }}
          >
            <span style={navItemStyle}>Services</span>
            <span style={navItemStyle}>About</span>
            <span style={navItemStyle}>Contact</span>
          </div>
        </div>

        {/* Hero — placeholder image + headline + 2 CTA buttons. */}
        <div
          style={{
            padding: `${Math.round(20 * scale)}px ${Math.round(18 * scale)}px`,
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
              borderRadius: s.cardRadius,
              height: `${Math.round(96 * scale)}px`,
              marginBottom: `${Math.round(14 * scale)}px`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Decorative diagonal sheen so the hero reads as a
                photograph at a glance, not a flat grey block. */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 35%, rgba(15,23,42,0.1) 100%)",
              }}
            />
          </div>
          <h1 style={headingStyle}>
            Trusted {businessName}.{" "}
            <span style={{ color: PREVIEW_ACCENT }}>Built for results.</span>
          </h1>
          <p
            style={{
              fontSize: `${bodyPx}px`,
              color: "#475569",
              marginTop: `${Math.round(8 * scale)}px`,
              lineHeight: 1.5,
              fontFamily: s.bodyFont,
              letterSpacing: s.bodyLetterSpacing,
            }}
          >
            A short, confident promise about what the business does,
            for whom, and where.
          </p>
          <div
            style={{
              marginTop: `${Math.round(14 * scale)}px`,
              display: "flex",
              flexWrap: "wrap",
              gap: `${Math.round(8 * scale)}px`,
            }}
          >
            <span style={btnStyle}>Get in touch</span>
            <span style={btnSecondaryStyle}>View services</span>
          </div>
        </div>

        {/* Services grid — 3 mini cards. Demonstrates the vibe's
            corner radius + spacing without needing real content. */}
        <div
          style={{
            padding: `0 ${Math.round(18 * scale)}px ${Math.round(20 * scale)}px ${Math.round(18 * scale)}px`,
            display: "flex",
            gap: `${Math.round(10 * scale)}px`,
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} style={serviceCardStyle}>
              <span
                style={{
                  display: "inline-block",
                  width: `${Math.round(22 * scale)}px`,
                  height: `${Math.round(22 * scale)}px`,
                  background: PREVIEW_ACCENT,
                  opacity: 0.15,
                  borderRadius: s.btnRadius,
                  marginBottom: `${Math.round(8 * scale)}px`,
                }}
              />
              <p
                style={{
                  fontFamily: s.headingFont,
                  fontWeight: s.headingWeight,
                  fontSize: `${Math.round(12 * scale)}px`,
                  color: "#0f172a",
                  margin: 0,
                  letterSpacing: s.headingLetterSpacing,
                }}
              >
                Service {i}
              </p>
              <p
                style={{
                  fontSize: `${captionPx}px`,
                  color: "#64748b",
                  marginTop: `${Math.round(3 * scale)}px`,
                  margin: `${Math.round(3 * scale)}px 0 0 0`,
                  lineHeight: 1.4,
                }}
              >
                One-line teaser
              </p>
            </div>
          ))}
        </div>

        {/* Footer band — NAP strip, all one row. */}
        <div
          style={{
            background: "#0f172a",
            color: "#fef3c7",
            padding: `${Math.round(10 * scale)}px ${Math.round(18 * scale)}px`,
            fontSize: `${captionPx}px`,
            display: "flex",
            justifyContent: "space-between",
            gap: `${Math.round(8 * scale)}px`,
            fontFamily: s.bodyFont,
            letterSpacing: s.bodyLetterSpacing,
          }}
        >
          <span>{businessName}</span>
          <span style={{ opacity: 0.7 }}>hello@…  ·  0xxxx xxx xxx</span>
        </div>
      </div>
    </div>
  );
}

/** Small label + tagline block paired with a preview. Used by both
 *  the homepage gallery and the qualification-form vibe picker so
 *  the tone stays consistent. */
export function VibePreviewCaption({
  vibe,
  highlighted = false,
}: {
  vibe: Vibe;
  highlighted?: boolean;
}) {
  const s = VIBE_STYLES[vibe];
  return (
    <div className="mt-3">
      <p
        className={[
          "font-serif text-lg font-semibold",
          highlighted ? "text-brand-primary-700" : "text-navy-900",
        ].join(" ")}
      >
        {s.label}
      </p>
      <p className="mt-1 text-sm text-navy-600">{s.summary}</p>
    </div>
  );
}

/**
 * Compose preview + caption + an overlay that fades in on hover /
 * focus showing the vibe's design features + which business types
 * it suits. The overlay is absolutely positioned INSIDE the card
 * (no popover that escapes the parent) so the layout never
 * jumps and the hover info stays bounded.
 *
 * Mobile / touch behaviour: hover never fires, so users see the
 * caption only. The features + best-for content lives in
 * <noscript>-friendly DOM (always rendered, just transparent off-
 * hover) so screen readers + keyboard users still hit it via
 * focus-within or tab.
 *
 * Optional `recommendedFor` slot stamps a small green badge on the
 * card — used by the intake-form picker once we know the customer's
 * businessType. Pass undefined on the marketing homepage where no
 * recommendation context is available.
 */
export function VibePreviewCard({
  vibe,
  size = "thumb",
  businessName,
  recommendedFor,
  features,
  bestFor,
}: {
  vibe: Vibe;
  size?: "thumb" | "full";
  businessName?: string;
  /** When set, stamps a "Recommended for {label}" badge. The label
   *  is the customer's businessType ("Plumber") for the intake-form
   *  use case. */
  recommendedFor?: string;
  /** Feature bullets shown in the hover overlay. Sourced from
   *  vibe-recommendations.ts — passed in (not imported here) so this
   *  component stays purely presentational. */
  features: readonly string[];
  /** Best-for bullets shown in the hover overlay. Same plumbing
   *  story as features. */
  bestFor: readonly string[];
}) {
  const s = VIBE_STYLES[vibe];
  return (
    <div className="group relative flex h-full flex-col">
      <div className="relative">
        <VibePreview
          vibe={vibe}
          size={size}
          businessName={businessName}
        />
        {/* Hover-reveal overlay — absolutely positioned to overlay
         *  the preview ONLY (not the caption below). Pointer-events
         *  none so the cursor still hovers the underlying card; opens
         *  on hover or keyboard focus-within for accessibility. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-t from-navy-950/95 via-navy-950/85 to-navy-950/0 p-5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-cream-200">
            Features
          </p>
          <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-cream-50">
            {features.map((f, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true" className="text-brand-primary-300">
                  ·
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-cream-200">
            Best for
          </p>
          <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-cream-50">
            {bestFor.map((b, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true" className="text-brand-primary-300">
                  ·
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Recommendation badge — only renders when the parent has
         *  computed a match from businessType. Stamps over the
         *  top-right corner of the preview. */}
        {recommendedFor && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-lift">
            <span aria-hidden="true">★</span>
            Recommended for {recommendedFor}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="font-serif text-lg font-semibold text-navy-900">
          {s.label}
        </p>
        <p className="mt-1 text-sm text-navy-600">{s.summary}</p>
      </div>
    </div>
  );
}
