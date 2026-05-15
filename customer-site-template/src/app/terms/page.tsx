// Terms of service — auto-generated per customer.
//
// Standard small-business website terms. Identity fields auto-fill
// from SITE_DATA. Conditional sections render based on which
// modules the customer bought (booking T&Cs only if Online Booking
// is active, etc.).
//
// Same posture as /privacy: a generated standard template, not
// solicitor-drafted. Recommended to swap for a solicitor-reviewed
// version when scaling beyond template-shaped customers.

import type { Metadata } from "next";
import Link from "next/link";
import { SITE_DATA } from "@/lib/site-data";

const LAST_UPDATED_ISO = new Date().toISOString().slice(0, 10);

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms and conditions that apply when you use our site or our services.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  const { business, modules } = SITE_DATA;
  const hasBooking = !!modules.booking;
  const hasNewsletter = !!modules.newsletter;
  const hasEnquiry = !!modules.enquiry;

  return (
    <article className="prose-page py-16 md:py-24">
      <div className="container-content max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="heading-1">Terms of service</h1>
        <p className="prose-body mt-4 text-navy-700">
          Last updated: {formatDate(LAST_UPDATED_ISO)}
        </p>

        <hr className="vibe-divider" />

        {/* ---------- 1. Who you're agreeing with ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">1. About these terms</h2>
          <p>
            These terms apply when you visit or use this website (the
            &ldquo;site&rdquo;), which is operated by <strong>{business.name}</strong>
            {business.location ? `, based in ${business.location}` : ""}. If
            you enquire about, book, or buy any of our services through this
            site, these terms (together with any specific job quote or
            service agreement we issue separately) form the basis of our
            relationship.
          </p>
          <p>
            By using the site you accept these terms. If you don&apos;t accept
            them, please don&apos;t use the site.
          </p>
        </section>

        {/* ---------- 2. Acceptable use ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">2. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Use the site for any unlawful purpose.</li>
            <li>
              Attempt to gain unauthorised access to the site, our hosting,
              or any account.
            </li>
            <li>
              Submit false information, impersonate someone else, or send
              spam through any of our forms.
            </li>
            <li>
              Reproduce, copy or scrape substantial parts of the site
              without our written permission. Quoting or linking to it is
              fine.
            </li>
          </ul>
        </section>

        {/* ---------- 3. The services we offer ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">3. Our services</h2>
          <p>
            This site describes the services {business.name} offers
            {business.type ? ` as a ${business.type.toLowerCase()}` : ""}.
            Prices and timelines shown on the site are guides — every job is
            subject to a written quote we provide after discussing your
            specific project. Nothing on this site is a binding offer until
            we send you a written quote and you accept it.
          </p>
        </section>

        {/* ---------- 4. Enquiries ---------- */}
        {hasEnquiry && (
          <section className="mt-10 space-y-4 text-navy-800">
            <h2 className="heading-3">4. Enquiries</h2>
            <p>
              When you submit an enquiry through the contact form, we use
              the information you give us only to respond to your message.
              We aim to reply within 24 hours during the working week. If
              you want us to delete your enquiry from our records, just ask
              — see our{" "}
              <Link href="/privacy" className="link">
                privacy policy
              </Link>
              .
            </p>
          </section>
        )}

        {/* ---------- 5. Bookings ---------- */}
        {hasBooking && (
          <section className="mt-10 space-y-4 text-navy-800">
            <h2 className="heading-3">5. Online bookings</h2>
            <p>
              Bookings made through the online booking widget are
              confirmed instantly unless we contact you to say otherwise.
              By booking, you agree to:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Show up at the agreed time, or cancel at least 24 hours in
                advance via the link in your confirmation email.
              </li>
              <li>
                Pay any deposit shown at the time of booking (if
                applicable). The balance is due when the work is done,
                unless we&apos;ve agreed otherwise in writing.
              </li>
              <li>
                Give us accurate contact details so we can confirm or
                reschedule if needed.
              </li>
            </ul>
            <p>
              If you no-show without cancelling, we may charge a fee equal
              to the booking deposit (or a reasonable reschedule fee if
              there&apos;s no deposit). We&apos;ll always tell you in advance if a
              fee applies.
            </p>
          </section>
        )}

        {/* ---------- 6. Newsletter ---------- */}
        {hasNewsletter && (
          <section className="mt-10 space-y-4 text-navy-800">
            <h2 className="heading-3">
              {hasBooking ? "6" : "5"}. Newsletter
            </h2>
            <p>
              Our newsletter is opt-in. You consent to receive it when you
              tick the subscribe box and confirm via the email we send. You
              can unsubscribe any time using the link in any newsletter
              email — your address comes off the list within 7 days. We
              don&apos;t sell or share newsletter subscribers.
            </p>
          </section>
        )}

        {/* ---------- Liability ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">
            {nextSectionNumber({ hasBooking, hasNewsletter, hasEnquiry, base: 4 })}.
            Liability
          </h2>
          <p>
            We try to keep the information on this site accurate and
            up-to-date, but we don&apos;t guarantee it&apos;s free from errors. The
            site is provided on an &ldquo;as is&rdquo; basis and you use it at your
            own risk.
          </p>
          <p>
            We&apos;re not liable for any loss or damage you suffer as a result
            of relying on information shown on this site that turns out to
            be wrong, except where the law says we can&apos;t exclude that
            liability (for example, for death or personal injury caused by
            our negligence, or for fraud).
          </p>
          <p>
            For services we actually deliver to you, our liability is set
            out in the written quote or service agreement for that job.
            Nothing on this website overrides that.
          </p>
        </section>

        {/* ---------- Privacy + cookies ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">
            {nextSectionNumber({ hasBooking, hasNewsletter, hasEnquiry, base: 5 })}.
            Privacy and cookies
          </h2>
          <p>
            How we collect and use your data — including which third-party
            services we share it with — is described in our{" "}
            <Link href="/privacy" className="link">
              privacy policy
            </Link>
            . By using the site, you also accept the practices described
            there.
          </p>
        </section>

        {/* ---------- Governing law ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">
            {nextSectionNumber({ hasBooking, hasNewsletter, hasEnquiry, base: 6 })}.
            Governing law
          </h2>
          <p>
            These terms are governed by the laws of England and Wales.
            Any dispute that can&apos;t be resolved between us informally is
            subject to the exclusive jurisdiction of the courts of England
            and Wales.
          </p>
        </section>

        {/* ---------- Changes + contact ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">
            {nextSectionNumber({ hasBooking, hasNewsletter, hasEnquiry, base: 7 })}.
            Changes and contact
          </h2>
          <p>
            We may update these terms from time to time. The &ldquo;Last
            updated&rdquo; date at the top reflects the latest change.
            Continued use of the site after a change counts as acceptance
            of the new terms.
          </p>
          <p>
            Questions about these terms?{" "}
            <a href={`mailto:${business.email}`} className="link">
              {business.email}
            </a>
            {business.phone ? (
              <>
                {" "}
                or{" "}
                <a
                  href={`tel:${business.phone.replace(/[^0-9+]/g, "")}`}
                  className="link"
                >
                  {business.phone}
                </a>
              </>
            ) : null}
            .
          </p>
        </section>
      </div>
    </article>
  );
}

/** Each module section consumes one number from the sequence. The
 *  trailing standard sections (Liability, Privacy, Governing law,
 *  Changes) need to advance past whichever modules rendered. */
function nextSectionNumber(args: {
  hasBooking: boolean;
  hasNewsletter: boolean;
  hasEnquiry: boolean;
  base: number;
}): number {
  let offset = 0;
  if (args.hasEnquiry) offset += 1;
  if (args.hasBooking) offset += 1;
  if (args.hasNewsletter) offset += 1;
  return args.base + offset;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
