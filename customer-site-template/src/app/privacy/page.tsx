// Privacy policy — auto-generated per customer.
//
// All identity fields (business name, address, email, location) are
// auto-filled from SITE_DATA. The text is a standard small-business
// UK privacy policy template; sections are conditionally rendered
// based on which modules the customer bought, so the policy only
// describes data flows that are actually active.
//
// Legal posture: this is a generated standard template, not a
// solicitor-drafted policy. ModuForge customers tick "I am the data
// controller" at intake, so they OWN the data and the legal
// responsibility — we provide reasonable boilerplate so they're
// compliant by default. A solicitor review path is recommended for
// any customer with non-standard data flows (medical records,
// children's data, biometrics, etc. — those triggers route to
// hard-blockers in our Phase 2 qualification anyway).
//
// Last-updated date is build-time. Re-builds bump it automatically.

import type { Metadata } from "next";
import { SITE_DATA } from "@/lib/site-data";

const LAST_UPDATED_ISO = new Date().toISOString().slice(0, 10);

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How we collect, use and protect your personal data when you use our site.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  const { business, modules } = SITE_DATA;
  const hasEnquiry = !!modules.enquiry;
  const hasBooking = !!modules.booking;
  const hasNewsletter = !!modules.newsletter;

  return (
    <article className="prose-page py-16 md:py-24">
      <div className="container-content max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="heading-1">Privacy policy</h1>
        <p className="prose-body mt-4 text-navy-700">
          Last updated: {formatDate(LAST_UPDATED_ISO)}
        </p>

        <hr className="vibe-divider" />

        {/* ---------- 1. Who we are ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">1. Who we are</h2>
          <p>
            This site is operated by <strong>{business.name}</strong>
            {business.location ? `, based in ${business.location}` : ""}
            {business.address ? ` (${business.address})` : ""}. We are the data
            controller for any personal information collected through this
            site.
          </p>
          <p>
            You can reach us with any privacy question at{" "}
            <a href={`mailto:${business.email}`} className="link">
              {business.email}
            </a>
            {business.phone ? (
              <>
                {" "}
                or by phone on{" "}
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

        {/* ---------- 2. What we collect ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">2. What personal data we collect</h2>
          <p>
            We only collect information that you give us directly, plus a
            small amount of technical data your browser sends automatically:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            {hasEnquiry && (
              <li>
                <strong>Enquiry form:</strong> when you contact us through
                the enquiry form, we collect your name, email address, phone
                number (if provided) and the contents of your message.
              </li>
            )}
            {hasBooking && (
              <li>
                <strong>Online booking:</strong> when you book an appointment
                through our booking system (powered by Cal.com), we collect
                your name, email address, the date and time of your booking,
                and any notes you choose to add. Cal.com processes this
                booking on our behalf — see their privacy policy at{" "}
                <a
                  href="https://cal.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  cal.com/privacy
                </a>
                .
              </li>
            )}
            {hasNewsletter && (
              <li>
                <strong>Newsletter:</strong> if you subscribe to our
                newsletter, we collect your email address (and optionally
                your name). We use Resend to send these emails — see their
                privacy policy at{" "}
                <a
                  href="https://resend.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  resend.com/legal/privacy-policy
                </a>
                .
              </li>
            )}
            <li>
              <strong>Technical data:</strong> your IP address, browser type,
              the pages you visit and approximate location (country/region).
              This is collected by our hosting provider (Cloudflare) for
              security and performance, and is not linked to your identity.
            </li>
          </ul>
        </section>

        {/* ---------- 3. Why we collect it ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">3. Why we use your data</h2>
          <p>
            We only use your data for the purpose it was given:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            {hasEnquiry && (
              <li>
                To reply to your enquiry and discuss the work you&apos;ve asked
                about. Lawful basis: <em>legitimate interest</em> (responding
                to a request you initiated).
              </li>
            )}
            {hasBooking && (
              <li>
                To confirm your appointment, remind you before it, and
                manage rescheduling or cancellations. Lawful basis:{" "}
                <em>performance of a contract</em> (your booking with us).
              </li>
            )}
            {hasNewsletter && (
              <li>
                To send you the newsletter you signed up for. Lawful basis:{" "}
                <em>your consent</em>, which you can withdraw any time by
                clicking the unsubscribe link in any of our emails.
              </li>
            )}
            <li>
              To keep the site secure, prevent abuse, and improve how it
              works. Lawful basis: <em>legitimate interest</em> (running a
              secure, functional website).
            </li>
          </ul>
        </section>

        {/* ---------- 4. Where it's stored / who else sees it ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">4. Who else sees your data</h2>
          <p>
            We don&apos;t sell your data. We share it only with the service
            providers that help us run the site, and only the minimum each
            of them needs:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Cloudflare</strong> hosts this site. EU/UK data stays
              in the EU/UK region.
            </li>
            {hasBooking && (
              <li>
                <strong>Cal.com</strong> processes online bookings. UK
                customers route to their EU instance (cal.eu) for GDPR data
                residency.
              </li>
            )}
            {(hasEnquiry || hasNewsletter) && (
              <li>
                <strong>Resend</strong> delivers transactional and
                newsletter emails. Servers are in the EU.
              </li>
            )}
            <li>
              <strong>ModuForge</strong> — our website builder
              (modu-forge.co.uk) — maintains the site infrastructure. They
              do not access visitor data unless we ask them to investigate
              a fault.
            </li>
          </ul>
          <p>
            We don&apos;t transfer your data outside the UK or EEA. We don&apos;t
            share it with advertising networks or data brokers.
          </p>
        </section>

        {/* ---------- 5. How long we keep it ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">5. How long we keep your data</h2>
          <ul className="list-disc space-y-2 pl-6">
            {hasEnquiry && (
              <li>
                Enquiry messages: kept for 3 years after our last contact,
                in case you come back to us about the same project.
              </li>
            )}
            {hasBooking && (
              <li>
                Booking records: kept for 6 years to meet HMRC record-
                keeping requirements (legitimate business purpose).
              </li>
            )}
            {hasNewsletter && (
              <li>
                Newsletter subscribers: kept until you unsubscribe. Once
                you unsubscribe, your address is removed from the active
                list within 7 days; we keep a suppression record (just your
                email, hashed) to make sure we don&apos;t accidentally re-add
                you.
              </li>
            )}
            <li>
              Technical logs: 30 days, after which they&apos;re aggregated and
              anonymised.
            </li>
          </ul>
        </section>

        {/* ---------- 6. Your rights ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">6. Your rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Ask what data we hold about you and get a copy.</li>
            <li>Ask us to correct anything that&apos;s wrong.</li>
            <li>Ask us to delete your data (the &ldquo;right to be forgotten&rdquo;).</li>
            <li>Object to us using your data, or restrict how we use it.</li>
            <li>
              Withdraw consent (where consent is our lawful basis) at any
              time.
            </li>
            <li>
              Complain to the UK&apos;s Information Commissioner&apos;s Office (ICO)
              at{" "}
              <a
                href="https://ico.org.uk/concerns/"
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                ico.org.uk/concerns
              </a>{" "}
              if you think we&apos;ve mishandled your data — but we&apos;d much
              prefer you talk to us first so we can fix it.
            </li>
          </ul>
          <p>
            To exercise any of these, just email{" "}
            <a href={`mailto:${business.email}`} className="link">
              {business.email}
            </a>
            . We&apos;ll respond within 30 days (usually much sooner).
          </p>
        </section>

        {/* ---------- 7. Cookies ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">7. Cookies</h2>
          <p>
            This site uses essential cookies that are needed for it to work
            correctly. These don&apos;t track you across other sites and they
            don&apos;t identify you.
          </p>
          {hasBooking && (
            <p>
              If you use the online booking widget, Cal.com may set
              additional cookies to manage your booking session. Those
              cookies are described in Cal.com&apos;s cookie policy.
            </p>
          )}
          <p>
            We don&apos;t use advertising cookies, retargeting pixels, or
            third-party analytics that profile you.
          </p>
        </section>

        {/* ---------- 8. Changes ---------- */}
        <section className="mt-10 space-y-4 text-navy-800">
          <h2 className="heading-3">8. Changes to this policy</h2>
          <p>
            We update this policy when we change how the site works (for
            example, if we add a new module or change a service provider).
            The &ldquo;Last updated&rdquo; date at the top reflects the most recent
            change. If we ever make a material change, we&apos;ll flag it
            visibly on the site for at least 30 days.
          </p>
        </section>

        <hr className="vibe-divider mt-12" />

        <p className="mt-8 text-sm text-navy-600">
          If anything here is unclear, please email{" "}
          <a href={`mailto:${business.email}`} className="link">
            {business.email}
          </a>{" "}
          — we&apos;ll explain in plain English.
        </p>
      </div>
    </article>
  );
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
