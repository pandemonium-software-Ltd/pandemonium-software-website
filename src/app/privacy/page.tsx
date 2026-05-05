import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Pandemonium Software Ltd collects, uses and protects your data. Written in plain English.",
  alternates: { canonical: "/privacy" },
};

const lastUpdated = "11 April 2026";

export default function PrivacyPage() {
  return (
    <section className="section bg-white">
      <div className="container-content max-w-3xl">
        <span className="eyebrow">Legal</span>
        <h1 className="heading-1">Privacy policy</h1>
        <p className="mt-4 text-sm text-navy-600">Last updated: {lastUpdated}</p>

        <div className="long-form mt-10">
          <p>
            This is the privacy policy for <strong>Pandemonium Software Ltd</strong>
            — the company behind this website. It explains what personal
            information we collect from visitors to{" "}
            <strong>pandemonium-software-website.benpandher.workers.dev</strong>,
            why we collect it, and what your rights are.
          </p>
          <p>
            We&apos;ve written this in plain English on purpose. If anything
            isn&apos;t clear, email us at{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> and
            we&apos;ll explain.
          </p>

          <h2>1. Who we are</h2>
          <p>
            Pandemonium Software Ltd is a small software business based in
            Oxfordshire, United Kingdom. We build websites for UK trades
            and small businesses. For the purposes of UK GDPR and the Data
            Protection Act 2018, we are the <strong>data controller</strong>
            {" "}for any personal information you give us through this
            website.
          </p>
          <p>
            You can reach our data contact at{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </p>

          <h2>2. What we collect, and why</h2>
          <p>We keep this short on purpose. We only collect what we need.</p>

          <h3>Things you send us directly</h3>
          <ul>
            <li>
              <strong>Enquiry details:</strong> if you email us directly or
              use the enquiry form on our enquiry page, we&apos;ll see your
              name, email address, phone, business details, UK location and
              current website situation. When you submit the enquiry form,
              these details are saved to our private Notion workspace (a
              project-management tool) and we get a notification email so
              we can reply. We don&apos;t share these details with anyone
              else, and we delete them after 24 months if you don&apos;t
              become a client (see Section 5).
            </li>
            <li>
              <strong>Qualification and intake form data (for accepted
              clients):</strong> once you decide to work with us,
              we&apos;ll collect more detailed information through follow-up
              forms — business legal details, services, brand colours,
              logo, photos, module selections. This is held in the same
              private Notion workspace only for as long as we&apos;re
              building your site, and is transferred to your own accounts at
              handover.
            </li>
            <li>
              <strong>Payment details:</strong> if you become a paying
              client, Stripe will handle your card details directly — we
              never see or store them. We do see your business name, invoice
              amounts, and payment status.
            </li>
          </ul>

          <h3>Things your browser tells us</h3>
          <ul>
            <li>
              <strong>Basic hosting logs:</strong> our host (Cloudflare)
              records things like IP address, browser type and the page you
              visited. This is standard for any website and is used for
              security and keeping the site running.
            </li>
            <li>
              <strong>Cookies:</strong> this site uses only strictly
              necessary cookies. We don&apos;t use tracking or advertising
              cookies. If we ever add analytics, we&apos;ll use a
              privacy-friendly tool and update this policy first.
            </li>
          </ul>

          <h2>3. Why we collect it (legal basis)</h2>
          <p>Under UK GDPR, we have to tell you our legal reason for holding your data:</p>
          <ul>
            <li>
              <strong>Legitimate interest:</strong> responding to enquiries
              and answering questions you send us. You&apos;d expect us to
              reply, so it&apos;s a reasonable interest.
            </li>
            <li>
              <strong>Contract:</strong> if you become a paying client, we
              process your data to deliver the service you&apos;ve paid for.
            </li>
            <li>
              <strong>Legal obligation:</strong> we&apos;re required to keep
              some business and tax records under UK law.
            </li>
          </ul>

          <h2>4. Who we share it with (sub-processors)</h2>
          <p>
            We use a small number of trusted third parties to run the
            business. We only share what they need to do their job:
          </p>
          <ul>
            <li>
              <strong>Cloudflare, Inc.</strong> — hosts this website as a
              Cloudflare Worker serving static assets, and keeps basic edge
              logs for security and anti-abuse purposes.
            </li>
            <li>
              <strong>Resend</strong> — sends transactional emails (for
              example, a reply confirmation). Only used if you become a
              client.
            </li>
            <li>
              <strong>Stripe</strong> — handles card payments for paid
              services. Stripe is PCI-DSS certified and we never see your card
              details.
            </li>
            <li>
              <strong>Notion</strong> — where we keep notes on client
              projects we&apos;re working on.
            </li>
          </ul>
          <p>
            We don&apos;t sell your data. We don&apos;t rent it. We
            don&apos;t swap it with anyone for marketing. Ever.
          </p>

          <h2>5. How long we keep it</h2>
          <ul>
            <li>
              <strong>Enquiries that don&apos;t become projects:</strong> we
              delete them 24 months after our last contact with you.
            </li>
            <li>
              <strong>Client records:</strong> we keep them for as long as
              you&apos;re a client, plus six years after the relationship
              ends (to meet UK tax and accounting rules).
            </li>
            <li>
              <strong>Hosting logs:</strong> typically kept for up to 30
              days by Cloudflare.
            </li>
          </ul>

          <h2>6. Your rights under UK GDPR</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Ask us what personal data we hold about you.</li>
            <li>Ask us to correct something that&apos;s wrong.</li>
            <li>
              Ask us to delete your data (where we&apos;re not legally
              required to keep it).
            </li>
            <li>Ask us to stop using it for a particular purpose.</li>
            <li>Withdraw consent at any time, if consent is the basis.</li>
            <li>Receive your data in a portable format.</li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>{" "}
            and tell us which one. We&apos;ll reply within 30 days.
          </p>

          <h2>7. Complaints</h2>
          <p>
            If you think we&apos;ve mishandled your data, we&apos;d like to
            hear about it first so we can put it right. But you also have
            the right to complain to the Information Commissioner&apos;s
            Office (ICO):
          </p>
          <ul>
            <li>
              Website:{" "}
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
              >
                ico.org.uk
              </a>
            </li>
            <li>Phone: 0303 123 1113</li>
          </ul>

          <h2>8. Changes to this policy</h2>
          <p>
            We may update this policy from time to time — for example, if
            we change sub-processors or add a new service. If the change is
            significant, we&apos;ll put a notice on the website. The
            &quot;Last updated&quot; date at the top will always tell you when
            the policy last changed.
          </p>

          <h2>9. Contact us</h2>
          <p>
            For any privacy-related question, email{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
            A proper business email address is on the way.
          </p>
        </div>
      </div>
    </section>
  );
}
