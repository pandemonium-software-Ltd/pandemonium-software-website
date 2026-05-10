// Home page — hero with the customer's tagline + a CTA, then a
// short "what we do" preview that links to the full Services page.
//
// C5.5 (Haiku copy assist) will replace the static fallback tagline
// with AI-polished marketing copy from the customer's intake bullets.
// C5.7 will branch this layout per vibe — modern as default; the
// other three vibes get their own page.tsx variants OR style
// overrides.

import Link from "next/link";
import Image from "next/image";
import { SITE_DATA } from "@/lib/site-data";

export default function HomePage() {
  const { business, services, copy, brandAssets } = SITE_DATA;
  const tagline =
    copy.tagline ??
    `${business.name} — trusted local ${business.type.toLowerCase()}.`;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Animated brand-colour gradient background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-cream-50"
        >
          <div className="absolute -inset-[10%] animate-[heroDrift_24s_ease-in-out_infinite_alternate] bg-[radial-gradient(ellipse_at_top_left,_var(--brand-primary-200)_0%,_transparent_60%),radial-gradient(ellipse_at_bottom_right,_var(--brand-secondary-200)_0%,_transparent_60%),linear-gradient(135deg,_#faf7f0_0%,_#fdfcf9_100%)] opacity-85" />
        </div>

        <div className="container-content grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="eyebrow">
              {business.type}
              {business.location ? ` · ${business.location}` : ""}
            </p>
            <h1 className="heading-1">{tagline}</h1>
            <p className="prose-body mt-6 max-w-2xl">
              Trusted local {business.type.toLowerCase()} serving{" "}
              {business.location || "the UK"}. Get in touch for a free
              quote.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/contact" className="btn-primary">
                Get a quote
              </Link>
              <Link href="/services" className="btn-secondary">
                See what we do
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="group aspect-[4/5] overflow-hidden rounded-3xl shadow-lift">
              <Image
                src={brandAssets.heroPhotoUrl}
                alt={`${business.name} work`}
                width={800}
                height={1000}
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Services preview */}
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

      {/* Inline keyframes for the hero drift animation. Tailwind's
          arbitrary animation syntax above references this. */}
      <style>{`
        @keyframes heroDrift {
          0%   { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-2%, 2%) rotate(0.5deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-[heroDrift"] { animation: none; }
        }
      `}</style>
    </>
  );
}
