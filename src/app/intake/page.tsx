import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Get started — Tell us about your business",
  description:
    "Start the simple intake process to get your Oxfordshire trades website built by Pandemonium Software Ltd.",
  alternates: { canonical: "/intake" },
  robots: { index: false, follow: true },
};

export default function IntakePage() {
  return (
    <section className="section bg-cream-50">
      <div className="container-content max-w-3xl text-center">
        <span className="eyebrow">Get started</span>
        <h1 className="heading-1">The full intake form is nearly here.</h1>
        <p className="prose-body mx-auto mt-6 max-w-xl">
          We&apos;re busy polishing a simple intake form that&apos;ll take
          you about five minutes to fill in. In the meantime, the fastest way
          to get going is to book a free 30-minute chat. We&apos;ll talk
          through what you need and get everything set up.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href={site.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Book a free chat
          </a>
          <Link href="/pricing" className="btn-secondary">
            Back to pricing
          </Link>
        </div>
        <p className="mt-10 text-sm text-navy-600">
          Prefer email? Drop us a line at{" "}
          <a
            href={`mailto:${site.contactEmail}`}
            className="link"
          >
            {site.contactEmail}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
