// Home-page body — what comes BELOW the hero. One of four variants,
// picked by SITE_DATA.structure to match the hero archetype.
//
// Tier 3 (2026-05-14) replaces the previous "same body sections for
// all structures" rendering with four genuinely different body
// experiences:
//
//   ServicesBody   — services-led: gallery strip → 3-up service
//                    cards → background divider → testimonials grid
//                    → final "ready to start?" CTA banner.
//                    Optimised for "what do you do, how much, can I
//                    book a quote?" customer journey.
//
//   ShowcaseBody   — gallery-led: services demoted to a tiny
//                    4-column TEXT-ONLY list (no cards, no prices),
//                    then a big secondary gallery panel, then
//                    testimonial avatars with quotes, then a
//                    "see more work" CTA. Photos own the page.
//
//   BookingBody    — booking-CTA-led: bookable services as a
//                    vertical list with per-row Book buttons
//                    (same as the prior booking variant), then a
//                    compact "why book with us" trust block,
//                    then a slim testimonials row, then a FINAL
//                    big "pick your time" book CTA. Customer is
//                    nudged to book at every section break.
//
//   EditorialBody  — long-form-led: full about blurb in 2-3
//                    paragraphs with the .dropcap class on the
//                    first paragraph (matching the hero's drop-cap
//                    intro), credentials WALL (badges + stats),
//                    services as numbered points (no cards, no
//                    prices, just headlines + 1-line each), then
//                    a single big pull-quote, then "get in touch"
//                    inline CTA. Reads top-to-bottom like an
//                    article.
//
// Each variant inherits the customer's vibe via the .heading-*,
// .eyebrow, .vibe-divider, .btn-* utility classes (Tier 1) and
// renders inside whatever per-vibe background body has via the
// --vibe-bg variable. So a "showcase + premium" build's body
// looks like a curated portfolio in editorial typography on warm
// ivory; a "booking + friendly" build's body looks like a
// peachy-cream appointment app with bouncy bullet eyebrows.

import Link from "next/link";
import Image from "next/image";
import type { SiteData } from "@/lib/types";
import GbpReviewsWidget from "./GbpReviewsWidget";

type Props = {
  data: SiteData;
};

export default function HomeBody({ data }: Props) {
  const variant = (() => {
    switch (data.structure) {
      case "showcase":
        return <ShowcaseBody data={data} />;
      case "booking":
        return <BookingBody data={data} />;
      case "editorial":
        return <EditorialBody data={data} />;
      case "services":
      default:
        return <ServicesBody data={data} />;
    }
  })();
  const gbp = data.modules.gbp;
  return (
    <>
      {variant}
      {/* GBP reviews block — runtime fetch from the marketing
       *  site. Self-gates: renders nothing if the cron has not
       *  populated a snapshot yet OR the customer has zero Google
       *  reviews. Sits below the body variant in every structure
       *  so it always reads as additional social proof on top of
       *  the curated testimonials. */}
      {gbp && (
        <GbpReviewsWidget
          customerToken={gbp.customerToken}
          apiOrigin={gbp.apiOrigin}
          listingUrl={gbp.listingUrl}
          businessName={data.business.name}
        />
      )}
    </>
  );
}

// ============================================================
// ServicesBody — services-led: gallery strip → 3-up cards →
//                divider → testimonials → final CTA
// ============================================================

