import type { Metadata } from "next";
import Image from "next/image";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "About",
  description: SITE_DATA.copy.aboutBlurb?.split("\n\n")[0],
};

export default function AboutPage() {
  const { business, copy, brandAssets } = SITE_DATA;
  const aboutBlurb =
    copy.aboutBlurb ??
    `${business.name} is a ${business.type.toLowerCase()} based in ${business.location || "the UK"}. We pride ourselves on quality work, fair prices, and turning up when we say we will.`;
  const paragraphs = aboutBlurb.split(/\n\n+/);
  const aboutPhoto = brandAssets.aboutPhotoUrl;
  const bullets = copy.aboutBullets ?? [];
  const testimonials = copy.testimonials ?? [];
  const trust = copy.trust;
  const trustBadges = buildTrustBadges(trust);

  return (
    <section className="bg-cream-50 py-20 md:py-28">
      <div className="container-content">
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr] md:gap-20">
          <div>
            <p className="eyebrow">About</p>
            <h1 className="heading-1">About {business.name}</h1>
            {trustBadges.length > 0 && (
              <ul className="mt-6 space-y-2">
                {trustBadges.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm font-semibold text-navy-700"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-primary-100 text-brand-primary-700"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M9 12l2 2 4-4"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-5">
            {paragraphs.map((p, i) => (
              <p key={i} className="prose-body text-navy-800">
                {p}
              </p>
            ))}
          </div>
        </div>

        {/* "What makes us different" bullets — renders below the
            blurb if the customer added any in Hub Step 4 Content.
            Styled as a tight grid with brand-accent checkmarks. */}
        {bullets.length > 0 && (
          <div className="mt-16 rounded-3xl border border-navy-100 bg-white p-8 shadow-card md:mt-20 md:p-12">
            <p className="eyebrow">What makes us different</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-primary-100 text-brand-primary-700"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <path
                        d="M5 12l4 4 10-10"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-base text-navy-800">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Testimonials — quote cards in a 2-up grid (1 on mobile).
            Renders only when the customer has added at least one in
            Hub Step 4 Content > Testimonials. */}
        {testimonials.length > 0 && (
          <div className="mt-16 md:mt-20">
            <p className="eyebrow text-center">What customers say</p>
            <h2 className="heading-2 mt-2 text-center">
              In their own words
            </h2>
            <ul className="mt-10 grid gap-6 md:grid-cols-2">
              {testimonials.map((t, i) => (
                <li
                  key={i}
                  className="rounded-3xl border border-navy-100 bg-white p-7 shadow-card"
                >
                  {t.rating !== undefined && <StarRow rating={t.rating} />}
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
          </div>
        )}

        {/* Optional team / owner photo. Renders only when set so
            customers without one don't get a placeholder. */}
        {aboutPhoto && (
          <div className="mt-16 overflow-hidden rounded-3xl shadow-lift md:mt-20">
            <Image
              src={aboutPhoto}
              alt={`${business.name} team`}
              width={1600}
              height={1000}
              sizes="(max-width: 768px) 100vw, 80vw"
              className="h-auto w-full object-cover"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Filled (★) + empty (☆) star row for a testimonial rating.
 * Renders only when a rating is set; visual + accessible
 * (aria-label gives the rating text for screen readers).
 *
 * Centralised here so the same component is shared with the
 * home-page testimonial slice — keep them visually identical.
 */
function StarRow({ rating }: { rating: number }) {
  return (
    <div
      className="flex items-center gap-0.5 text-amber-500"
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

/**
 * Convert structured TrustSignals into a flat list of display
 * strings for the About-page sidebar. Returns [] if no trust data.
 *
 * Years experience renders as "15 years' experience".
 * Associations + awards split on commas so a single field becomes
 * multiple badges.
 */
function buildTrustBadges(
  trust: import("@/lib/types").TrustSignals | undefined,
): string[] {
  if (!trust) return [];
  const out: string[] = [];
  if (typeof trust.yearsExperience === "number" && trust.yearsExperience > 0) {
    out.push(
      `${trust.yearsExperience} year${trust.yearsExperience === 1 ? "" : "s"}' experience`,
    );
  }
  if (trust.associations) {
    out.push(
      ...trust.associations
        .split(/[,•]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
  }
  if (trust.awards) {
    out.push(
      ...trust.awards
        .split(/[,•]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
  }
  return out;
}
