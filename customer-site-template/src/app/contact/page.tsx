import type { Metadata } from "next";
import { SITE_DATA } from "@/lib/site-data";
import type { DayOfWeek } from "@/lib/types";

/** Display order for the opening-hours table. Mon-first matches
 *  most UK convention; flip to Sun-first for US-style if a future
 *  vibe needs it. */
const HOURS_DAY_ORDER: readonly DayOfWeek[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

const DAY_LABELS: Record<DayOfWeek, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export const metadata: Metadata = {
  title: "Get in touch",
};

// Unified "Get in touch" page that combines whichever contact
// channels the customer's modules unlock:
//   - Phone + email (always shown)
//   - Booking embed (if `modules.booking` set)
//   - Enquiry form (if `modules.enquiry` set — placeholder until
//     C5.6 wires the Server Action)
//   - Address + hours (if set)
//
// Sections are stacked vertically so the page reads as one coherent
// "ways to reach us" flow rather than competing CTAs side-by-side.
// The Cal.com iframe is `loading="lazy"` so callers who only want
// phone don't pay for the embed bundle.

export default function ContactPage() {
  const { business, modules } = SITE_DATA;
  const hasBooking = !!modules.booking;
  const hasEnquiry = !!modules.enquiry;
  const phoneTel = business.phone.replace(/\s/g, "");

  // Sub-headline adapts to which modules unlocked which channels.
  const subline = hasBooking && hasEnquiry
    ? `Phone, email, book a time, or send a message — whichever suits.`
    : hasBooking
      ? `Phone, email, or book a time — whichever suits.`
      : hasEnquiry
        ? `Phone, email, or send a message via the form.`
        : `Phone or email — usually a quick call is the fastest.`;

  return (
    <>
      {/* ---------- Header + quick-contact tiles ---------- */}
      <section className="bg-cream-50 pb-12 pt-20 md:pb-16 md:pt-28">
        <div className="container-content">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Get in touch</p>
            <h1 className="heading-1">Contact {business.name}</h1>
            <p className="prose-body mt-6 text-navy-700">{subline}</p>
          </div>

          <ul className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
            <li>
              <a
                href={`tel:${phoneTel}`}
                className="group flex h-full flex-col gap-1 rounded-2xl border border-navy-100 bg-white p-6 shadow-card transition-all hover:-translate-y-1 hover:border-brand-primary-300 hover:shadow-lift"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                  Phone
                </span>
                <span className="font-serif text-xl font-semibold text-navy-900 group-hover:text-brand-primary-700">
                  {business.phone}
                </span>
                <span className="mt-1 text-sm text-navy-600">
                  Tap to call
                </span>
              </a>
            </li>
            <li>
              <a
                href={`mailto:${business.email}`}
                className="group flex h-full flex-col gap-1 rounded-2xl border border-navy-100 bg-white p-6 shadow-card transition-all hover:-translate-y-1 hover:border-brand-primary-300 hover:shadow-lift"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                  Email
                </span>
                <span className="font-serif text-xl font-semibold text-navy-900 group-hover:text-brand-primary-700 break-all">
                  {business.email}
                </span>
                <span className="mt-1 text-sm text-navy-600">
                  Tap to email
                </span>
              </a>
            </li>
          </ul>

          {/* Anchor-jump bar — only renders if there's somewhere to jump to */}
          {(hasBooking || hasEnquiry) && (
            <nav
              aria-label="Contact options"
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              {hasBooking && (
                <a href="#book" className="btn-secondary">
                  Book a time
                </a>
              )}
              {hasEnquiry && (
                <a href="#enquiry" className="btn-secondary">
                  Send a message
                </a>
              )}
            </nav>
          )}
        </div>
      </section>

      {/* ---------- Booking (if module set) ---------- */}
      {hasBooking && (
        <section
          id="book"
          className="bg-cream-100 py-20 md:py-28 scroll-mt-24"
        >
          <div className="container-content">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Book online</p>
              <h2 className="heading-2">Pick a time that suits you</h2>
              <p className="prose-body mt-4 text-navy-700">
                Book directly into {business.name}&apos;s calendar.
                You&apos;ll get a confirmation email straight away.
              </p>
            </div>
            <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-3xl bg-white shadow-lift">
              <iframe
                src={`${modules.booking!.calcomUrl}?embed=true`}
                title="Book a time"
                loading="lazy"
                className="block h-[720px] w-full border-0"
              />
            </div>
          </div>
        </section>
      )}

      {/* ---------- Enquiry form (if module set) ---------- */}
      {hasEnquiry && (
        <section
          id="enquiry"
          className="bg-cream-50 py-20 md:py-28 scroll-mt-24"
        >
          <div className="container-content">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Send a message</p>
              <h2 className="heading-2">Drop {business.name} a line</h2>
              <p className="prose-body mt-4 text-navy-700">
                Got a question or want to start a conversation? Fill
                in the form and we&apos;ll come back within a working
                day.
              </p>
            </div>
            <div className="mx-auto mt-12 max-w-2xl rounded-3xl border border-navy-100 bg-white p-8 shadow-card md:p-10">
              {/* TODO C5.6: replace placeholder with the marketing-
                  site EnquiryForm component, wired to a per-customer
                  Server Action that posts to Resend transactional
                  using `modules.enquiry.recipientEmail`. */}
              <p className="text-sm text-navy-600">
                Form integration is rolling out (Stage 2C C5.6 — see
                the plan doc). For now, please use the phone or email
                above and we&apos;ll get back to you straight away.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Address + hours (only if set) ---------- */}
      {(business.address || business.hours || business.hoursStructured) && (
        <section className="bg-cream-100 py-20 md:py-28">
          <div className="container-content">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Where + when</p>
            </div>
            <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
              {business.address && (
                <div className="rounded-2xl border border-navy-100 bg-white p-6 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Address
                  </p>
                  <address className="mt-2 not-italic text-navy-800">
                    {business.address}
                  </address>
                </div>
              )}
              {/* Hours: prefer the structured per-day table when the
                  customer set hours via the Hub Step 4 grid. Fall
                  back to the flat string render for legacy customers
                  / free-text intake values. */}
              {business.hoursStructured ? (
                <div className="rounded-2xl border border-navy-100 bg-white p-6 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Opening hours
                  </p>
                  <dl className="mt-3 divide-y divide-navy-100 text-sm">
                    {HOURS_DAY_ORDER.map((day) => {
                      const entry = business.hoursStructured?.[day];
                      const open = entry?.open && entry.from && entry.to;
                      return (
                        <div
                          key={day}
                          className="flex items-baseline justify-between gap-3 py-2"
                        >
                          <dt className="font-semibold text-navy-900">
                            {DAY_LABELS[day]}
                          </dt>
                          <dd
                            className={
                              open
                                ? "font-mono text-navy-800"
                                : "text-navy-400"
                            }
                          >
                            {open ? `${entry.from} – ${entry.to}` : "Closed"}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ) : business.hours ? (
                <div className="rounded-2xl border border-navy-100 bg-white p-6 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Opening hours
                  </p>
                  <p className="mt-2 whitespace-pre-line text-navy-800">
                    {business.hours}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
