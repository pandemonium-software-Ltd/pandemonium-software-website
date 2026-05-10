import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "FAQs",
  description: "Frequently asked questions",
};

export default function FaqPage() {
  const { copy, business } = SITE_DATA;
  const faq = copy.faq ?? [];

  // No FAQs = redirect to home (the nav link only renders when faq
  // is non-empty, but a deep-link from search could still hit here).
  if (faq.length === 0) redirect("/");

  // FAQPage JSON-LD for SEO. Google + Bing surface FAQ rich
  // snippets in search results when this is present.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="bg-cream-50 py-20 md:py-28">
        <div className="container-content">
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow">FAQs</p>
            <h1 className="heading-1">
              Questions {business.name} hears the most
            </h1>
            <p className="prose-body mt-6 text-navy-700">
              If your question isn&apos;t here, just{" "}
              <Link href="/contact" className="underline">
                get in touch
              </Link>{" "}
              — we read every email.
            </p>

            <ul className="mt-12 space-y-4">
              {faq.map((f, i) => (
                <li key={i}>
                  {/* Native <details>/<summary> for accessibility +
                      zero-JS. Keyboard, screen-reader, and search
                      crawlers all see the full answer text. */}
                  <details className="group rounded-2xl border border-navy-100 bg-white p-6 shadow-card transition-colors open:border-brand-primary-300">
                    <summary className="flex cursor-pointer items-start gap-4 list-none">
                      <span className="flex-1 font-serif text-lg font-semibold text-navy-900 md:text-xl">
                        {f.question}
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-primary-100 text-brand-primary-700 transition-transform group-open:rotate-45"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M12 5v14M5 12h14"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    </summary>
                    <div className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-navy-800">
                      {f.answer}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
