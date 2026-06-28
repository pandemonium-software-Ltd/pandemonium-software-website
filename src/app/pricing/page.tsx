import type { Metadata } from "next";
import Link from "next/link";
import PricingCalculator from "@/components/PricingCalculator";
import FoundingMemberStrip from "@/components/FoundingMemberStrip";
import Faq from "@/components/Faq";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing — Flat-fee websites for UK trades and small businesses",
  description:
    "Simple flat pricing. Pick the modules you want, see your total and first-year cost live. From £399 setup and £45 per month. No surprises.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — ModuForge",
    description:
      "Simple flat pricing. Pick the modules you want, see your total and first-year cost live. From £399 setup and £45 per month.",
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

          {/* Premium tier — coming soon (anchor; not yet purchasable) */}
          <div className="mt-12 overflow-hidden rounded-2xl border-2 border-navy-900 bg-navy-900 p-8 text-white md:p-10">
            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-serif text-2xl font-semibold md:text-3xl">
                    Premium — Done-for-you
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-ember-500 px-3 py-0.5 text-sm font-semibold text-white">
                    Coming soon
                  </span>
                </div>
                <p className="mt-3 text-[1.05rem] leading-relaxed text-cream-100/90">
                  Hands-off. I run the lot for you — managed hosting and domain
                  on your behalf, premium designs, your newsletter written and
                  sent, monthly review campaigns, a higher change allowance and
                  priority turnaround.
                </p>
              </div>
              <div className="md:text-right">
                <p className="font-serif text-3xl font-semibold">£149<span className="text-lg font-normal text-cream-100/70">/mo</span></p>
                <p className="mt-1 text-sm text-cream-100/70">+ setup · launching soon</p>
              </div>
            </div>
          </div>

          <div className="mt-14 rounded-2xl bg-cream-100 p-8 md:p-10">
            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
                  Ready when you are.
                </h2>
                <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
                  Tell me a bit about your business and you&apos;ll have a
                  reply within 4 working hours (drafted by AI against my
                  playbook, reviewed and sent by me).
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
                        Because I use a proven template and reuse what
                        works. Most small trade websites need the same
                        things — a mobile-friendly layout, your services,
                        your photos, a way to get in touch, and a proper
                        Google presence.
                      </p>
                      <p className="mt-3">
                        Building that from scratch every time would cost
                        you thousands. Starting from a solid base and
                        tailoring it to your business means I can charge a
                        flat fee and still do a proper job.
                      </p>
                    </>
                  ),
                },
                {
                  q: "Is there a contract?",
                  a: (
                    <p>
                      No contract, no minimum term, no notice period.
                      You&apos;re on a simple monthly plan — cancel any
                      time from your dashboard. Choose either &ldquo;at
                      end of month&rdquo; (free, keep access till the
                      1st) or &ldquo;cancel now with prorated
                      refund&rdquo; (offline today, refund of unused
                      monthly subscription). You keep everything I
                      built either way. I&apos;m not in the business of
                      trapping people.
                    </p>
                  ),
                },
                {
                  q: "I already have a website. Can I switch?",
                  a: (
                    <p>
                      Yes. I can migrate what&apos;s worth keeping or start
                      fresh — whichever gets you a better result. If
                      you&apos;re stuck with another provider, I&apos;ll help
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
                        If you ever decide to leave, I hand over any
                        credentials I was holding and the site carries on
                        running — no hostage fees, no silly handover charges.
                      </p>
                    </>
                  ),
                },
                {
                  q: "What if I need changes later?",
                  a: (
                    <p>
                      Your monthly fee includes 2 change requests per
                      month — a new phone number, a swapped photo, a
                      fresh testimonial, a price update. You can bundle
                      a few related tweaks into one request (Cowork will
                      apply them together). Bigger changes like new
                      pages or redesigns I quote separately and fairly
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
                      drop me an email — the new module is usually live
                      within a couple of working days.
                    </p>
                  ),
                },
                {
                  q: "Can I remove a module?",
                  a: (
                    <p>
                      Yes. Open your dashboard, hit Remove on the
                      module. The change takes effect on your next
                      billing date (1st of the following month) — you
                      keep using it until then since you&apos;ve
                      already paid for the month, then your monthly
                      price drops accordingly. The rest of your site
                      carries on as normal.
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
                          3 included change requests per month (one
                          item per request)
                        </li>
                        <li>
                          Oversight of your hosting (which runs on your own
                          free Cloudflare Pages account)
                        </li>
                        <li>UK-based support from a real person</li>
                      </ul>
                      <p className="mt-4">
                        Anything beyond your 2 monthly changes, or
                        bigger than a tweak — a new page, a section
                        redesign, a custom feature — I quote for
                        separately and fairly before any work starts.
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
                        I set it up for you during the Onboarding Hub and
                        you keep the account. If you ever part ways, your
                        site carries on running exactly the same.
                      </p>
                    </>
                  ),
                },
                {
                  q: "What if I'm not in Oxfordshire?",
                  a: (
                    <p>
                      No problem. Oxfordshire is my home — it&apos;s where
                      I live, where my first clients are, and where my local
                      knowledge runs deep. But the work happens over email,
                      so where you&apos;re based in the UK makes no
                      practical difference. A plumber in Truro gets the same
                      site as a plumber in Thame.
                    </p>
                  ),
                },
                {
                  q: "Can I cancel anytime?",
                  a: (
                    <>
                      <p>
                        Yes — cancel from your dashboard&apos;s Billing
                        section any time. No notice period, no exit fees,
                        no &quot;but wait&quot; calls. Two options:
                        cancel at end of month (free, keep access until
                        the 1st) or cancel now with a prorated refund
                        of this month&apos;s monthly subscription. The
                        one-off setup fee isn&apos;t refunded either
                        way — that covered building the site, which
                        has already been delivered.
                      </p>
                      <p className="mt-3">
                        <strong>What you keep:</strong> your website (still
                        hosted free on your own Cloudflare account), your
                        domain, your subscriber list (one-click CSV
                        export), your Cal.com booking page, your Google
                        Business Profile, every photo and every word. I
                        hand over any credentials I was holding and the
                        site carries on serving customers exactly as it
                        does today.
                      </p>
                      <p className="mt-3">
                        <strong>What you stop getting:</strong> my ongoing
                        maintenance — security patches, dependency
                        updates, browser-compatibility fixes, the 30
                        minutes of monthly content changes, the
                        performance report, and direct support. Without
                        those, your site runs fine but slowly drifts as
                        the web around it evolves — typically 12 to 24
                        months before you&apos;d notice anything.
                        Nothing breaks suddenly; things just stop staying
                        current.
                      </p>
                      <p className="mt-3">
                        Coming back later is straightforward — re-onboarding
                        at the standard setup fee. No hard feelings either
                        way.
                      </p>
                    </>
                  ),
                },
                {
                  q: "Can I see an example?",
                  a: (
                    <p>
                      Of course. Have a look at my demo site built for a
                      fictional Oxfordshire garden company:{" "}
                      <a
                        href={site.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                      >
                        oxford-garden-co-demo.vercel.app
                      </a>
                      . Your site won&apos;t be a copy — I&apos;ll build
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
