import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description:
    "GDPR Article 28 Data Processing Agreement between Pandemonium Software Ltd and its customers.",
  alternates: { canonical: "/dpa" },
};

const lastUpdated = "28 May 2026";

export default function DpaPage() {
  return (
    <section className="section bg-white">
      <div className="container-content max-w-3xl">
        <span className="eyebrow">Legal</span>
        <h1 className="heading-1">Data Processing Agreement</h1>
        <p className="mt-4 text-sm text-navy-600">
          Last updated: {lastUpdated}
        </p>

        <div className="mt-10 rounded-2xl border-l-4 border-ember-500 bg-ember-50 p-6 text-[1.05rem] text-navy-800">
          <p className="font-semibold text-navy-900">
            What this document is for.
          </p>
          <p className="mt-2">
            UK GDPR (Article 28) requires a written agreement wherever one
            party processes personal data on behalf of another. You (the
            customer) are the <strong>data controller</strong> for your own
            customers&apos; data. I (Pandemonium Software Ltd, trading as
            ModuForge) am the <strong>data processor</strong> — I handle
            some of that data on your behalf to build, host, and maintain
            your website.
          </p>
          <p className="mt-2">
            This DPA is part of the{" "}
            <a href="/terms" className="link">
              Terms of Service
            </a>
            . By accepting the terms at intake, you also accept this DPA.
          </p>
        </div>

        <div className="long-form mt-10">
          <h2>1. Definitions</h2>
          <ul>
            <li>
              <strong>&quot;Controller&quot;</strong> — you, the customer
              who signs up for ModuForge services.
            </li>
            <li>
              <strong>&quot;Processor&quot;</strong> — Pandemonium Software
              Ltd (company number {site.legal.companyNumber}), trading as
              ModuForge.
            </li>
            <li>
              <strong>&quot;Personal Data&quot;</strong> — any information
              relating to an identified or identifiable natural person, as
              defined by UK GDPR Article 4(1).
            </li>
            <li>
              <strong>&quot;Sub-processor&quot;</strong> — a third party
              engaged by the Processor to process Personal Data on behalf
              of the Controller.
            </li>
            <li>
              <strong>&quot;Data Subject&quot;</strong> — the individual
              whose Personal Data is processed (typically your customers,
              website visitors, or newsletter subscribers).
            </li>
            <li>
              <strong>&quot;UK GDPR&quot;</strong> — the General Data
              Protection Regulation as retained in UK law by the European
              Union (Withdrawal) Act 2018, read with the Data Protection
              Act 2018.
            </li>
          </ul>

          <h2>2. Scope and purpose of processing</h2>
          <p>
            The Processor processes Personal Data solely to deliver the
            services described in the{" "}
            <a href="/terms" className="link">
              Terms of Service
            </a>
            :
          </p>
          <ul>
            <li>
              Building, hosting and maintaining the Controller&apos;s
              website.
            </li>
            <li>
              Configuring and managing connected services on the
              Controller&apos;s behalf (email sending, booking,
              Google Business Profile, payment processing).
            </li>
            <li>Running operational automation (review monitoring, GBP audits, analytics digests).</li>
            <li>
              Providing ongoing support, updates, and change requests.
            </li>
          </ul>
          <p>
            The Processor does not process Personal Data for any purpose
            other than delivering the contracted services, and never sells,
            rents, or shares Personal Data for marketing purposes.
          </p>

          <h2>3. Categories of Personal Data processed</h2>
          <div className="rounded-lg border border-navy-100 bg-cream-50 p-4 text-[0.95rem] not-prose">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-navy-200">
                  <th className="pb-2 font-semibold text-navy-900">
                    Category
                  </th>
                  <th className="pb-2 font-semibold text-navy-900">
                    Examples
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    Controller identity
                  </td>
                  <td className="py-2">
                    Name, email, phone, business name, address
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    Controller&apos;s customer data
                  </td>
                  <td className="py-2">
                    Newsletter subscriber emails, enquiry form submissions,
                    booking requests
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">Website content</td>
                  <td className="py-2">
                    Photos, testimonials, service descriptions, brand
                    assets
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">Payment data</td>
                  <td className="py-2">
                    Invoice amounts, payment dates, subscription status
                    (card details handled by Stripe — never seen or stored
                    by the Processor)
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    Analytics and logs
                  </td>
                  <td className="py-2">
                    Page views, referrers, device type (aggregated, no
                    individual tracking)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            <strong>Special category data:</strong> the Processor does not
            knowingly process any special category data (Article 9) or
            criminal offence data (Article 10). If the Controller&apos;s
            website collects such data, the Controller must inform the
            Processor in writing before processing begins.
          </p>

          <h2>4. Processor obligations</h2>
          <p>The Processor shall:</p>
          <ul>
            <li>
              Process Personal Data only on documented instructions from
              the Controller (which are the Terms of Service and any
              written change requests), unless required by law to do
              otherwise — in which case the Processor will inform the
              Controller before processing, unless legally prohibited
              from doing so.
            </li>
            <li>
              Ensure that any persons authorised to process the Personal
              Data are bound by confidentiality obligations. As a
              one-person operation, this applies to Ben Pandher
              (sole director) and any contractors engaged in future.
            </li>
            <li>
              Implement appropriate technical and organisational measures
              to ensure a level of security appropriate to the risk,
              including: encryption of data in transit (HTTPS/TLS),
              access controls on all systems, automated data deletion
              processes, and regular security reviews.
            </li>
            <li>
              Not engage another processor (sub-processor) without the
              Controller&apos;s prior written consent — see Section 6.
            </li>
            <li>
              Assist the Controller in responding to Data Subject requests
              (access, rectification, erasure, portability, restriction,
              objection) within the timeframes required by UK GDPR.
            </li>
            <li>
              Assist the Controller in ensuring compliance with Articles
              32 to 36 (security, breach notification, impact assessments,
              prior consultation) taking into account the nature of
              processing and the information available to the Processor.
            </li>
            <li>
              At the Controller&apos;s choice, delete or return all
              Personal Data after the end of the service — and delete
              existing copies unless UK law requires storage. See
              Section 8.
            </li>
            <li>
              Make available to the Controller all information necessary
              to demonstrate compliance with Article 28, and allow for
              and contribute to audits conducted by the Controller or an
              auditor mandated by the Controller.
            </li>
          </ul>

          <h2>5. Controller obligations</h2>
          <p>The Controller shall:</p>
          <ul>
            <li>
              Ensure there is a lawful basis for providing Personal Data
              to the Processor (typically contract performance or
              legitimate interest).
            </li>
            <li>
              Provide clear and complete instructions regarding the
              processing of Personal Data.
            </li>
            <li>
              Be responsible for the accuracy of Personal Data provided.
            </li>
            <li>
              Fulfil its own obligations to Data Subjects (privacy
              notices, consent collection where required, responding to
              rights requests).
            </li>
          </ul>

          <h2>6. Sub-processors</h2>
          <p>
            The Controller provides general written authorisation for the
            Processor to engage the following sub-processors. The
            Processor will notify the Controller by email before adding
            or replacing a sub-processor, giving the Controller the
            opportunity to object within 14 days.
          </p>
          <div className="rounded-lg border border-navy-100 bg-cream-50 p-4 text-[0.95rem] not-prose">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-navy-200">
                  <th className="pb-2 font-semibold text-navy-900">
                    Sub-processor
                  </th>
                  <th className="pb-2 font-semibold text-navy-900">
                    Purpose
                  </th>
                  <th className="pb-2 font-semibold text-navy-900">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    Cloudflare, Inc.
                  </td>
                  <td className="py-2">
                    Website hosting (Workers, Pages, R2, D1), DNS, CDN,
                    DDoS protection
                  </td>
                  <td className="py-2">US (global edge)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">Notion Labs, Inc.</td>
                  <td className="py-2">
                    Customer records, project management, intake data
                    storage
                  </td>
                  <td className="py-2">US</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    Resend, Inc.
                  </td>
                  <td className="py-2">
                    Transactional email delivery (intake confirmations,
                    notifications, newsletters)
                  </td>
                  <td className="py-2">US</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">Stripe, Inc.</td>
                  <td className="py-2">
                    Payment processing, subscription billing, invoicing
                  </td>
                  <td className="py-2">US / Ireland</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">Google LLC</td>
                  <td className="py-2">
                    Google Business Profile management (Places API),
                    Google Maps
                  </td>
                  <td className="py-2">US</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    Anthropic, PBC
                  </td>
                  <td className="py-2">
                    AI operations assistant (enquiry processing, GBP
                    audits, content analysis). Does not train on customer
                    data per Anthropic commercial terms.
                  </td>
                  <td className="py-2">US</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    Sentry (Functional Software, Inc.)
                  </td>
                  <td className="py-2">
                    Error tracking and application monitoring
                  </td>
                  <td className="py-2">US</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            <strong>International transfers:</strong> several
            sub-processors are based in the United States. Transfers are
            covered by each provider&apos;s standard contractual clauses
            (SCCs) or UK International Data Transfer Agreement (IDTA) as
            applicable. The Processor will ensure that any sub-processor
            provides at least the same level of data protection as
            required by this DPA.
          </p>

          <h2>7. Data breach notification</h2>
          <p>
            If the Processor becomes aware of a Personal Data breach, it
            will:
          </p>
          <ul>
            <li>
              Notify the Controller without undue delay and in any event
              within <strong>24 hours</strong> of becoming aware of the
              breach.
            </li>
            <li>
              Provide sufficient detail for the Controller to fulfil its
              own breach notification obligations under Articles 33 and
              34 UK GDPR, including: the nature of the breach, categories
              and approximate number of Data Subjects affected, likely
              consequences, and measures taken or proposed to address the
              breach.
            </li>
            <li>
              Cooperate with the Controller and take reasonable commercial
              steps to assist in the investigation, mitigation and
              remediation of the breach.
            </li>
          </ul>

          <h2>8. Data retention and deletion</h2>
          <p>
            The Processor applies the following retention periods, aligned
            with the automated GDPR retention system described in the{" "}
            <a href="/terms" className="link">
              Terms of Service
            </a>{" "}
            (Section 11):
          </p>
          <ul>
            <li>
              <strong>Personal data (content, contacts, brand assets,
              subscriber lists, analytics):</strong> deleted automatically{" "}
              <strong>30 days</strong> after the Controller cancels
              the service. The 30-day window allows for change-of-mind
              reactivation and final-invoice handling.
            </li>
            <li>
              <strong>Financial records (invoice amounts, payment dates,
              business name):</strong> retained for{" "}
              <strong>7 years</strong> from the end of the tax year in
              which they arose, as required by HMRC (Companies Act 2006
              s388, VATA 1994 Sch 11). These records contain the minimum
              data necessary for the legal obligation.
            </li>
            <li>
              <strong>Anonymised audit logs:</strong> after deletion
              completes, an internal record is kept (timestamp + customer
              reference only — no Personal Data) to demonstrate the scrub
              was performed.
            </li>
          </ul>
          <p>
            The Controller may request early erasure of Personal Data
            (before the 30-day window expires) by emailing{" "}
            <a href={`mailto:${site.contactEmail}`}>
              {site.contactEmail}
            </a>
            . The Processor will action this within 30 days as required
            by Article 17 UK GDPR, except where retention is required by
            law (financial records).
          </p>

          <h2>9. Data Subject rights</h2>
          <p>
            If a Data Subject contacts the Processor directly with a
            rights request (access, rectification, erasure, restriction,
            portability, objection, or a data protection complaint
            under the Data (Use and Access) Act 2025), the Processor
            will:
          </p>
          <ul>
            <li>
              Promptly notify the Controller of the request.
            </li>
            <li>
              Assist the Controller in responding within the UK GDPR
              timeframe (one calendar month, extendable by two months
              for complex requests).
            </li>
            <li>
              Not respond to the Data Subject directly without the
              Controller&apos;s instruction, unless required by law.
            </li>
          </ul>

          <h2>10. Audits</h2>
          <p>
            The Controller may request an audit of the Processor&apos;s
            compliance with this DPA by giving 14 days&apos; written
            notice. The Processor will cooperate and provide reasonable
            access to relevant records and systems. Audits will be
            conducted during normal business hours and will not
            unreasonably interfere with the Processor&apos;s operations.
          </p>

          <h2>11. Liability</h2>
          <p>
            Each party&apos;s liability under this DPA is subject to the
            limitations set out in Section 12 of the{" "}
            <a href="/terms" className="link">
              Terms of Service
            </a>
            .
          </p>

          <h2>12. Term and termination</h2>
          <p>
            This DPA comes into effect when the Controller accepts the
            Terms of Service and remains in effect for as long as the
            Processor processes Personal Data on behalf of the Controller.
            It terminates automatically when all Personal Data has been
            deleted or returned in accordance with Section 8.
          </p>

          <h2>13. Governing law</h2>
          <p>
            This DPA is governed by the laws of England and Wales. Any
            dispute arising under this DPA shall be subject to the
            exclusive jurisdiction of the courts of England and Wales.
          </p>

          <h2>14. Contact</h2>
          <p>
            For any questions about this DPA, contact the Processor at{" "}
            <a href={`mailto:${site.contactEmail}`}>
              {site.contactEmail}
            </a>
            .
          </p>
          <div className="rounded-lg border border-navy-100 bg-cream-50 p-4 text-[0.95rem] not-prose">
            <p className="font-semibold text-navy-900">Processor details</p>
            <ul className="mt-2 space-y-1">
              <li>
                <strong>Legal entity:</strong> Pandemonium Software Ltd
              </li>
              <li>
                <strong>Companies House number:</strong>{" "}
                {site.legal.companyNumber}
              </li>
              <li>
                <strong>Registered office:</strong>{" "}
                {site.legal.registeredOfficeOneLine}
              </li>
              <li>
                <strong>Contact:</strong>{" "}
                <a href={`mailto:${site.contactEmail}`}>
                  {site.contactEmail}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
