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

  return (
    <section className="bg-cream-50 py-20 md:py-28">
      <div className="container-content">
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr] md:gap-20">
          <div>
            <p className="eyebrow">About</p>
            <h1 className="heading-1">About {business.name}</h1>
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
