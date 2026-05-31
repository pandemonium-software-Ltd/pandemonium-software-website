// Home-page hero — one of four shapes, picked by SITE_DATA.structure.
//
// Tier 2 (2026-05-14) rewrote each variant to lean hard into its
// archetype rather than just rearranging the same elements. Each
// hero now has a distinct visual density, dominant content type,
// and CTA-to-content ratio so the four structures read as four
// genuinely different products.
//
//   services   — Tradesman-pro: photo banner with text overlay,
//                followed by a TRUST STRIP (years experience,
//                accreditations, response time, areas served, phone).
//                CTAs prioritise "Get a quote" + click-to-call.
//                Maximum trust signals; minimal scrolling before the
//                customer can act.
//   showcase   — Portfolio: full-bleed AUTO-CYCLING gallery (4s per
//                photo) with subtle bottom-corner overlay carrying
//                business name + tagline + single CTA. Photos own
//                95vh of the screen. For visual-product businesses
//                where the work IS the pitch.
//   booking    — App-feel: 3-column grid with a NEXT-AVAILABLE strip
//                across the top (live appointment slots) and the
//                Cal.com calendar dominating 60% of the viewport.
//                Business info compressed to a left rail. Reads more
//                like an appointment app than a marketing site.
//   editorial  — Magazine: drop-cap intro, byline-style credentials
//                line, oversized display headline, pull-quote
//                sidebar from a real testimonial, portrait floating
//                right. Reads like a long-form profile, not a
//                services page.
//
// All four variants inherit the customer's vibe via the .heading-1
// / .btn-* utility classes (which read the CSS vars from globals.css)
// so a "showcase + premium" build and a "showcase + modern" build
// share the layout but render in different typography, image filter,
// and ornamentation.

import Link from "next/link";
import Image from "next/image";
import type { SiteData } from "@/lib/types";

type Props = {
  data: SiteData;
};

export default function HomeHero({ data }: Props) {
  switch (data.structure) {
    case "showcase":
      return <ShowcaseHero data={data} />;
    case "booking":
      return <BookingHero data={data} />;
    case "editorial":
      return <EditorialHero data={data} />;
    case "services":
    default:
      return <ServicesHero data={data} />;
  }
}

// ============================================================
// Services hero — tradesman-pro: photo + trust strip + click-to-call
// ============================================================
//
// Tier 2 changes: kept the photo banner shape (it works) but added
// a dense five-cell TRUST STRIP directly below. The strip
// surfaces years of experience, accreditations, areas served,
// typical response time, and a click-to-call phone link. This is
// the "first impression" most local trades customers form before
// they read anything else, and it reduces the cognitive distance
// to "I trust them, I'll call" from ~3 sections of scrolling to
// ~3 inches of viewport.

