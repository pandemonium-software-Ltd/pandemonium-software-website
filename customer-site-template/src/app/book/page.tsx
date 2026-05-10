// Booking page — only shown when the customer has the
// "Online Booking" module. The Header conditionally renders the
// nav link, but if someone hits this URL on a customer that
// doesn't have it, we redirect to home.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Book online",
};

export default function BookPage() {
  const { business, modules } = SITE_DATA;

  if (!modules.booking) {
    // Defensive — gate to /book only renders if the module is set,
    // but a deep-link from a search engine could still hit here
    // after the customer removes the module.
    redirect("/");
  }

  return (
    <section className="bg-cream-50 py-20 md:py-28">
      <div className="container-content">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Book online</p>
          <h1 className="heading-1">Pick a time that suits you</h1>
          <p className="prose-body mt-6 text-navy-700">
            Book directly into {business.name}&apos;s calendar. You&apos;ll
            get a confirmation email straight away.
          </p>
        </div>

        <div className="mx-auto mt-12 overflow-hidden rounded-3xl bg-white shadow-lift">
          <iframe
            src={`${modules.booking!.calcomUrl}?embed=true`}
            title="Book a time"
            loading="lazy"
            className="block h-[720px] w-full border-0"
          />
        </div>
      </div>
    </section>
  );
}
