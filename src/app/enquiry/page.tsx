import type { Metadata } from "next";
import EnquiryForm from "@/components/EnquiryForm";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Start your enquiry — Tell me about your business",
  description:
    "Get in touch with Pandemonium Software Ltd. Fill in the enquiry form or email me directly — I reply within 4 hours (working hours). Oxfordshire-based, serving small businesses across the UK.",
  alternates: { canonical: "/enquiry" },
  openGraph: {
    title: "Start your enquiry — Pandemonium Software Ltd",
    description:
      "Get in touch with Pandemonium Software Ltd. Fill in the enquiry form or email me directly.",
    url: `${site.url}/enquiry`,
  },
};

export default function EnquiryPage() {
  return (
    <>
      <section className="bg-cream-100/60 pb-12 pt-14 md:pb-16 md:pt-20">
        <div className="container-content max-w-3xl text-center">
          <span className="eyebrow">Start your enquiry</span>
          <h1 className="heading-1">Tell me about your business.</h1>
          <p className="prose-body mx-auto mt-6 max-w-2xl">
            Fill in a few details below. You&apos;ll have a reply within 4
            working hours. An AI assistant drafts every reply against my
            playbook; I review and approve before it sends — so you get fast
            turnaround and a real human eye on every message.
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
                Write to the address below. Tell me what you do, where you
                are and roughly what you&apos;re after. You&apos;ll have a
                reply within 4 working hours (drafted by AI, reviewed and
                sent by me).
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
                Based in {site.location.city}, {site.location.region}. I
                work with small businesses across the UK.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-navy-100 bg-cream-50 p-6 text-sm text-navy-700">
              <p className="font-semibold text-navy-900">What happens next?</p>
              <ol className="mt-3 space-y-2">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ember-500 text-xs font-semibold text-white">1</span>
                  <span>You send the form (or email me directly).</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ember-500 text-xs font-semibold text-white">2</span>
                  <span>An AI assistant drafts a reply against my playbook; I review and approve before it sends. A short follow-up form arrives within 4 working hours.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ember-500 text-xs font-semibold text-white">3</span>
                  <span>If it&apos;s a good fit, you get a fixed quote and we sort the details over email.</span>
                </li>
              </ol>
            </div>
          </aside>

          {/* Enquiry form */}
          <div className="card bg-white">
            <h2 className="font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
              Send me an enquiry
            </h2>
            <p className="mt-3 text-[1rem] leading-relaxed text-navy-700">
              Fill in a few details. You&apos;ll have a reply within 4
              working hours.
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
