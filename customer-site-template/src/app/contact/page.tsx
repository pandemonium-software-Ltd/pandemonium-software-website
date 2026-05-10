import type { Metadata } from "next";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  const { business, modules } = SITE_DATA;
  const hasEnquiry = !!modules.enquiry;
  return (
    <section className="bg-cream-50 py-20 md:py-28">
      <div className="container-content max-w-content grid gap-12 md:grid-cols-[1fr_1.5fr] md:gap-16">
        <div>
          <p className="eyebrow">Get in touch</p>
          <h1 className="heading-1">Let&apos;s talk</h1>
          <p className="prose-body mt-6 text-navy-700">
            Phone, email or use the form — whichever suits.
          </p>

          <ul className="mt-10 space-y-4 text-base">
            <ContactRow
              label="Phone"
              value={business.phone}
              href={`tel:${business.phone.replace(/\s/g, "")}`}
            />
            <ContactRow
              label="Email"
              value={business.email}
              href={`mailto:${business.email}`}
            />
            {business.address && (
              <ContactRow label="Address" value={business.address} />
            )}
            {business.hours && (
              <ContactRow label="Hours" value={business.hours} />
            )}
          </ul>
        </div>

        <div>
          {hasEnquiry ? (
            <div className="rounded-3xl border border-navy-100 bg-white p-8 shadow-card md:p-10">
              <h2 className="heading-3">Send a message</h2>
              <p className="mt-2 text-sm text-navy-600">
                Form integration lands in C5.6 — see plan doc. For now,
                use the phone or email on the left.
              </p>
              {/* TODO C5.6: <EnquiryForm recipientEmail={modules.enquiry.recipientEmail} />
                  Reuse the marketing-site EnquiryForm.tsx component
                  with a per-customer Server Action. */}
            </div>
          ) : (
            <div className="rounded-3xl border border-navy-100 bg-white p-8 text-sm text-navy-600 shadow-card md:p-10">
              <p>
                You don&apos;t have the Enquiry Form module on your
                site (yet). Add it via the &ldquo;Re-select
                modules&rdquo; option in your hub.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ContactRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <li className="grid grid-cols-[5rem_1fr] items-baseline gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          className="font-medium text-navy-900 hover:text-brand-primary-700"
        >
          {value}
        </a>
      ) : (
        <span className="font-medium text-navy-900">{value}</span>
      )}
    </li>
  );
}