function ServicesBody({ data }: Props) {
  const { business, services, copy, brandAssets } = data;
  const galleryPhotos = brandAssets.galleryPhotoUrls;
  const showGalleryStrip = galleryPhotos.length >= 2;
  const dividerBackground = brandAssets.backgroundUrls[0];
  const homeTestimonials = (copy.testimonials ?? []).slice(0, 2);

  return (
    <>
      {/* ---------- Gallery strip (when ≥2 photos) ---------- */}
      {showGalleryStrip && (
        <section aria-label="Gallery" className="bg-cream-50 py-12 md:py-16">
          <div className="container-content">
            <p className="eyebrow">Recent work</p>
            <h2 className="heading-3 mt-2">A look at what we do</h2>
          </div>
          <ul
            className="hero-photo-wrap mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-[max(1rem,calc((100vw-72rem)/2+1rem))] pb-3 md:gap-6"
            style={{ scrollbarWidth: "thin" }}
          >
            {galleryPhotos.map((url, i) => (
              <li
                key={url}
                className="relative aspect-[4/3] w-[80%] flex-none snap-start overflow-hidden rounded-2xl shadow-card md:w-[40%] lg:w-[28%]"
              >
                <Image
                  src={url}
                  alt={`${business.name} work, photo ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 80vw, (max-width: 1024px) 40vw, 28vw"
                  className="object-cover transition-transform duration-700 hover:scale-[1.04]"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Services 3-up grid ---------- */}
      <section className="bg-cream-100 py-20 md:py-28">
        <div className="container-content">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">What we do</p>
            <h2 className="heading-2">A few of our services</h2>
            <p className="prose-body mt-4 text-navy-700">
              Pick the project that fits, or get in touch about something else.
            </p>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 3).map((svc) => (
              <li
                key={svc.name}
                className="group rounded-2xl border border-navy-100 bg-white p-7 shadow-card transition-all hover:-translate-y-1 hover:border-brand-primary-300 hover:shadow-lift"
              >
                <h3 className="heading-3">{svc.name}</h3>
                <p className="mt-3 text-navy-700">{svc.description}</p>
                {svc.priceFrom !== undefined && (
                  <p className="mt-4 text-sm font-semibold text-brand-primary-700">
                    From £{svc.priceFrom.toLocaleString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {services.length > 3 && (
            <div className="mt-12 text-center">
              <Link href="/services" className="btn-secondary">
                See all services
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Background image divider ---------- */}
      {dividerBackground && (
        <section
          aria-hidden="true"
          className="hero-photo-wrap relative h-[24vh] w-full overflow-hidden md:h-[32vh]"
        >
          <Image
            src={dividerBackground}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-cream-100/50 via-transparent to-transparent" />
        </section>
      )}

      {/* ---------- Testimonials grid ---------- */}
      {homeTestimonials.length > 0 && (
        <section className="py-20 md:py-28">
          <div className="container-content">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Trusted by</p>
              <h2 className="heading-2">What customers say</h2>
            </div>
            <ul className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-2">
              {homeTestimonials.map((t, i) => (
                <li
                  key={i}
                  className="rounded-3xl border border-navy-100 bg-cream-50 p-7 shadow-card"
                >
                  {typeof t.rating === "number" && (
                    <Stars rating={t.rating} />
                  )}
                  <blockquote className="mt-3 text-lg leading-relaxed text-navy-800">
                    {t.quote}
                  </blockquote>
                  <footer className="mt-4 text-sm font-semibold text-navy-900">
                    {t.name}
                    {t.location && (
                      <span className="ml-1 font-normal text-navy-500">
                        — {t.location}
                      </span>
                    )}
                  </footer>
                </li>
              ))}
            </ul>
            {(copy.testimonials?.length ?? 0) > 2 && (
              <div className="mt-10 text-center">
                <Link href="/about" className="btn-secondary">
                  Read more reviews
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- Final CTA banner ---------- */}
      <section className="bg-navy-900 py-16 text-white md:py-20">
        <div className="container-content text-center">
          <h2 className="font-serif text-3xl font-semibold md:text-4xl">
            Ready to start?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-cream-100/90">
            Free quotes, fixed prices, and a tidy handover — that&apos;s how
            we&apos;ve always worked.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="rounded-full bg-brand-primary-500 px-6 py-3 font-semibold text-brand-primary-text shadow-lift transition-all duration-200 hover:-translate-y-px hover:bg-brand-primary-600"
            >
              Get a quote
            </Link>
            <Link
              href="/services"
              className="rounded-full border-2 border-white/70 bg-transparent px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-white/10"
            >
              See what we do
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ============================================================
// ShowcaseBody — gallery-led: tiny services list, big gallery,
//                avatar testimonials, "see more work" CTA
// ============================================================

function ShowcaseBody({ data }: Props) {
  const { business, services, copy, brandAssets } = data;
  // Big gallery panel — uses ALL gallery photos (not just first 4
  // like the showcase hero). Falls back to nothing if absent.
  const galleryPhotos = brandAssets.galleryPhotoUrls;
  const homeTestimonials = (copy.testimonials ?? []).slice(0, 3);

  return (
    <>
      {/* ---------- Tiny services list — TEXT ONLY, 4-col,
       *  no cards/prices/icons. Services are intentionally
       *  demoted because the gallery sells the work. */}
      {services.length > 0 && (
        <section className="border-b border-navy-100 bg-cream-50 py-12 md:py-16">
          <div className="container-content">
            <div className="grid gap-8 md:grid-cols-[1fr_2fr] md:gap-12">
              <div>
                <p className="eyebrow">What we do</p>
                <h2 className="heading-3 mt-2">A short list</h2>
                <Link
                  href="/services"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary-700 hover:underline"
                >
                  Full menu →
                </Link>
              </div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-base sm:gap-y-4 md:grid-cols-2 lg:grid-cols-2">
                {services.slice(0, 8).map((svc) => (
                  <li key={svc.name} className="border-l-2 border-navy-200 pl-3">
                    <p className="font-semibold text-navy-900">{svc.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-navy-600">
                      {svc.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Big secondary gallery panel — 3-col grid of
       *  ALL gallery photos at full size. The hero already cycled
       *  through 4; this gives the customer the unhurried view. */}
      {galleryPhotos.length > 0 && (
        <section className="bg-cream-100 py-16 md:py-24">
          <div className="container-content">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">The work</p>
              <h2 className="heading-2">Recent projects</h2>
            </div>
            <ul className="hero-photo-wrap mt-12 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
              {galleryPhotos.map((url, i) => (
                <li
                  key={url + i}
                  className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-card"
                >
                  <Image
                    src={url}
                    alt={`${business.name} project ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="object-cover transition-transform duration-700 hover:scale-[1.03]"
                  />
                </li>
              ))}
            </ul>
            <div className="mt-12 text-center">
              <Link href="/contact" className="btn-secondary">
                Start a project
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Avatar testimonials — initial-only avatars next
       *  to compact quotes. More compressed than ServicesBody's
       *  testimonials grid (gallery should remain the dominant
       *  visual). */}
      {homeTestimonials.length > 0 && (
        <section className="py-16 md:py-20">
          <div className="container-content">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Trusted by</p>
              <h2 className="heading-3">What customers say</h2>
            </div>
            <ul className="mx-auto mt-8 grid max-w-6xl gap-5 md:grid-cols-3">
              {homeTestimonials.map((t, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-3 rounded-2xl bg-cream-50 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-primary-500 text-sm font-semibold text-brand-primary-text">
                      {t.name
                        .split(/\s+/)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900">
                        {t.name}
                      </p>
                      {t.location && (
                        <p className="truncate text-xs text-navy-500">
                          {t.location}
                        </p>
                      )}
                    </div>
                    {typeof t.rating === "number" && (
                      <div className="ml-auto flex-none">
                        <Stars rating={t.rating} compact />
                      </div>
                    )}
                  </div>
                  <blockquote className="text-sm leading-relaxed text-navy-700">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}

// ============================================================
// BookingBody — booking-CTA-led: bookable services list, trust,
//               testimonials, FINAL big book CTA
// ============================================================

function BookingBody({ data }: Props) {
  const { services, copy } = data;
  const homeTestimonials = (copy.testimonials ?? []).slice(0, 2);

  return (
    <>
      {/* ---------- Bookable services list — vertical, each row
       *  with a Book button. Same as the prior booking variant. */}
      <section className="bg-cream-100 py-16 md:py-24">
        <div className="container-content">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Bookable services</p>
            <h2 className="heading-2">Pick what you&apos;d like to book</h2>
            <p className="prose-body mt-4 text-navy-700">
              Tap any service to see availability and confirm a time.
            </p>
          </div>
          <ul className="mx-auto mt-10 max-w-3xl divide-y divide-navy-100 rounded-2xl border border-navy-100 bg-white shadow-card">
            {services.slice(0, 6).map((svc) => (
              <li
                key={svc.name}
                className="flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-cream-50 md:flex-row md:items-center md:justify-between md:gap-6"
              >
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-semibold text-navy-900">
                    {svc.name}
                  </h3>
                  <p className="mt-1 text-sm text-navy-700">
                    {svc.description}
                  </p>
                  {(svc.priceFrom !== undefined ||
                    svc.durationMinutes !== undefined) && (
                    <p className="mt-2 text-xs font-medium text-navy-500">
                      {svc.priceFrom !== undefined && (
                        <span>From £{svc.priceFrom.toLocaleString()}</span>
                      )}
                      {svc.priceFrom !== undefined &&
                        svc.durationMinutes !== undefined &&
                        " · "}
                      {svc.durationMinutes !== undefined && (
                        <span>{svc.durationMinutes} min</span>
                      )}
                    </p>
                  )}
                </div>
                <Link
                  href="/book"
                  className="flex-none rounded-full bg-brand-primary-500 px-5 py-2 text-sm font-semibold text-brand-primary-text shadow-lift hover:bg-brand-primary-600"
                >
                  Book
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- "Why book with us" — three columns, compact. */}
      <section className="py-12 md:py-16">
        <div className="container-content">
          <div className="grid gap-6 text-center md:grid-cols-3 md:gap-10">
            <div>
              <p className="font-serif text-2xl font-semibold text-brand-primary-700">
                Instant
              </p>
              <p className="mt-1 text-sm text-navy-700">
                Most appointments confirm immediately
              </p>
            </div>
            <div>
              <p className="font-serif text-2xl font-semibold text-brand-primary-700">
                Free reschedule
              </p>
              <p className="mt-1 text-sm text-navy-700">
                Reschedule any time — hassle-free
              </p>
            </div>
            <div>
              <p className="font-serif text-2xl font-semibold text-brand-primary-700">
                Calendar sync
              </p>
              <p className="mt-1 text-sm text-navy-700">
                Confirmation lands in your calendar app
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Slim testimonials row ---------- */}
      {homeTestimonials.length > 0 && (
        <section className="bg-cream-50 py-12 md:py-16">
          <div className="container-content">
            <ul className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
              {homeTestimonials.map((t, i) => (
                <li
                  key={i}
                  className="rounded-2xl bg-white p-5 shadow-card"
                >
                  {typeof t.rating === "number" && (
                    <Stars rating={t.rating} compact />
                  )}
                  <blockquote className="mt-2 text-sm leading-relaxed text-navy-800">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <footer className="mt-3 text-xs font-semibold text-navy-900">
                    {t.name}
                    {t.location && (
                      <span className="ml-1 font-normal text-navy-500">
                        — {t.location}
                      </span>
                    )}
                  </footer>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- FINAL big book CTA — repeats the action so the
       *  customer never has to scroll back up. */}
      <section className="bg-brand-primary-500 py-16 text-brand-primary-text md:py-20">
        <div className="container-content text-center">
          <h2 className="font-serif text-3xl font-semibold md:text-4xl">
            Pick your time
          </h2>
          <p className="mx-auto mt-4 max-w-xl opacity-90">
            Confirms in under two minutes.
          </p>
          <div className="mt-7">
            <Link
              href="/book"
              className="inline-flex rounded-full bg-white px-7 py-3.5 font-semibold text-navy-900 shadow-lift transition-all duration-200 hover:-translate-y-px"
            >
              Book a time
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ============================================================
// EditorialBody — long-form-led: about article, credentials wall,
//                 numbered services, pull-quote, "get in touch"
// ============================================================

function EditorialBody({ data }: Props) {
  const { business, services, copy } = data;
  const aboutFull = copy.aboutBlurb ?? "";
  const trust = copy.trust ?? {};
  // Pick the single best testimonial for the closing pull-quote.
  const testimonials = copy.testimonials ?? [];
  const featuredQuote = [...testimonials].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  )[0];
  // Long-form about — split on double-newline into paragraphs (the
  // intake captures with \n\n separators). Falls back to a single
  // paragraph if no breaks present.
  const paragraphs = aboutFull
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      {/* ---------- Long-form about — magazine article style.
       *  First paragraph gets the .dropcap; subsequent paragraphs
       *  flow normally below. */}
      {paragraphs.length > 0 && (
        <section className="py-16 md:py-24">
          <div className="container-content">
            <div className="mx-auto max-w-3xl">
              <p className="eyebrow">About</p>
              <h2 className="heading-2 mt-2">
                Why {business.name.split(/\s+/)[0]}?
              </h2>
              <hr className="vibe-divider" />
              <div className="prose-body space-y-6 text-navy-800">
                {paragraphs.map((para, i) => (
                  <p key={i} className={i === 0 ? "dropcap" : undefined}>
                    {para}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Credentials wall — trust signals as a centred
       *  badge row. Only renders if at least one signal exists. */}
      {(trust.yearsExperience !== undefined ||
        trust.associations ||
        trust.awards) && (
        <section className="border-y border-navy-100 bg-cream-100/60 py-12 md:py-16">
          <div className="container-content">
            <div className="mx-auto grid max-w-4xl gap-8 text-center md:grid-cols-3 md:gap-12">
              {typeof trust.yearsExperience === "number" && (
                <div>
                  <p className="font-serif text-5xl font-semibold text-navy-900">
                    {trust.yearsExperience}+
                  </p>
                  <p className="mt-2 text-sm uppercase tracking-wider text-navy-600">
                    Years experience
                  </p>
                </div>
              )}
              {trust.associations && (
                <div>
                  <p className="font-serif text-xl font-semibold text-navy-900">
                    {trust.associations}
                  </p>
                  <p className="mt-2 text-sm uppercase tracking-wider text-navy-600">
                    Accreditations
                  </p>
                </div>
              )}
              {trust.awards && (
                <div>
                  <p className="font-serif text-xl font-semibold text-navy-900">
                    {trust.awards}
                  </p>
                  <p className="mt-2 text-sm uppercase tracking-wider text-navy-600">
                    Recognition
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Services as numbered points — no cards, no prices,
       *  just headlines + 1-line descriptions. Editorial restraint. */}
      {services.length > 0 && (
        <section className="py-16 md:py-24">
          <div className="container-content">
            <div className="mx-auto max-w-3xl">
              <p className="eyebrow">What we do</p>
              <h2 className="heading-2 mt-2">A short list of our work</h2>
              <hr className="vibe-divider" />
              <ol className="mt-6 space-y-7 md:space-y-9">
                {services.slice(0, 6).map((svc, i) => (
                  <li key={svc.name} className="flex gap-5 md:gap-7">
                    <span
                      className="flex-none font-serif text-3xl font-semibold leading-none text-brand-primary-700 md:text-4xl"
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 border-l border-navy-200 pl-5 md:pl-7">
                      <h3 className="font-serif text-xl font-semibold text-navy-900 md:text-2xl">
                        {svc.name}
                      </h3>
                      <p className="mt-2 text-base leading-relaxed text-navy-700">
                        {svc.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {services.length > 6 && (
                <div className="mt-10">
                  <Link
                    href="/services"
                    className="inline-flex items-center gap-1 font-semibold text-brand-primary-700 hover:underline"
                  >
                    Read the rest →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Single big pull-quote (not a grid). Editorial
       *  doesn't do testimonial walls — it picks one voice and gives
       *  it space to land. */}
      {featuredQuote && (
        <section className="bg-cream-100 py-16 md:py-24">
          <div className="container-content">
            <figure className="mx-auto max-w-3xl text-center">
              <blockquote className="font-serif text-2xl leading-snug text-navy-900 md:text-3xl">
                <span aria-hidden="true" className="text-brand-primary-500">
                  &ldquo;
                </span>
                {featuredQuote.quote}
                <span aria-hidden="true" className="text-brand-primary-500">
                  &rdquo;
                </span>
              </blockquote>
              <figcaption className="mt-6 text-sm uppercase tracking-wider text-navy-600">
                {featuredQuote.name}
                {featuredQuote.location && (
                  <span className="ml-2 normal-case text-navy-500">
                    · {featuredQuote.location}
                  </span>
                )}
              </figcaption>
            </figure>
          </div>
        </section>
      )}

      {/* ---------- Closing inline CTA — restrained, square-cornered
       *  to match the editorial hero's button style. */}
      <section className="py-16 md:py-20">
        <div className="container-content">
          <div className="mx-auto max-w-3xl border-t border-navy-200 pt-12">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <p className="eyebrow">Get in touch</p>
                <h2 className="heading-3 mt-2">
                  Tell us about your project.
                </h2>
              </div>
              <Link
                href="/contact"
                className="rounded-sm bg-navy-900 px-6 py-3 font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-navy-800"
              >
                Get in touch
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ---------- Shared: Stars row ----------
//
// Used by ServicesBody (full row) + ShowcaseBody/BookingBody
// (compact). Renders the rating as visual stars + an aria-label
// so screen readers get "X out of 5 stars".

function Stars({
  rating,
  compact,
}: {
  rating: number;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center gap-0.5 text-amber-500",
        compact ? "text-xs" : "",
      ].join(" ")}
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          aria-hidden="true"
          className={s > rating ? "text-navy-200" : ""}
        >
          {s <= rating ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}
