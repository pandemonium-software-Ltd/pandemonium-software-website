// Home page — full-width banner hero, gallery scroll, services
// preview, optional background section divider, testimonials.
//
// Asset roles on this page:
//   - heroPhotoUrl   → full-width banner background, text overlaid
//   - galleryPhotoUrls → horizontal-scroll strip below the hero
//   - backgroundUrls[0] → wide section divider between services
//                         and testimonials (parallax-feel banner)
//   - testimonials photos: future (currently text-only)
//
// C5.7 will branch this layout per vibe — modern is the default.

import Link from "next/link";
import Image from "next/image";
import { SITE_DATA } from "@/lib/site-data";

export default function HomePage() {
  const { business, services, copy, brandAssets } = SITE_DATA;
  const tagline =
    copy.tagline ??
    `${business.name} — trusted local ${business.type.toLowerCase()}.`;
  // Top 2 testimonials surface on the home page (rest only on About,
  // to keep home page scannable). Render only when at least one
  // testimonial exists.
  const homeTestimonials = (copy.testimonials ?? []).slice(0, 2);
  // Gallery strip — horizontal-scroll. Renders only when the
  // customer uploaded any gallery photos in Step 4 Brand Assets.
  const galleryPhotos = brandAssets.galleryPhotoUrls;
  // Background image — first uploaded background renders as a
  // full-width section divider between services and testimonials.
  // Subsequent backgrounds (if any) are reserved for the About /
  // Services pages later. Falls back to nothing if absent.
  const dividerBackground = brandAssets.backgroundUrls[0];

  return (
    <>
      {/* ---------- Hero: full-width banner ---------- */}
      {/* The hero photo fills the section as a CSS background,
          with a dark overlay for text legibility. Header height
          targets ~70vh on desktop, capped at 720px so the banner
          doesn't dominate large monitors. Mobile drops to ~60vh
          so users can see the services preview without scrolling. */}
      <section
        className="relative overflow-hidden"
        aria-label="Hero"
      >
        <Image
          src={brandAssets.heroPhotoUrl}
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />
        {/* Gradient overlay for text contrast — strongest at the
            bottom where the text sits, lighter at the top. */}
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

      {/* ---------- Gallery: horizontal-scroll strip ----------
          Renders directly under the hero. Touch-swipe on mobile,
          drag/scroll on desktop. scroll-snap-x mandatory keeps
          each photo aligned to the viewport edge so part-photos
          don't show. Only renders when there are 2+ photos —
          a single-photo strip looks awkward, the gallery vibe
          relies on plurality. */}
      {galleryPhotos.length >= 2 && (
        <section
          aria-label="Gallery"
          className="bg-cream-50 py-12 md:py-16"
        >
          <div className="container-content">
            <p className="eyebrow">Recent work</p>
            <h2 className="heading-3 mt-2">A look at what we do</h2>
          </div>
          {/* Snap container — full-bleed (escapes container-content)
              so photos can scroll past the page edge. Padding-inline
              matches the page gutter so the first/last photo aligns
              with the heading above. */}
          <ul
            className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-[max(1rem,calc((100vw-72rem)/2+1rem))] pb-3 md:gap-6"
            // Hide scrollbar on WebKit + Firefox while keeping the
            // overflow behaviour. A subtle bottom-fade gradient
            // indicates scrollability without a chrome scrollbar.
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

      {/* ---------- Services preview ---------- */}
      <section className="bg-cream-100 py-20 md:py-28">
        <div className="container-content">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">What we do</p>
            <h2 className="heading-2">A few of our services</h2>
            <p className="prose-body mt-4 text-navy-700">
              Pick the project that fits, or get in touch about
              something else.
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

      {/* ---------- Background image divider ----------
          Full-width banner using the customer's first uploaded
          background image. Pure visual rhythm — no text content,
          intentional in its silence. ~32vh on desktop so it's
          present without dominating, ~24vh on mobile. Renders
          only when the customer uploaded a background. */}
      {dividerBackground && (
        <section
          aria-hidden="true"
          className="relative h-[24vh] w-full overflow-hidden md:h-[32vh]"
        >
          <Image
            src={dividerBackground}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          {/* Subtle dark gradient at top + bottom so the image
              transitions cleanly into the surrounding sections. */}
          <div className="absolute inset-0 bg-gradient-to-b from-cream-100/50 via-transparent to-transparent" />
        </section>
      )}

      {/* ---------- Testimonials slice ---------- */}
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
                  {t.rating !== undefined && (
                    <div
                      className="flex items-center gap-0.5 text-amber-500"
                      role="img"
                      aria-label={`${t.rating} out of 5 stars`}
                    >
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span
                          key={s}
                          aria-hidden="true"
                          className={s > t.rating! ? "text-navy-200" : ""}
                        >
                          {s <= t.rating! ? "★" : "☆"}
                        </span>
                      ))}
                    </div>
                  )}
                  <svg
                    aria-hidden="true"
                    className={`h-7 w-7 text-brand-primary-500 ${t.rating !== undefined ? "mt-2" : ""}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M7 8c-2.21 0-4 1.79-4 4v6h6v-6H5c0-1.1.9-2 2-2V8zm10 0c-2.21 0-4 1.79-4 4v6h6v-6h-4c0-1.1.9-2 2-2V8z" />
                  </svg>
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
    </>
  );
}