function ServicesHero({ data }: Props) {
  const { business, copy, brandAssets } = data;
  const tagline =
    copy.tagline ??
    `${business.name} — trusted local ${business.type.toLowerCase()}.`;
  const trust = copy.trust ?? {};
  const phoneTel = business.phone?.replace(/[^0-9+]/g, "");
  return (
    <>
      <section className="relative overflow-hidden" aria-label="Hero">
        <div className="hero-photo-wrap absolute inset-0 -z-10">
          <Image
            src={brandAssets.heroPhotoUrl}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-950/30 via-navy-950/55 to-navy-950/85"
        />
        <div className="container-content flex min-h-[60vh] flex-col justify-end py-16 text-white md:min-h-[70vh] md:max-h-[720px] md:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cream-100/90">
            {business.type}
            {business.location ? ` · ${business.location}` : ""}
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-tight md:text-5xl lg:text-6xl">
            {tagline}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-cream-100/95">
            Trusted local {business.type.toLowerCase()} serving{" "}
            {business.location || "the UK"}. Get in touch for a free quote.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="rounded-full bg-brand-primary-500 px-6 py-3 font-semibold text-brand-primary-text transition-all duration-200 hover:-translate-y-px hover:bg-brand-primary-600"
            >
              Get a quote
            </Link>
            {phoneTel && (
              <a
                href={`tel:${phoneTel}`}
                className="inline-flex items-center gap-2 rounded-full border-2 border-white/70 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20"
              >
                <span aria-hidden="true">📞</span> Call {business.phone}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ---------- TRUST STRIP — dense five-cell row that anchors
       *  the hero. Cells fall back gracefully when the customer
       *  hasn't supplied that signal yet (we never render an empty
       *  strip; if there are <2 signals we suppress the whole
       *  row to avoid a half-empty band). */}
      {(() => {
        const cells: { label: string; value: string }[] = [];
        if (typeof trust.yearsExperience === "number") {
          cells.push({
            label: "Years experience",
            value: `${trust.yearsExperience}+`,
          });
        }
        if (trust.associations) {
          cells.push({ label: "Accreditations", value: trust.associations });
        }
        if (business.location) {
          cells.push({ label: "Areas served", value: business.location });
        }
        cells.push({ label: "Response time", value: "Within 24h" });
        if (business.phone) {
          cells.push({ label: "Call us", value: business.phone });
        }
        if (cells.length < 2) return null;
        return (
          <section
            aria-label="At a glance"
            className="border-b border-navy-100 bg-cream-50/60"
          >
            <div className="container-content">
              <div className="grid grid-cols-2 divide-y divide-navy-100 sm:grid-cols-3 sm:divide-y-0 md:grid-cols-5 md:divide-x">
                {cells.slice(0, 5).map((c, i) => (
                  <div
                    key={c.label + i}
                    className="px-4 py-5 text-center md:px-6"
                  >
                    <p className="font-serif text-xl font-semibold text-navy-900 md:text-2xl">
                      {c.value}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wider text-navy-500">
                      {c.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })()}
    </>
  );
}

// ============================================================
// Showcase hero — full-bleed auto-cycling gallery, photos own the screen
// ============================================================
//
// Tier 2 changes: instead of a 6-photo mosaic with text above, the
// showcase hero is now a 90-100vh full-bleed photo viewport that
// auto-cycles every 4.5 seconds (CSS-only animation — no JS state).
// Tiny bottom-left overlay carries business name + tagline. Single
// "See work" CTA bottom-right. The customer's PHOTOS sell the
// business — text gets out of the way.
//
// Falls back gracefully:
//   - 1 photo: no cycle, just the hero photo as a stationary backdrop
//   - 2-3 photos: cycle works at any count via nth-child mod
//   - 4+ photos: cycle covers the first 4 (most-curated wins)

function ShowcaseHero({ data }: Props) {
  const { business, copy, brandAssets } = data;
  const tagline =
    copy.tagline ??
    `${business.name} — ${business.type.toLowerCase()} in ${business.location || "the UK"}.`;
  // Cycle source — hero first, then up to 3 gallery photos, capped
  // at 4 total to keep the cycle predictable.
  const cyclePhotos = [
    brandAssets.heroPhotoUrl,
    ...brandAssets.galleryPhotoUrls.slice(0, 3),
  ].slice(0, 4);
  const isCycling = cyclePhotos.length > 1;
  return (
    <section
      className="relative h-[85vh] w-full overflow-hidden bg-navy-950 md:h-[92vh]"
      aria-label="Hero"
    >
      {/* Stack of full-bleed images — only one visible at a time via
       *  the gallery-cycle keyframes (defined inline below as styles
       *  to avoid a separate stylesheet round-trip). */}
      <div className="hero-photo-wrap absolute inset-0">
        {cyclePhotos.map((url, i) => (
          <div
            key={url + i}
            className="absolute inset-0"
            style={
              isCycling
                ? {
                    animation: `gallery-cycle ${cyclePhotos.length * 4.5}s ${i * 4.5}s infinite`,
                    opacity: 0,
                  }
                : { opacity: 1 }
            }
          >
            <Image
              src={url}
              alt={i === 0 ? `${business.name} work` : ""}
              fill
              priority={i === 0}
              sizes="100vw"
              className="object-cover"
            />
          </div>
        ))}
        {/* Inline keyframes — kept in JS so the component stays
         *  self-contained without polluting globals.css.
         *
         *  Crossfade pattern (fixed 2026-05-15): each photo is
         *  visible for (100/N)% of the cycle, with a 5% overlap
         *  into the next photo's slot. The 5% overlap is the
         *  crossfade window — the outgoing photo fades out while
         *  the incoming photo (offset by animation-delay) fades
         *  in, so there's never a moment where both are invisible.
         *  Earlier version used a tight 1%-visible window which
         *  rendered as a "blink" instead of a hold. */}
        <style>{`
          @keyframes gallery-cycle {
            0% { opacity: 0; }
            5%, ${100 / cyclePhotos.length}% { opacity: 1; }
            ${100 / cyclePhotos.length + 5}%, 100% { opacity: 0; }
          }
        `}</style>
      </div>

      {/* Bottom-corner overlay — small + restrained, lets the photo
       *  breathe. Business name top-left, single CTA bottom-right. */}
      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-navy-950/20 to-transparent" />
      <div className="absolute left-6 top-6 max-w-md text-white md:left-10 md:top-10">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cream-100/90">
          {business.type}
          {business.location ? ` · ${business.location}` : ""}
        </p>
        <p className="mt-2 font-serif text-lg font-semibold md:text-xl">
          {business.name}
        </p>
      </div>
      <div className="absolute bottom-6 left-6 right-6 flex flex-col items-start gap-4 md:bottom-10 md:left-10 md:right-10 md:flex-row md:items-end md:justify-between">
        <h1 className="max-w-2xl font-serif text-3xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
          {tagline}
        </h1>
        <Link
          href="/services"
          className="flex-none rounded-full bg-white px-7 py-3.5 font-semibold text-navy-900 shadow-lift transition-all duration-200 hover:-translate-y-px hover:bg-cream-50"
        >
          See the work →
        </Link>
      </div>
    </section>
  );
}

// ============================================================
// Booking hero — app-feel, calendar dominates, business info as rail
// ============================================================
//
// Tier 2 changes: instead of a 50/50 text-left calendar-right split,
// the booking hero is now a 3-column grid (left rail with compressed
// business info, centre+right colspan with the Cal.com embed taking
// 60-65% of the viewport). A "NEXT AVAILABLE" strip across the top
// shows live-feel appointment hints (placeholder text — Cal.com's
// own embed handles real availability). Sticky-bottom mobile "Book"
// CTA. Reads more like an appointment app than a marketing page.

function BookingHero({ data }: Props) {
  const { business, copy, brandAssets, modules } = data;
  const tagline =
    copy.tagline ??
    `${business.name} — book in with a ${business.type.toLowerCase()}.`;
  const calcomUrl = modules.booking?.calcomUrl;
  return (
    <>
      {/* "Next available" strip — gives the page an app-pulse feel
       *  even before the calendar loads. Generic copy because real
       *  availability lives inside the Cal.com embed below. */}
      <div className="border-b border-navy-100 bg-brand-primary-500 text-brand-primary-text">
        <div className="container-content flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
          <p className="font-semibold">
            <span aria-hidden="true">●</span> Taking bookings now
          </p>
          <p className="text-xs opacity-90">
            Most appointments confirm instantly
          </p>
        </div>
      </div>

      <section
        className="relative bg-cream-50"
        aria-label="Hero"
      >
        <div className="container-content grid items-stretch gap-6 py-10 md:grid-cols-[280px_1fr] md:gap-8 md:py-14 lg:grid-cols-[320px_1fr]">
          {/* Left rail — compressed business info. */}
          <aside className="flex flex-col gap-4">
            <p className="eyebrow">
              {business.type}
              {business.location ? ` · ${business.location}` : ""}
            </p>
            <h1 className="font-serif text-2xl font-semibold leading-tight text-navy-900 md:text-3xl">
              {tagline}
            </h1>
            <p className="text-sm leading-relaxed text-navy-700">
              Pick a time on the calendar — confirms instantly. Need to
              chat first? Send a message instead.
            </p>
            {/* Compact metadata stack — service area, phone, hours hint */}
            <div className="mt-2 space-y-2 border-t border-navy-100 pt-4 text-sm">
              {business.location && (
                <p className="text-navy-700">
                  <span className="font-semibold text-navy-900">Where:</span>{" "}
                  {business.location}
                </p>
              )}
              {business.phone && (
                <p className="text-navy-700">
                  <span className="font-semibold text-navy-900">Or call:</span>{" "}
                  <a
                    href={`tel:${business.phone.replace(/[^0-9+]/g, "")}`}
                    className="text-brand-primary-700 hover:underline"
                  >
                    {business.phone}
                  </a>
                </p>
              )}
              {business.hours && (
                <p className="text-navy-700">
                  <span className="font-semibold text-navy-900">Hours:</span>{" "}
                  {business.hours.split(",")[0]}
                </p>
              )}
            </div>
            <Link
              href="/contact"
              className="mt-2 inline-flex items-center gap-2 self-start text-sm font-semibold text-brand-primary-700 hover:underline"
            >
              Or send a message →
            </Link>
          </aside>

          {/* Calendar dominates the right column — full vertical rhythm,
           *  app-style border + shadow. */}
          <div className="relative min-h-[480px] overflow-hidden rounded-3xl border border-navy-100 bg-white shadow-lift md:min-h-[540px]">
            {calcomUrl ? (
              <iframe
                src={calcomUrl}
                title={`Book with ${business.name}`}
                loading="lazy"
                className="h-full w-full border-0"
              />
            ) : (
              <>
                <div className="hero-photo-wrap absolute inset-0">
                  <Image
                    src={brandAssets.heroPhotoUrl}
                    alt=""
                    aria-hidden="true"
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, 60vw"
                    className="object-cover"
                  />
                </div>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-b from-transparent via-navy-950/35 to-navy-950/85"
                />
                <div className="absolute inset-x-0 bottom-0 p-8 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wider text-cream-100/90">
                    Book a time
                  </p>
                  <p className="mt-2 font-serif text-2xl font-semibold md:text-3xl">
                    Live availability coming soon
                  </p>
                  <p className="mt-3 text-sm text-cream-100/90">
                    For now, get in touch via phone or message and
                    we&apos;ll confirm a time.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Sticky-bottom mobile CTA — only renders on small screens.
       *  Always-visible "Book now" so the customer never has to scroll
       *  to find the action. */}
      <div className="sticky bottom-0 z-30 border-t border-navy-100 bg-white shadow-[0_-4px_12px_rgba(15,23,42,0.06)] md:hidden">
        <div className="container-content flex items-center justify-between gap-3 py-3">
          <p className="text-sm font-semibold text-navy-900">Book in 2 min</p>
          <Link
            href="/book"
            className="rounded-full bg-brand-primary-500 px-5 py-2.5 text-sm font-semibold text-brand-primary-text shadow-lift"
          >
            Book a time
          </Link>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Editorial hero — magazine layout with drop cap + pull quote
// ============================================================
//
// Tier 2 changes: replaced the two-column text + portrait with a
// proper magazine layout. Display headline floats large at the top,
// a byline-style credentials row sits beneath it, the lead paragraph
// gets a drop cap, a pull-quote sidebar carries a real testimonial
// (when one is available), and the portrait floats right. Reads
// like a long-form profile rather than a services page.

function EditorialHero({ data }: Props) {
  const { business, copy, brandAssets } = data;
  // Portrait — about photo preferred (founder image), hero as fallback.
  const portrait = brandAssets.aboutPhotoUrl ?? brandAssets.heroPhotoUrl;
  const tagline = copy.tagline ?? `${business.name}.`;
  const aboutLead =
    copy.aboutBlurb ??
    `${business.name} is a ${business.type.toLowerCase()} based in ${business.location || "the UK"}.`;
  // Pull-quote — pick the highest-rated testimonial that exists.
  // Falls back to undefined; the layout collapses gracefully.
  const testimonials = copy.testimonials ?? [];
  const pullQuote = [...testimonials].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  )[0];
  // Byline — credentials presented like a magazine subtitle line:
  // "Established 2018 · FMB member · Oxford".
  const bylineParts: string[] = [];
  if (typeof copy.trust?.yearsExperience === "number") {
    const founded = new Date().getFullYear() - copy.trust.yearsExperience;
    bylineParts.push(`Established ${founded}`);
  }
  if (copy.trust?.associations) bylineParts.push(copy.trust.associations);
  if (business.location) bylineParts.push(business.location);

  return (
    <section className="relative bg-cream-50" aria-label="Hero">
      <div className="container-content py-14 md:py-20">
        {/* Magazine-style head: tiny eyebrow → giant display headline →
         *  byline. Aligned left-edge of the article column. */}
        <div className="max-w-3xl">
          <p className="eyebrow">
            {business.type}
            {business.location ? ` · ${business.location}` : ""}
          </p>
          <h1 className="heading-1 mt-3 text-balance">{tagline}</h1>
          {bylineParts.length > 0 && (
            <p className="mt-5 border-l-2 border-navy-300 pl-4 font-serif text-base italic text-navy-600 md:text-lg">
              {bylineParts.join(" · ")}
            </p>
          )}
        </div>

        {/* Article body — drop-cap intro, pull-quote sidebar, portrait
         *  right-floated. On mobile the portrait + pull-quote stack
         *  below the body for legibility. */}
        <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-[1.6fr_1fr] md:gap-14">
          <div>
            <p className="dropcap prose-body text-navy-800">
              {firstSentencesOf(aboutLead, 3)}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/about"
                className="rounded-sm bg-navy-900 px-6 py-3 font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-navy-800"
              >
                Read the full story
              </Link>
              <Link
                href="/contact"
                className="rounded-sm border-2 border-navy-900 bg-transparent px-6 py-3 font-semibold text-navy-900 transition-all duration-200 hover:bg-navy-900 hover:text-white"
              >
                Get in touch
              </Link>
            </div>
          </div>
          {/* Right column: portrait at top, pull-quote below. */}
          <aside className="space-y-6">
            <figure className="hero-photo-wrap relative aspect-[4/5] overflow-hidden rounded-sm shadow-lift">
              <Image
                src={portrait}
                alt={`${business.name} portrait`}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 35vw"
                className="object-cover"
              />
            </figure>
            {pullQuote && (
              <blockquote className="border-l-4 border-brand-primary-500 bg-white/60 p-5">
                <p className="font-serif text-xl italic leading-snug text-navy-900 md:text-2xl">
                  &ldquo;{pullQuote.quote}&rdquo;
                </p>
                <footer className="mt-3 text-sm font-semibold text-navy-700">
                  — {pullQuote.name}
                  {pullQuote.location && (
                    <span className="font-normal text-navy-500">
                      , {pullQuote.location}
                    </span>
                  )}
                </footer>
              </blockquote>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

/** Trim a long blurb to the first N sentences for the editorial
 *  hero intro. Splits on period/exclamation/question + whitespace.
 *  Falls back to the raw string if the splitter doesn't find any
 *  sentence boundaries (very short blurbs). */
function firstSentencesOf(text: string, n: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g);
  if (!sentences || sentences.length === 0) return text;
  return sentences.slice(0, n).join("").trim();
}
