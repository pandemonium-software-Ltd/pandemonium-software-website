// Home-page hero — one of four shapes, picked by SITE_DATA.structure.
//
// This is the meaningful per-structure differentiation. The four
// styles (vibe — modern / traditional / premium / friendly) all
// flow through the same CSS variables in globals.css; the four
// structures change the actual layout: hero shape, which image
// slot leads, where the CTAs sit, what content is dominant.
//
//   services   — full-bleed photo banner, text overlaid, two CTAs.
//                Default; matches what every customer-site rendered
//                before the structure axis landed (2026-05-13).
//   showcase   — gallery mosaic hero, photos lead, minimal text
//                overlay. For businesses where the work sells.
//   booking    — text + photo split with the Cal.com embed (or a
//                prominent "book now" placeholder if no booking
//                module). For appointment-driven businesses.
//   editorial  — two-column text + portrait, long-form intro,
//                trust signals lead. For credentialed advisory
//                businesses.
//
// All four variants inherit the customer's vibe via the
// .heading-1 / .btn-* utility classes (which read the CSS vars)
// so a "showcase + premium" build and a "showcase + modern" build
// share the layout but render in different typography.

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
// Services hero — text + photo banner, services-first messaging
// ============================================================

function ServicesHero({ data }: Props) {
  const { business, copy, brandAssets } = data;
  const tagline =
    copy.tagline ??
    `${business.name} — trusted local ${business.type.toLowerCase()}.`;
  return (
    <section className="relative overflow-hidden" aria-label="Hero">
      <Image
        src={brandAssets.heroPhotoUrl}
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover"
      />
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
          <Link
            href="/services"
            className="rounded-full border-2 border-white/70 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20"
          >
            See what we do
          </Link>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Showcase hero — gallery mosaic, photos lead
// ============================================================

function ShowcaseHero({ data }: Props) {
  const { business, copy, brandAssets } = data;
  const tagline =
    copy.tagline ??
    `${business.name} — ${business.type.toLowerCase()} in ${business.location || "the UK"}.`;
  // Mosaic source: hero photo always; then up to 4 gallery photos.
  // The grid uses 6 slots; we fill as many as we have, fall back to
  // hero-only when the customer hasn't uploaded a gallery yet.
  const mosaicPhotos = [
    brandAssets.heroPhotoUrl,
    ...brandAssets.galleryPhotoUrls.slice(0, 5),
  ];
  return (
    <section className="relative bg-cream-50" aria-label="Hero">
      <div className="container-content py-12 md:py-16">
        <p className="eyebrow">{business.type}{business.location ? ` · ${business.location}` : ""}</p>
        <h1 className="heading-1 mt-3 max-w-4xl">{tagline}</h1>
        <p className="prose-body mt-5 max-w-2xl text-navy-700">
          A look at recent work below. {business.location ? `Serving ${business.location} ` : ""}
          and surrounding areas — get in touch about a project of your own.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/contact"
            className="rounded-full bg-brand-primary-500 px-6 py-3 font-semibold text-brand-primary-text shadow-lift transition-all duration-200 hover:-translate-y-px hover:bg-brand-primary-600"
          >
            Start a project
          </Link>
          <Link
            href="/services"
            className="rounded-full border-2 border-navy-900 bg-transparent px-6 py-3 font-semibold text-navy-900 transition-all duration-200 hover:bg-navy-900 hover:text-white"
          >
            See what we do
          </Link>
        </div>
        {/* Mosaic grid — first photo dominates, the rest tile around.
         *  Asymmetric to feel curated rather than uniform. On mobile
         *  it collapses to a 2-column vertical strip. */}
        <div className="mt-10 grid grid-cols-2 gap-3 md:mt-14 md:grid-cols-4 md:grid-rows-2 md:gap-4">
          {mosaicPhotos.map((url, i) => (
            <div
              key={url + i}
              className={[
                "relative overflow-hidden rounded-2xl",
                // Photo 0 spans 2x2 on desktop = the dominant tile.
                // Rest fill 1x1 around it.
                i === 0
                  ? "col-span-2 row-span-2 aspect-[4/3] md:col-span-2 md:row-span-2 md:aspect-auto"
                  : "aspect-[4/3]",
              ].join(" ")}
            >
              <Image
                src={url}
                alt={i === 0 ? `${business.name} work` : ""}
                fill
                priority={i === 0}
                sizes={
                  i === 0
                    ? "(max-width: 768px) 100vw, 50vw"
                    : "(max-width: 768px) 50vw, 25vw"
                }
                className="object-cover transition-transform duration-700 hover:scale-[1.03]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Booking hero — text + Cal.com embed prominent
// ============================================================

function BookingHero({ data }: Props) {
  const { business, copy, brandAssets, modules } = data;
  const tagline =
    copy.tagline ??
    `${business.name} — book in with a ${business.type.toLowerCase()}.`;
  const calcomUrl = modules.booking?.calcomUrl;
  return (
    <section className="relative overflow-hidden bg-cream-50" aria-label="Hero">
      <div className="container-content grid items-center gap-10 py-16 md:grid-cols-[1.05fr_1fr] md:py-20">
        <div>
          <p className="eyebrow">{business.type}{business.location ? ` · ${business.location}` : ""}</p>
          <h1 className="heading-1 mt-3 max-w-2xl">{tagline}</h1>
          <p className="prose-body mt-5 max-w-xl text-navy-700">
            Pick a time that works for you. Most appointments confirm
            instantly; if you need to chat first, drop us a line.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/book"
              className="rounded-full bg-brand-primary-500 px-6 py-3 font-semibold text-brand-primary-text shadow-lift transition-all duration-200 hover:-translate-y-px hover:bg-brand-primary-600"
            >
              Book a time
            </Link>
            <Link
              href="/contact"
              className="rounded-full border-2 border-navy-900 bg-transparent px-6 py-3 font-semibold text-navy-900 transition-all duration-200 hover:bg-navy-900 hover:text-white"
            >
              Or send a message
            </Link>
          </div>
        </div>
        {/* Right column — embeds the Cal.com iframe when the
         *  customer has the Booking module + URL set. Falls back to
         *  a styled hero photo with a "book now" overlay when the
         *  module isn't bought (e.g. customer picked booking structure
         *  for the look but uses a different booking system). */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-lift">
          {calcomUrl ? (
            <iframe
              src={calcomUrl}
              title={`Book with ${business.name}`}
              loading="lazy"
              className="h-full w-full border-0"
            />
          ) : (
            <>
              <Image
                src={brandAssets.heroPhotoUrl}
                alt=""
                aria-hidden="true"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-transparent via-navy-950/30 to-navy-950/85"
              />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-cream-100/90">
                  Book a time
                </p>
                <p className="mt-2 font-serif text-2xl font-semibold">
                  Tap below to see availability
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Editorial hero — long-form text + portrait, credentials lead
// ============================================================

function EditorialHero({ data }: Props) {
  const { business, copy, brandAssets } = data;
  // About photo (portrait of founder) beats hero photo for the
  // editorial layout — but we accept either since not every customer
  // uploads a separate about photo.
  const portrait = brandAssets.aboutPhotoUrl ?? brandAssets.heroPhotoUrl;
  const tagline =
    copy.tagline ?? `${business.name}.`;
  const aboutLead =
    copy.aboutBlurb ??
    `${business.name} is a ${business.type.toLowerCase()} based in ${business.location || "the UK"}.`;
  return (
    <section className="bg-cream-50" aria-label="Hero">
      <div className="container-content grid items-start gap-10 py-16 md:grid-cols-[1.3fr_1fr] md:gap-14 md:py-24">
        <div>
          <p className="eyebrow">
            {business.type}{business.location ? ` · ${business.location}` : ""}
          </p>
          <h1 className="heading-1 mt-3">{tagline}</h1>
          {/* Long-form intro — only show the first ~2 sentences of
           *  the about blurb; the rest lives on /about. */}
          <p className="prose-body mt-6 max-w-2xl text-navy-700">
            {firstSentencesOf(aboutLead, 2)}
          </p>
          {copy.trust && (
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 border-t border-navy-100 pt-6 text-sm">
              {typeof copy.trust.yearsExperience === "number" && (
                <div>
                  <p className="font-serif text-3xl font-semibold text-navy-900">
                    {copy.trust.yearsExperience}+
                  </p>
                  <p className="mt-1 text-navy-600">years experience</p>
                </div>
              )}
              {copy.trust.associations && (
                <div>
                  <p className="font-semibold text-navy-900">
                    {copy.trust.associations}
                  </p>
                  <p className="mt-1 text-navy-600">accreditations</p>
                </div>
              )}
              {copy.trust.awards && (
                <div>
                  <p className="font-semibold text-navy-900">
                    {copy.trust.awards}
                  </p>
                  <p className="mt-1 text-navy-600">recognition</p>
                </div>
              )}
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="rounded-full bg-brand-primary-500 px-6 py-3 font-semibold text-brand-primary-text shadow-lift transition-all duration-200 hover:-translate-y-px hover:bg-brand-primary-600"
            >
              Get in touch
            </Link>
            <Link
              href="/about"
              className="rounded-full border-2 border-navy-900 bg-transparent px-6 py-3 font-semibold text-navy-900 transition-all duration-200 hover:bg-navy-900 hover:text-white"
            >
              Read more
            </Link>
          </div>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-lift">
          <Image
            src={portrait}
            alt={`${business.name} portrait`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 40vw"
            className="object-cover"
          />
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
