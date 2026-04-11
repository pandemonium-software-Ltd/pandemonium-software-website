import Link from "next/link";
import HeroIllustration from "@/components/HeroIllustration";
import { site } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream-50 pb-20 pt-14 md:pb-28 md:pt-20">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-cream-100 via-cream-50 to-cream-50"
        />
        <div className="container-content grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <span className="eyebrow">Websites for Oxfordshire tradesmen</span>
            <h1 className="heading-1">
              Professional websites for Oxfordshire tradesmen. No hassle, no
              tech headaches, just a site that brings in work.
            </h1>
            <p className="prose-body mt-6 max-w-[42rem]">
              We build a smart, mobile-friendly website for your trade
              business in two weeks. You get a proper online home, a clear
              way for customers to find you, and you keep ownership of
              everything — forever. No lock-in, no lead fees, no jargon.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/pricing" className="btn-primary">
                See what&apos;s included
              </Link>
              <Link href={site.contactPath} className="btn-secondary">
                Contact us now
              </Link>
            </div>
            <p className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-navy-600">
              <span className="inline-flex items-center gap-2">
                <DotIcon /> Built in two weeks
              </span>
              <span className="inline-flex items-center gap-2">
                <DotIcon /> You own everything
              </span>
              <span className="inline-flex items-center gap-2">
                <DotIcon /> No long contracts
              </span>
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-[560px]">
            <HeroIllustration className="h-auto w-full" />
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="section bg-white">
        <div className="container-content">
          <div className="mx-auto max-w-3xl text-center">
            <span className="eyebrow">What you get</span>
            <h2 className="heading-2">
              Everything a busy tradesman needs. Nothing a busy tradesman
              doesn&apos;t.
            </h2>
            <p className="prose-body mt-5">
              A proper website is more than a few pages and a phone number.
              Here&apos;s what&apos;s in every site we build.
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<PhoneIcon />}
              title="A site that works on a phone"
              body="Nine out of ten of your customers will find you on their phone. Your site will look sharp, load fast, and let people call or email you in one tap."
            />
            <FeatureCard
              icon={<MapIcon />}
              title="Local Google presence"
              body="We set things up so locals searching for a plumber, electrician or builder in your patch can actually find you. Real SEO basics, no tricks."
            />
            <FeatureCard
              icon={<KeyIcon />}
              title="You own it — forever"
              body="Your domain, your content, your website files. If you ever want to move, you take it all with you. No hostage-taking, no silly fees."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section bg-cream-100/60">
        <div className="container-content">
          <div className="mx-auto max-w-3xl text-center">
            <span className="eyebrow">How it works</span>
            <h2 className="heading-2">Four simple steps. Two weeks. Done.</h2>
            <p className="prose-body mt-5">
              No endless meetings, no 40-page briefs, no chasing. We keep it
              straightforward so you can get on with your job.
            </p>
          </div>

          <ol className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StepCard
              number="1"
              title="Tell us about your business"
              body="A quick chat — in person, over the phone, or on a call. You tell us what you do and who you want to reach."
            />
            <StepCard
              number="2"
              title="We build it in two weeks"
              body="From the day we have your photos and details, we have your site ready for review within two working weeks."
            />
            <StepCard
              number="3"
              title="We hand it over"
              body="We set up your domain, show you round the site, and make sure everything works on your phone and your mate's phone."
            />
            <StepCard
              number="4"
              title="You own everything forever"
              body="Your site, your content, your Google listing. Cancel any time with 30 days' notice and you still keep it all."
            />
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section className="section bg-white">
        <div className="container-content">
          <div className="grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <span className="eyebrow">Why work with us</span>
              <h2 className="heading-2">
                Small, local and honest — on purpose.
              </h2>
              <p className="prose-body mt-5">
                We&apos;re a small, focused business building websites for
                Oxfordshire trades. Not a big agency, not a call-centre, not a
                website builder pretending to be a service. Just one person who
                knows how to build good websites and a handful of trusted
                tradesmen clients.
              </p>
              <ul className="mt-8 space-y-4 text-lg text-navy-800">
                <TrustItem>
                  <strong>Oxfordshire only.</strong> We focus on the patch we
                  know best, so your site speaks to the right people.
                </TrustItem>
                <TrustItem>
                  <strong>Family-run feel.</strong> You talk to the person
                  building your site, not a sales rep passing you around.
                </TrustItem>
                <TrustItem>
                  <strong>You own everything.</strong> No hostage hosting, no
                  hidden handover fees. Ever.
                </TrustItem>
                <TrustItem>
                  <strong>No lead fees.</strong> Unlike Checkatrade or
                  MyBuilder, we don&apos;t take a cut of your work. You pay a
                  fair flat fee. That&apos;s it.
                </TrustItem>
              </ul>
            </div>

            <div className="card relative overflow-hidden bg-navy-950 text-white ring-0">
              <div
                aria-hidden="true"
                className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-ember-500/20 blur-3xl"
              />
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ember-300">
                A word from a happy tradesman
              </p>
              <blockquote className="mt-6 font-serif text-2xl leading-snug text-cream-50 md:text-[1.7rem]">
                <span className="text-ember-400">&ldquo;</span>
                A placeholder for the first testimonial we&apos;ll
                proudly add here — from the first real Oxfordshire tradesman
                whose site we launch.
                <span className="text-ember-400">&rdquo;</span>
              </blockquote>
              <div className="mt-8 flex items-center gap-4">
                <div
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-ember-500/90 font-semibold text-white"
                >
                  ?
                </div>
                <div>
                  <p className="font-semibold text-white">Your name here</p>
                  <p className="text-sm text-cream-300/80">
                    Oxfordshire tradesman
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="relative isolate overflow-hidden bg-navy-900 py-20 text-white md:py-24">
        <div
          aria-hidden="true"
          className="absolute -left-24 top-1/2 -z-10 h-80 w-80 -translate-y-1/2 rounded-full bg-ember-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 top-1/2 -z-10 h-80 w-80 -translate-y-1/2 rounded-full bg-navy-700/50 blur-3xl"
        />
        <div className="container-content text-center">
          <h2 className="heading-2 text-white">
            Ready for a website that earns its keep?
          </h2>
          <p className="prose-body mx-auto mt-5 max-w-2xl text-cream-100">
            Have a look at what&apos;s included and what it costs. No pushy
            salespeople, no endless quotes — just clear pricing on one page.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/pricing" className="btn-primary">
              See what&apos;s included
            </Link>
            <Link
              href={site.contactPath}
              className="btn inline-flex border-2 border-white/70 bg-transparent text-white hover:bg-white hover:text-navy-900 focus-visible:ring-white/40"
            >
              Contact us now
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-ember-50 text-ember-600">
        {icon}
      </div>
      <h3 className="heading-4">{title}</h3>
      <p className="mt-3 text-base leading-relaxed text-navy-700">{body}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <li className="card relative">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 font-serif text-lg font-semibold text-ember-300">
        {number}
      </div>
      <h3 className="font-serif text-xl font-semibold leading-snug text-navy-900">
        {title}
      </h3>
      <p className="mt-3 text-base leading-relaxed text-navy-700">{body}</p>
    </li>
  );
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-2 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-ember-500"
      />
      <span>{children}</span>
    </li>
  );
}

function DotIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-2 w-2 rounded-full bg-ember-500"
    />
  );
}

function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="6"
        y="2"
        width="12"
        height="20"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <line
        x1="10"
        y1="18.5"
        x2="14"
        y2="18.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="15" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M11 13 L21 3 M18 6 L20 8 M15 9 L17 11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
