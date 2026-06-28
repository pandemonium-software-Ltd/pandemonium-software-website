import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The simple working agreement between Pandemonium Software Ltd and my clients. Plain English, no legalese.",
  alternates: { canonical: "/terms" },
};

const lastUpdated = "28 May 2026";

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
            <strong>Pandemonium Software Ltd</strong>, a one-person
            business building websites for UK trades and small
            businesses, trading as ModuForge.
          </p>
          <div className="rounded-lg border border-navy-100 bg-cream-50 p-4 text-[0.95rem] not-prose">
            <p className="font-semibold text-navy-900">Trader details</p>
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
              <li>
                <strong>Trading name:</strong> ModuForge (
                <a href={site.url}>{site.url.replace("https://", "")}</a>)
              </li>
            </ul>
          </div>
          <p>
            In these terms, &quot;I&quot;, &quot;me&quot; and
            &quot;we&quot; means Pandemonium Software Ltd, and
            &quot;you&quot; means the business or person who hires me.
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

          <h2>4. Setup fee and your 14-day cancellation right</h2>
          <p>
            The £399 setup fee (or £199 for Founding Members) is payable
            up front, at the same time as your first monthly payment. It
            covers building your site — design, copy work, module setup,
            domain wiring, the lot.
          </p>

          <h3>14-day right to cancel (consumers)</h3>
          <p>
            Under the Consumer Contracts (Information, Cancellation and
            Additional Charges) Regulations 2013, if you are a{" "}
            <strong>consumer</strong> (buying for purposes outside your
            trade or profession) you have the right to cancel this
            contract within <strong>14 days of payment</strong> without
            giving any reason. If most of what you buy ModuForge for is
            running a business — even a sole trader business — these
            consumer-cancellation rights do not apply to you.
          </p>
          <p>
            To exercise your cancellation right, send a clear statement
            (email is fine — to{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            ) saying you want to cancel. You can also use the model
            cancellation form at the end of these terms (Schedule A).
            Any refund owed is processed within{" "}
            <strong>14 days of cancellation</strong>, back to the
            original payment method, at no cost to you.
          </p>

          <h3>Express request to begin work immediately</h3>
          <p>
            At payment, you will be asked to tick a box that says: &ldquo;I
            expressly request that Pandemonium Software Ltd begins work
            immediately, and I acknowledge that the setup fee becomes
            non-refundable as soon as development work has started.&rdquo;
          </p>
          <p>
            This express request is required because development work on
            your site (intake review, design choices, copy drafting,
            domain configuration) begins within minutes of payment. Once
            you have given this consent and{" "}
            <strong>development work has started</strong>, the setup fee
            is non-refundable under Regulation 36 of the CCRs (services
            performed at the customer&apos;s express request during the
            cancellation period). If you choose not to tick the box,
            work will not start until the 14-day cancellation period
            ends.
          </p>
          <p>
            &ldquo;Development work has started&rdquo; means I have
            opened your file and begun any of: reading your intake
            answers in detail, drafting site copy, configuring your
            domain or Cloudflare account, building site components, or
            preparing your preview. In practice this is within minutes
            of payment when you have ticked the box.
          </p>

          <h3>Changing modules during onboarding</h3>
          <p>
            You can change your module mix (Online Booking, Newsletter,
            Enquiry Form, Google Business Profile setup) once during
            onboarding via the &ldquo;Re-select modules&rdquo; button.
            After launch, you can add or remove any module any time from
            your customer dashboard&apos;s Modules or Billing section —
            no cap, no notice period. See section 5 below for the timing.
          </p>
          <p>
            If you remove a module you have already set up (e.g. you
            entered a Cal.com link then later removed Online Booking),
            we keep your data safely in case you ever re-add it. The
            module just disappears from your dashboard.
          </p>

          <h2>5. Monthly subscription, module changes and cancellation</h2>
          <p>
            The monthly fee starts on day one, alongside the setup fee.
            It covers hosting, software and security updates, backups,
            support channels, and the monthly change-request allowance.
            It bills monthly until you cancel.
          </p>

          <h3>Module add or remove (post-launch)</h3>
          <p>
            Adding or removing a module from your dashboard takes
            effect on your <strong>next billing date</strong> (always
            the 1st of the following month). No mid-month proration.
            For an add: the new module activates on the 1st, your next
            invoice includes the one-off setup for that module plus the
            new monthly rate. For a remove: you keep access until the
            1st (you have already paid for the month), then the monthly
            drops accordingly. No refund for the current month — you
            used the service.
          </p>

          <h3>Cancelling your whole subscription</h3>
          <p>
            You can cancel from the dashboard&apos;s Billing section any
            time. Two options:
          </p>
          <ul>
            <li>
              <strong>Cancel at end of month (free).</strong> Site stays
              live until the 1st of the following month. After that the
              site goes offline, billing stops, no refund — you keep
              what you have paid for through to the end of the month.
            </li>
            <li>
              <strong>Cancel now with prorated refund.</strong> Site
              goes offline today. You get a refund of the unused portion
              of <em>this month&apos;s monthly subscription</em>, based
              on days remaining. Refund processed within{" "}
              <strong>14 days of cancellation</strong>, back to the
              original payment method.
            </li>
          </ul>
          <p>
            <strong>The one-off setup fee is never refunded</strong>{" "}
            under either option (subject only to your 14-day consumer
            cancellation right above) — that paid for building the
            site, which has already been delivered.
          </p>
          <p>
            No notice period. No exit fees. No &ldquo;but wait&rdquo;
            calls. If you cannot get to your dashboard for any reason,
            email{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>{" "}
            and I will process it within one working day.
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

          <h2>6. Ownership</h2>
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

          <h2>7. No territorial exclusivity</h2>
          <p>
            I don&apos;t offer geographic or trade exclusivity. If I
            already work with a plumber in your town, I&apos;m free to
            take on another one. Every client&apos;s content, branding
            and marketing is their own and I never share information
            between clients.
          </p>

          <h2>8. Case study permission</h2>
          <p>
            I&apos;d love to show off a good result, so I may{" "}
            <strong>ask</strong> to feature your finished site on my own
            site as a case study. Permission is always requested and
            never mandatory. You can say no without any hard feelings or
            impact on your service.
          </p>

          <h2>9. Post-launch support</h2>
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

          <h2>10. What you agree to do</h2>
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

          <h2>11. Data protection and retention after cancellation</h2>
          <p>
            I handle your personal data under UK GDPR and the Data
            Protection Act 2018. While you are an active customer I
            hold whatever is needed to deliver the service: your
            contact details, business details, content you upload,
            subscriber lists (where applicable), and payment records.
            See the <a href="/privacy">privacy notice</a> for the full
            list and lawful bases, and
            the <a href="/dpa">Data Processing Agreement</a> for the
            formal processor terms under GDPR Article 28.
          </p>
          <p>
            <strong>When you cancel:</strong>
          </p>
          <ul>
            <li>
              <strong>Personal data is deleted 30 days after
              cancellation</strong>: your site content, brand assets,
              login credentials, subscriber list, dashboard analytics,
              and any third-party access I held on your behalf. The
              30-day window gives breathing room for &ldquo;I changed
              my mind&rdquo; calls and final-invoice handling.
            </li>
            <li>
              <strong>Financial records are retained for 7 years</strong>
              {" "}from the end of the tax year in which they arose.
              This is the minimum required by HMRC for VAT and Income
              Tax records (Companies Act 2006 s388, VATA 1994 Sch 11).
              These records hold the minimum needed for the legal
              obligation: your invoice amounts, payment dates, and
              business name. Photos, content, subscribers, dashboard
              data — all gone.
            </li>
            <li>
              <strong>Your right to early erasure</strong>: if you want
              your personal data deleted before the 30-day window
              expires (or, where lawful, ahead of the 7-year financial
              retention), email{" "}
              <a href={`mailto:${site.contactEmail}`}>
                {site.contactEmail}
              </a>{" "}
              and I will action it within 30 days of your request, as
              required by Article 17 UK GDPR.
            </li>
          </ul>
          <p>
            The 30-day personal-data deletion runs as an automated
            daily process — there is no possibility of me forgetting
            to do it. After deletion completes, an internal audit
            record is kept (anonymised — no personal data, just the
            timestamp + the customer reference) so we can prove the
            scrub happened if you ever ask.
          </p>

          <h2>12. Limits of my liability</h2>
          <p>
            I&apos;ll work carefully and do my best for you — but I
            can&apos;t guarantee specific business outcomes (how many
            customers your site brings in, your ranking on Google, and so
            on). Those depend on too many things outside my control.
          </p>

          <h3>Liability cap</h3>
          <p>
            My total aggregate liability to you for any and all claims
            arising under or in connection with these terms — whether in
            contract, tort (including negligence), breach of statutory
            duty, or otherwise — is limited to the total fees you have
            actually paid me in the <strong>12 months immediately
            before the event giving rise to the claim</strong>.
          </p>

          <h3>Indirect and consequential loss</h3>
          <p>
            I am not liable for any indirect, special or consequential
            loss or damage, including but not limited to: loss of
            profits, loss of revenue, loss of business, loss of
            anticipated savings, loss of goodwill, loss of data (except
            as covered by my data-protection obligations), or any third
            party claims against you — however caused, even if I was
            advised of the possibility.
          </p>

          <h3>Third-party services</h3>
          <p>
            Your site relies on third-party services that I configure
            but do not control — including Google (Maps, Business
            Profile, Search), Stripe (payments), Cloudflare (hosting),
            Resend (email), Cal.com (booking), and Anthropic (AI
            operations). I am not liable for any loss, downtime, data
            breach, or service interruption caused by those providers.
            I will use reasonable skill and care in configuring them
            and will assist you in resolving issues, but each provider
            is governed by its own terms of service and I cannot
            guarantee their availability or performance.
          </p>

          <h3>Force majeure</h3>
          <p>
            Neither party is liable for delays or failures caused by
            events beyond reasonable control — including natural
            disasters, pandemics, strikes, government actions, power
            failures, internet outages, cyber attacks, or acts of war.
            If a force majeure event continues for more than 30
            consecutive days, either party may terminate this agreement
            by giving written notice to the other.
          </p>

          <h3>What is never limited</h3>
          <p>
            Nothing in these terms excludes or limits liability for:
            fraud or fraudulent misrepresentation; death or personal
            injury caused by negligence; or any other liability that
            cannot be excluded or limited under the laws of England
            and Wales.
          </p>

          <h2>13. Governing law and dispute resolution</h2>
          <p>
            These terms are governed by the laws of England and Wales.
            Any disputes will be handled by the courts of England and
            Wales. Before going to court I would much rather talk it
            through — email{" "}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>{" "}
            and we will work it out.
          </p>
          <p>
            <strong>Alternative dispute resolution:</strong> I am not
            currently a member of an ADR scheme. If a dispute cannot
            be resolved between us, consumers can contact the{" "}
            <a
              href="https://www.citizensadvice.org.uk/consumer/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Citizens Advice consumer service
            </a>{" "}
            (0808 223 1133) or pursue a small-claims action in the
            County Court.
          </p>

          <h2>14. Changes to these terms</h2>
          <p>
            If I update these terms, I will let current clients know by
            email and update the &quot;Last updated&quot; date above.
            If a change materially affects you, you will have the
            chance to cancel before it takes effect.
          </p>

          <h2 id="schedule-a">Schedule A — Model cancellation form</h2>
          <p className="text-sm text-navy-600">
            Provided per CCRs 2013 Schedule 3. You do not have to use
            this form — any clear statement of cancellation works
            (email, dashboard click, letter). It is here for
            completeness so the right is fully accessible.
          </p>
          <div className="rounded-lg border border-navy-200 bg-cream-50 p-5 text-[0.95rem] not-prose font-mono">
            <p className="mb-3 font-semibold">
              To: Pandemonium Software Ltd, {site.contactEmail}<br />
              {site.legal.registeredOfficeOneLine}
            </p>
            <p className="mt-3">
              I/We [*] hereby give notice that I/We [*] cancel my/our [*]
              contract for the supply of the following service:
              ModuForge website build + monthly subscription
            </p>
            <p className="mt-3">
              Ordered on [*] / received on [*]: ____________________
            </p>
            <p className="mt-3">
              Name of consumer(s): ____________________
            </p>
            <p className="mt-3">
              Address of consumer(s): ____________________
            </p>
            <p className="mt-3">
              Signature of consumer(s) (only if this form is notified
              on paper): ____________________
            </p>
            <p className="mt-3">Date: ____________________</p>
            <p className="mt-3 text-xs italic">[*] Delete as appropriate.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
