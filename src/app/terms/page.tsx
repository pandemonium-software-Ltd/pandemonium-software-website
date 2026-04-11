import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The simple working agreement between Pandemonium Software Ltd and our clients. Plain English, no legalese.",
  alternates: { canonical: "/terms" },
};

const lastUpdated = "11 April 2026";

export default function TermsPage() {
  return (
    <section className="section bg-white">
      <div className="container-content max-w-3xl">
        <span className="eyebrow">Legal</span>
        <h1 className="heading-1">Terms of service</h1>
        <p className="mt-4 text-sm text-navy-600">Last updated: {lastUpdated}</p>

        <div className="mt-10 rounded-2xl border-l-4 border-ember-500 bg-ember-50 p-6 text-[1.05rem] text-navy-800">
          <p className="font-semibold text-navy-900">Plain language, on purpose.</p>
          <p className="mt-2">
            This is a simplified working agreement covering how we do
            business together. Before we take on a formal paid client, we
            may ask our solicitor to review a fuller version of these terms.
            This page is accurate about what we will and won&apos;t do —
            it&apos;s just not a 40-page legal document.
          </p>
        </div>

        <div className="long-form mt-10">
          <h2>1. Who we are</h2>
          <p>
            <strong>Pandemonium Software Ltd</strong> ({site.location.city},{" "}
            {site.location.region}, United Kingdom) builds websites for UK
            trades and small businesses. In these terms, &quot;we&quot; and
            {" "}&quot;us&quot; means Pandemonium Software Ltd, and
            {" "}&quot;you&quot; means the business or person who hires us.
          </p>
          <p>
            You can reach us at{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </p>

          <h2>2. What we provide</h2>
          <p>
            We build a website for your business. The exact scope depends
            on which modules you&apos;ve picked on our pricing page — as a
            minimum, it always includes a five-page mobile-friendly website
            (Home, Services, Gallery, About, Contact), hosting on your own
            account, a proper domain setup, a GDPR-compliant privacy policy
            generated from your details, and ongoing support for minor
            content updates (up to 30 minutes per month).
          </p>
          <p>
            We don&apos;t provide legal, tax, insurance or accounting
            advice, and we aren&apos;t a marketing agency. If you need any of
            those, we can point you towards someone we trust.
          </p>

          <h2>3. Build time (our two-week SLA)</h2>
          <p>
            Our standard build time is <strong>two working weeks</strong>.
            The clock starts on the day you&apos;ve given us everything we
            need — your business details, photos, logos, content and any
            accounts we need access to. We call that &quot;complete asset
            delivery&quot;.
          </p>
          <p>
            If we&apos;re waiting on you for information, the clock pauses.
            That&apos;s fair to both sides — we can&apos;t build a page
            without knowing what goes on it.
          </p>

          <h2>4. Setup fees</h2>
          <p>
            The setup fee is payable up front, at the same time as your
            first monthly payment, and is{" "}
            <strong>non-refundable after 48 hours</strong>. That gives you a
            cooling-off period to change your mind with no questions asked.
          </p>
          <p>
            After 48 hours, we will have started working on your project
            and the fee covers that work. If you&apos;ve changed your mind
            after that, let us know — we&apos;re reasonable humans and
            we&apos;ll try to find a fair outcome.
          </p>

          <h2>5. Monthly subscription</h2>
          <p>
            The monthly fee starts on day one, alongside the setup fee. It
            covers hosting, software and security updates, backups, support
            channels, and minor content changes described below. It bills
            monthly until you cancel.
          </p>

          <h2>6. Cancellation (30 days&apos; notice)</h2>
          <p>
            You can cancel any time with <strong>30 days&apos; written
            notice</strong> (email is fine — just send it to{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>).
          </p>
          <p>
            When you cancel, you pay for the final 30 days and then we
            hand everything over — your domain, your content, your website
            files. No handover fees. No hostage-taking. You own it all.
          </p>

          <h2>7. Ownership</h2>
          <p>
            <strong>You own your content, your domain and your
            accounts</strong>, full stop. That includes the text, photos,
            logo files, Google Business listing and any accounts we set up in
            your name.
          </p>
          <p>
            You also own the website files themselves once built. We may
            retain rights to any behind-the-scenes tooling, deployment
            scripts or shared components we&apos;ve built across multiple
            client sites — but nothing that would stop you running, hosting
            or modifying your site elsewhere.
          </p>

          <h2>8. Case study permission</h2>
          <p>
            We&apos;d love to show off a good result, so we may{" "}
            <strong>ask</strong> to feature your finished site on our own
            site as a case study. We will always ask first, and you can say
            no without any hard feelings or impact on your service.
          </p>

          <h2>9. Post-launch support</h2>
          <p>After your site is live:</p>
          <ul>
            <li>
              <strong>Minor changes</strong> (updating a phone number,
              swapping a photo, tweaking prices, adding a testimonial) we do
              within <strong>48 hours</strong>, included in your monthly
              fee.
            </li>
            <li>
              <strong>Major changes</strong> (new pages, new sections,
              complete redesigns, custom features) we quote for separately
              and fairly before any work starts.
            </li>
            <li>
              <strong>Emergencies</strong> (the site is down or broken) we
              aim to respond to within a few hours during working days. We
              keep backups so in the very worst case we can restore quickly.
            </li>
          </ul>

          <h2>10. What you agree to do</h2>
          <ul>
            <li>Give us accurate information about your business.</li>
            <li>
              Only send us photos and content you have the right to use.
            </li>
            <li>
              Not use the website for anything illegal, misleading or
              harmful.
            </li>
            <li>Pay your monthly fee on time.</li>
          </ul>
          <p>
            If any of those go sideways, we&apos;ll talk to you first
            before taking anything down.
          </p>

          <h2>11. Limits of our liability</h2>
          <p>
            We&apos;ll work carefully and do our best for you — but we
            can&apos;t guarantee specific business outcomes (how many
            customers your site brings in, your ranking on Google, and so
            on). Those depend on too many things outside our control.
          </p>
          <p>
            Our total liability to you for any claim is limited to the
            fees you&apos;ve paid us in the 12 months before the claim. We
            can&apos;t be liable for indirect losses (like lost profits or
            missed opportunities). Nothing in these terms limits anything
            that can&apos;t legally be limited — such as liability for
            fraud or death caused by negligence.
          </p>

          <h2>12. Governing law</h2>
          <p>
            These terms are governed by the laws of England and Wales. Any
            disputes will be handled by the courts of England and Wales.
          </p>

          <h2>13. Changes to these terms</h2>
          <p>
            If we update these terms, we&apos;ll let current clients know
            by email and update the &quot;Last updated&quot; date above. If
            a change materially affects you, you&apos;ll have the chance to
            cancel before it takes effect.
          </p>
        </div>
      </div>
    </section>
  );
}
