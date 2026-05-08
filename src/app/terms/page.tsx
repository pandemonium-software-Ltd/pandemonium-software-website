import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The simple working agreement between Pandemonium Software Ltd and my clients. Plain English, no legalese.",
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
            These are simplified terms. I may update them from time to time,
            and I&apos;ll give current clients notice of any material
            changes by email. A full solicitor review is pending as the
            business grows. This page is accurate about what I will and
            won&apos;t do — it&apos;s just not a 40-page legal document.
          </p>
        </div>

        <div className="long-form mt-10">
          <h2>1. Who I am</h2>
          <p>
            I&apos;m Ben Pandher. I run{" "}
            <strong>Pandemonium Software Ltd</strong> ({site.location.city},{" "}
            {site.location.region}, United Kingdom), a one-person business
            building websites for UK trades and small businesses. In these
            terms, &quot;I&quot; and &quot;me&quot; means Ben Pandher
            trading as Pandemonium Software Ltd, and &quot;you&quot; means
            the business or person who hires me.
          </p>
          <p>
            You can reach me at{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </p>

          <h2>2. What I provide</h2>
          <p>
            I build a professional, mobile-first website for your business.
            The exact scope depends on which modules you&apos;ve picked on
            my pricing page — as a minimum, it always includes a
            mobile-optimised website hosted on your own free Cloudflare
            Pages account, ongoing security and dependency updates, a
            monthly performance report, 3 included change requests per
            month (one item per request — text edits, photo swaps,
            price updates, anything in scope), and UK-based support
            from a real person.
          </p>
          <p>
            I don&apos;t provide legal, tax, insurance or accounting
            advice, and I&apos;m not a marketing agency. If you need any
            of those, I can point you towards someone I trust.
          </p>

          <h2>3. Build time (the two-week SLA)</h2>
          <p>
            My standard build time is <strong>two working weeks</strong>.
            The clock starts the day you{" "}
            <strong>complete the Onboarding Hub</strong> — not the day you
            pay. This is a deliberate choice: the Hub captures everything I
            need to build a proper site (logo, photos, colours, services,
            business details, your hosting account) so I never have to
            chase you once the clock is running.
          </p>
          <p>
            If I&apos;m waiting on you during the Hub, the clock
            doesn&apos;t start. That&apos;s fair to both sides — I
            can&apos;t build a page without knowing what goes on it, and
            you shouldn&apos;t be rushed.
          </p>

          <h2>4. Setup fees</h2>
          <p>
            The £129 setup fee (or £99 for Founding Members) is payable up
            front, at the same time as your first monthly payment, and is{" "}
            <strong>non-refundable after 48 hours</strong>. That gives you
            a cooling-off period to change your mind with no questions
            asked.
          </p>
          <p>
            After 48 hours, I will have started working on your project
            and the fee covers that work. If you&apos;ve changed your mind
            after that, let me know — I&apos;m a reasonable human and
            I&apos;ll try to find a fair outcome.
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
            You can cancel any time with{" "}
            <strong>30 days&apos; written notice</strong> (email is fine —
            just send it to{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>).
            The final 30 days of service complete normally; my last
            invoice covers that period.
          </p>

          <h3>What happens to your site</h3>
          <p>
            Your site keeps running. It&apos;s hosted on your own
            Cloudflare Pages account — free forever — so there&apos;s no
            bill that picks up when I leave. Your domain, your subscriber
            list, your booking page, your Google Business Profile and all
            your content stay yours.
          </p>

          <h3>What I hand over (within 14 days of your final billing date)</h3>
          <ul>
            <li>
              A complete copy of your website source code, as a
              downloadable zip and (if you&apos;d like) a private GitHub
              repository transferred to your account.
            </li>
            <li>
              A list of every credential I was holding on your behalf,
              with my access already revoked from each — Cloudflare team
              membership, Resend team membership, Google Business Profile
              manager access, Cal.com (where applicable) and any other
              account I was a member of.
            </li>
            <li>
              An exit summary in plain English: what runs where, what to
              watch out for, and the kind of thing you&apos;d want to ask
              your next maintainer about.
            </li>
          </ul>

          <h3>What you stop receiving</h3>
          <p>Once your subscription ends, I no longer:</p>
          <ul>
            <li>
              Apply security patches, dependency updates or browser
              compatibility fixes to your site.
            </li>
            <li>
              Make content changes, generate the monthly performance
              report or provide direct support.
            </li>
            <li>
              Maintain oversight of your hosting, sender domain or any of
              the connected services on your behalf.
            </li>
          </ul>
          <p>
            Practically, your site will slowly drift over time —
            typically 12 to 24 months before you&apos;d notice anything.
            It won&apos;t suddenly break, but it also won&apos;t stay
            current with the web around it. If you want to come back
            later, re-onboarding is the standard setup fee and we pick up
            where we left off.
          </p>

          <h3>If your subscription lapses involuntarily</h3>
          <p>
            If a subscription payment fails, I&apos;ll email you and try
            again over a few days. After three failed attempts, services
            pause (your site keeps serving, but I stop active
            maintenance) until payment is back in good standing. No
            hostile takeover, no lockout — just a pause until you&apos;re
            ready to continue or formally cancel.
          </p>

          <h2>7. Ownership</h2>
          <p>
            <strong>You own your website content, your domain, your
            hosting account, and all connected service accounts</strong>,
            full stop. That includes the website files, the text, photos,
            logo files, Google Business listing, your Cloudflare Pages
            hosting account, and any other accounts I set up in your
            name.
          </p>
          <p>
            I may retain rights to any behind-the-scenes tooling,
            deployment scripts or shared components I&apos;ve built across
            multiple client sites — but nothing that would stop you
            running, hosting or modifying your site elsewhere.
          </p>

          <h2>8. No territorial exclusivity</h2>
          <p>
            I don&apos;t offer geographic or trade exclusivity. If I
            already work with a plumber in your town, I&apos;m free to
            take on another one. Every client&apos;s content, branding
            and marketing is their own and I never share information
            between clients.
          </p>

          <h2>9. Case study permission</h2>
          <p>
            I&apos;d love to show off a good result, so I may{" "}
            <strong>ask</strong> to feature your finished site on my own
            site as a case study. Permission is always requested and
            never mandatory. You can say no without any hard feelings or
            impact on your service.
          </p>

          <h2>10. Post-launch support</h2>
          <p>After your site is live:</p>
          <ul>
            <li>
              <strong>Minor changes</strong> (updating a phone number,
              swapping a photo, tweaking prices, adding a testimonial) I do
              within <strong>48 hours</strong>, included in your monthly
              fee.
            </li>
            <li>
              <strong>Major changes</strong> (new pages, new sections,
              complete redesigns, custom features) I quote for separately
              and fairly before any work starts.
            </li>
            <li>
              <strong>Emergencies</strong> (the site is down or broken) I
              aim to respond to within a few hours during working days. I
              keep backups so in the very worst case I can restore quickly.
            </li>
          </ul>

          <h2>11. What you agree to do</h2>
          <ul>
            <li>Give me accurate information about your business.</li>
            <li>
              Only send me photos and content you have the right to use.
            </li>
            <li>
              Not use the website for anything illegal, misleading or
              harmful.
            </li>
            <li>Pay your monthly fee on time.</li>
          </ul>
          <p>
            If any of those go sideways, I&apos;ll talk to you first
            before taking anything down.
          </p>

          <h2>12. Limits of my liability</h2>
          <p>
            I&apos;ll work carefully and do my best for you — but I
            can&apos;t guarantee specific business outcomes (how many
            customers your site brings in, your ranking on Google, and so
            on). Those depend on too many things outside my control.
          </p>
          <p>
            My total liability to you for any claim is limited to the
            fees you&apos;ve paid me in the 12 months before the claim. I
            can&apos;t be liable for indirect losses (like lost profits or
            missed opportunities). Nothing in these terms limits anything
            that can&apos;t legally be limited — such as liability for
            fraud or death caused by negligence.
          </p>

          <h2>13. Governing law</h2>
          <p>
            These terms are governed by the laws of England and Wales. Any
            disputes will be handled by the courts of England and Wales.
          </p>

          <h2>14. Changes to these terms</h2>
          <p>
            If I update these terms, I&apos;ll let current clients know
            by email and update the &quot;Last updated&quot; date above. If
            a change materially affects you, you&apos;ll have the chance to
            cancel before it takes effect.
          </p>
        </div>
      </div>
    </section>
  );
}
