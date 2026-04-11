import type { Metadata } from "next";
import EnquiryForm from "@/components/EnquiryForm";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Start your enquiry — Tell us about your business",
  description:
    "Get in touch with Pandemonium Software Ltd. Fill in the enquiry form or email us directly — we reply within one working day. Proudly Oxfordshire-based, serving small businesses across the UK.",
  alternates: { canonical: "/enquiry" },
  openGraph: {
    title: "Start your enquiry — Pandemonium Software Ltd",
    description:
      "Get in touch with Pandemonium Software Ltd. Fill in the enquiry form or email us directly.",
    url: `${site.url}/enquiry`,
  },
};

export default function EnquiryPage() {
  return (
    <>
      <section className="bg-cream-100/60 pb-12 pt-14 md:pb-16 md:pt-20">
        <div className="container-content max-w-3xl text-center">
          <span className="eyebrow">Start your enquiry</span>
          <h1 className="heading-1">Tell us about your business.</h1>
          <p className="prose-body mx-auto mt-6 max-w-2xl">
            Drop us a line and we&apos;ll reply within one working day. No
            sales patter, no pushy calls — just a proper email from a human.
          </p>
        </div>
      </section>

      <section className="pb-24 pt-10">
        <div className="container-content grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:items-start">
          {/* Direct email side */}
          <aside className="lg:sticky lg:top-28">
            <div className="card bg-white">
              <h2 className="font-serif text-2xl font-semibold text-navy-900">
                Just want to email?
              </h2>
              <p className="mt-3 text-[1rem] leading-relaxed text-navy-700">
                Write to us at the address below. Tell us what you do, where
                you are and roughly what you&apos;re after. We&apos;ll get
                back to you within one working day.
              </p>
              <a
                href={`mailto:${site.contactEmail}`}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-navy-900 px-5 py-3 text-white transition-colors hover:bg-navy-800"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 7 L12 13 L21 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span className="font-medium">{site.contactEmail}</span>
              </a>
              <p className="mt-5 text-sm text-navy-600">
                Based in {site.location.city}, {site.location.region}. We
                work with small businesses across the UK.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-navy-100 bg-cream-50 p-6 text-sm text-navy-700">
              <p className="font-semibold text-navy-900">What happens next?</p>
              <ol className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ember-500 text-xs font-semibold text-white">1</span>
                  <span>You send us a note, either with the form or by email.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ember-500 text-xs font-semibold text-white">2</span>
                  <span>We reply within one working day with a couple of follow-up questions.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ember-500 text-xs font-semibold text-white">3</span>
                  <span>We agree the details over email, then get building.</span>
                </li>
              </ol>
            </div>
          </aside>

          {/* Enquiry form */}
          <div className="card bg-white">
            <h2 className="font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
              Send us an enquiry
            </h2>
            <p className="mt-3 text-[1rem] leading-relaxed text-navy-700">
              Fill in a few details and we&apos;ll come back to you by email.
            </p>
            <div className="mt-8">
              <EnquiryForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
