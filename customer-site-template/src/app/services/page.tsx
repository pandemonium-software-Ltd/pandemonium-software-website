import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Services",
};

export default function ServicesPage() {
  const { services, copy, business, brandAssets } = SITE_DATA;
  const intro =
    copy.servicesIntro ??
    `Here's what ${business.name} can help with. Don't see what you need? Get in touch — we cover most things in this space.`;

  // Photo lookup keyed by service name.
  const photoByName = new Map(
    brandAssets.servicePhotos.map((sp) => [sp.serviceName, sp.url]),
  );

  return (
    <section className="bg-cream-50 py-20 md:py-28">
      <div className="container-content">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">What we do</p>
          <h1 className="heading-1">Our services</h1>
          <p className="prose-body mt-6 text-navy-700">{intro}</p>
        </div>

        <div className="mt-16 space-y-12 md:space-y-20">
          {services.map((svc, i) => {
            const photo = photoByName.get(svc.name);
            const reverse = i % 2 === 1; // Alternate sides for visual rhythm
            return (
              <article
                key={svc.name}
                className="group grid items-start gap-8 md:gap-12 lg:grid-cols-[1.2fr_1fr]"
              >
                {/* Photo on left for even-indexed cards, right for odd.
                    Falls back to a brand-coloured panel if no photo set. */}
                <div
                  className={[
                    "overflow-hidden rounded-3xl shadow-lift",
                    reverse ? "lg:order-2" : "",
                  ].join(" ")}
                >
                  {photo ? (
                    <div className="aspect-[4/3]">
                      <Image
                        src={photo}
                        alt={svc.name}
                        width={1200}
                        height={900}
                        sizes="(max-width: 1024px) 100vw, 55vw"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-brand-primary-100 p-8 text-center">
                      <span className="font-serif text-2xl font-semibold text-brand-primary-700">
                        {svc.name}
                      </span>
                    </div>
                  )}
                </div>

                <div className={reverse ? "lg:order-1" : ""}>
                  <h2 className="heading-2">{svc.name}</h2>
                  <p className="prose-body mt-4 text-navy-800">
                    {svc.longDescription ?? svc.description}
                  </p>

                  {svc.features && svc.features.length > 0 && (
                    <ul className="mt-6 space-y-3">
                      {svc.features.map((f, fi) => (
                        <li
                          key={fi}
                          className="flex items-start gap-3 text-navy-800"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-primary-100 text-brand-primary-700"
                          >
                            <svg
                              width="12"
                              height="12"
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
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {(svc.pricingNotes || svc.priceFrom !== undefined) && (
                    <p className="mt-6 text-base font-semibold text-brand-primary-700">
                      {svc.pricingNotes ??
                        `From £${svc.priceFrom?.toLocaleString()}`}
                    </p>
                  )}

                  <div className="mt-6">
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-2 text-base font-semibold text-brand-primary-700 hover:text-brand-primary-900"
                    >
                      Get a quote for this →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-20 text-center">
          <Link href="/contact" className="btn-primary">
            Get a quote
          </Link>
        </div>
      </div>
    </section>
  );
}
