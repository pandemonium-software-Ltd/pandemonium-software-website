import type { Metadata } from "next";
import Link from "next/link";
import PricingCalculator from "@/components/PricingCalculator";
import OptionalExtras from "@/components/OptionalExtras";
import FoundingMemberStrip from "@/components/FoundingMemberStrip";
import Faq from "@/components/Faq";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing — Flat-fee websites for UK trades and small businesses",
  description:
    "Simple flat pricing. Pick the modules you want, see your total and first-year cost live. From £129 setup and £19 per month. No surprises.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — Pandemonium Software Ltd",
    description:
      "Simple flat pricing. Pick the modules you want, see your total and first-year cost live. From £129 setup and £19 per month.",
    url: `${site.url}/pricing`,
  },
};

export default function PricingPage() {
  return (
    <>
      {/* Intro */}
      <section className="bg-cream-100/60 pb-16 pt-14 md:pb-20 md:pt-20">
        <div className="container-content max-w-4xl text-center">
          <span className="eyebrow">Pricing</span>
          <h1 className="heading-1">
            Clear prices. No surprises. Pick what you need.
          </h1>
          <p className="prose-body mx-auto mt-6 max-w-2xl">
            Every website starts with the same solid base. Tick the extras
            that make sense for your trade and watch your total update in real
            time. No contract, no lock-in, no sneaky renewals.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="pb-20 md:pb-28">
        <div className="container-content">
          <div className="mb-10">
            <FoundingMemberStrip />
          </div>

          <PricingCalculator />

          <OptionalExtras />

          <div className="mt-14 rounded-2xl bg-cream-100 p-8 md:p-10">
            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
                  Ready when you are.
                </h2>
                <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
                  Tell us a bit about your business and we&apos;ll be in
                  touch within one working day to set things up.
                </p>
              </div>
              <Link
                href={site.enquiryPath}
                className="btn-primary justify-self-start md:justify-self-end"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="section bg-white">
        <div className="container-content">
          <div className="mx-auto max-w-3xl text-center">
            <span className="eyebrow">Common questions</span>
            <h2 className="heading-2">The stuff people actually ask.</h2>
            <p className="prose-body mt-5">
              No corporate flannel. Straight answers, in plain English.
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-4xl">
            <Faq
              items={[
                {
                  q: "Why so cheap compared to a custom website?",
                  a: (
                    <>
                      <p>
                        Because we use a proven template and reuse what
                        works. Most small trade websites need the same
                        things — a mobile-friendly layout, your services,
                        your photos, a way to get in touch, and a proper
                        Google presence.
                      </p>
                      <p className="mt-3">
                        Building that from scratch every time would cost
                        you thousands. Starting from a solid base and
                        tailoring it to your business means we can charge a
                        flat fee and still do a proper job.
                      </p>
                    </>
                  ),
                },
                {
                  q: "Is there a contract?",
                  a: (
                    <p>
                      No contract, no minimum term. You&apos;re on a simple
                      monthly plan — cancel any time with 30 days&apos; notice
                      and you keep everything we built. We&apos;re not in the
                      business of trapping people.
                    </p>
                  ),
                },
                {
                  q: "I already have a website. Can I switch?",
                  a: (
                    <p>
                      Yes. We can migrate what&apos;s worth keeping or start
                      fresh — whichever gets you a better result. If
                      you&apos;re stuck with another provider, we&apos;ll help
                      you figure out what you need to do to move.
                    </p>
                  ),
                },
                {
                  q: "Who owns my website?",
                  a: (
                    <>
                      <p>
                        You do. Completely. Always. That means your domain
                        name, your written content, your photos, your Google
                        Business listing, your Cloudflare Pages hosting
                        account, and the website files themselves. Everything.
                      </p>
                      <p className="mt-3">
                        If you ever decide to leave us, we hand over any
                        credentials we were holding and the site carries on
                        running — no hostage fees, no silly handover charges.
                      </p>
                    </>
                  ),
                },
                {
                  q: "What if I need changes later?",
                  a: (
                    <p>
                      Your monthly fee includes 30 minutes of content changes
                      per month — a new phone number, a swapped photo, a
                      fresh testimonial, a price update. Bigger changes like
                      new pages or redesigns we quote separately and fairly
                      before any work starts.
                    </p>
                  ),
                },
                {
                  q: "What if I want to add a module later?",
                  a: (
                    <p>
                      Easy. Any module can be added at any time for the same
                      setup fee and monthly price shown on this page. Just
                      drop us an email — the new module is usually live
                      within a couple of working days.
                    </p>
                  ),
                },
                {
                  q: "Can I remove a module?",
                  a: (
                    <p>
                      Yes. You can cancel any individual module with 30
                      days&apos; notice and your monthly price drops
                      accordingly. You keep the rest of your site running as
                      normal.
                    </p>
                  ),
                },
                {
                  q: "Why a monthly fee?",
                  a: (
                    <>
                      <p>Your monthly fee covers:</p>
                      <ul className="mt-3 ml-5 list-disc space-y-1.5 text-[1.05rem]">
                        <li>Maintenance, security and dependency updates</li>
                        <li>A monthly performance report, in plain English</li>
                        <li>
                          30 minutes of content changes per month
                        </li>
                        <li>
                          Oversight of your hosting (which runs on your own
                          free Cloudflare Pages account)
                        </li>
                        <li>UK-based support from a real person</li>
                      </ul>
                      <p className="mt-4">
                        Anything bigger than a 30-minute content job — a new
                        page, a section redesign, a custom feature — we quote
                        for separately and fairly before any work starts.
                      </p>
                    </>
                  ),
                },
                {
                  q: "What about hosting costs?",
                  a: (
                    <>
                      <p>
                        None. Your website runs on Cloudflare Pages under
                        your own account, which is{" "}
                        <strong>free forever for business use</strong>. No
                        hidden hosting bills sneaking up on you in month six.
                      </p>
                      <p className="mt-3">
                        We set it up for you during the Onboarding Hub and
                        you keep the account. If you ever part ways with us,
                        your site carries on running exactly the same.
                      </p>
                    </>
                  ),
                },
                {
                  q: "What if I'm not in Oxfordshire?",
                  a: (
                    <p>
                      No problem. Oxfordshire is our home — it&apos;s where
                      we live, where our first clients are, and where our
                      local knowledge runs deep. But the work happens over
                      email, so where you&apos;re based in the UK makes no
                      practical difference. A plumber in Truro gets the same
                      site as a plumber in Thame.
                    </p>
                  ),
                },
                {
                  q: "Can I cancel anytime?",
                  a: (
                    <p>
                      Yes — 30 days&apos; written notice, by email, and
                      you&apos;re out. No exit fees, no &quot;but wait&quot;
                      calls. You keep your website, your domain, your
                      Cloudflare Pages account, and everything in them. We
                      hand over any credentials we were holding and part on
                      good terms.
                    </p>
                  ),
                },
                {
                  q: "Can I see an example?",
                  a: (
                    <p>
                      Of course. Have a look at our demo site built for a
                      fictional Oxfordshire garden company:{" "}
                      <a
                        href={site.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                      >
                        oxford-garden-co-demo.vercel.app
                      </a>
                      . Your site won&apos;t be a copy — we&apos;ll build
                      something that fits your business and your area — but
                      it&apos;ll be at the same level of quality.
                    </p>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </section>
    </>
  );
}
