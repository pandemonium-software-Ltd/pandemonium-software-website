import type { Metadata } from "next";
import Link from "next/link";
import PricingCalculator from "@/components/PricingCalculator";
import Faq from "@/components/Faq";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing — Transparent, flat-fee websites",
  description:
    "Simple flat pricing for Oxfordshire tradesmen websites. Pick what you need, see your total live, no surprises. From £150 setup and £25 per month.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — Pandemonium Software Ltd",
    description:
      "Simple flat pricing for Oxfordshire tradesmen websites. Pick what you need, see your total live, no surprises.",
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
          <PricingCalculator />

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
              <Link href="/intake" className="btn-primary justify-self-start md:justify-self-end">
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
                  q: "Who owns everything?",
                  a: (
                    <>
                      <p>
                        You do. Always. That means your domain name, your
                        written content, your photos, your Google Business
                        listing, and the website files themselves.
                      </p>
                      <p className="mt-3">
                        If you ever decide to leave us, we hand everything
                        over — no hostage fees, no silly handover charges, no
                        &quot;approval process&quot; nonsense.
                      </p>
                    </>
                  ),
                },
                {
                  q: "What if I need changes later?",
                  a: (
                    <p>
                      Minor content changes — new phone number, new photo,
                      updated prices, a fresh testimonial — we do within 48
                      hours and it&apos;s included in your monthly fee. Major
                      changes like new pages or a complete redesign we
                      quote separately and fairly.
                    </p>
                  ),
                },
                {
                  q: "Why a monthly fee? Can&apos;t I just pay once?",
                  a: (
                    <>
                      <p>
                        The monthly fee covers hosting, security updates,
                        software updates, backups, ongoing support, and
                        those little content changes we just mentioned. It&apos;s
                        what keeps the site running properly.
                      </p>
                      <p className="mt-3">
                        We&apos;d rather be honest about an ongoing cost
                        than pretend a website is a one-off purchase and then
                        nickel-and-dime you every time something breaks.
                      </p>
                    </>
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
                      something that fits your trade and your area — but
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
