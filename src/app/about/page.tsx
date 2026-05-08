import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About — Ben Pandher",
  description:
    "Small, local, and honest. Meet Ben Pandher, the Oxfordshire developer behind ModuForge by Pandemonium Software Ltd.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About — ModuForge",
    description:
      "Small, local, and honest. Meet Ben Pandher, the Oxfordshire developer behind ModuForge.",
    url: `${site.url}/about`,
  },
};

export default function AboutPage() {
  return (
    <>
      <section className="bg-cream-100/60 pb-12 pt-14 md:pb-16 md:pt-20">
        <div className="container-content max-w-4xl text-center">
          <span className="eyebrow">About</span>
          <h1 className="heading-1">Hello, I&apos;m Ben.</h1>
          <p className="prose-body mx-auto mt-6 max-w-2xl">
            I built Pandemonium Software Ltd because UK trades and small
            businesses deserve a professional website without the usual
            tech hassle.
          </p>
        </div>
      </section>

      <section className="pb-24 pt-10">
        <div className="container-content grid gap-14 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          {/* Portrait placeholder */}
          <div className="mx-auto w-full max-w-sm lg:sticky lg:top-28">
            <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-navy-900 shadow-lift">
              <svg
                viewBox="0 0 400 500"
                xmlns="http://www.w3.org/2000/svg"
                className="h-full w-full"
                role="img"
                aria-label="Friendly portrait placeholder"
              >
                <defs>
                  <linearGradient id="aboutBg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#172a42" />
                    <stop offset="1" stopColor="#0a1422" />
                  </linearGradient>
                </defs>
                <rect width="400" height="500" fill="url(#aboutBg)" />
                <circle cx="200" cy="210" r="80" fill="#f4efe3" />
                <path
                  d="M80 500 C 80 370, 320 370, 320 500 Z"
                  fill="#f4efe3"
                />
                <circle cx="172" cy="205" r="6" fill="#0f1d30" />
                <circle cx="228" cy="205" r="6" fill="#0f1d30" />
                <path
                  d="M178 240 Q 200 258 222 240"
                  stroke="#0f1d30"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="340" cy="80" r="28" fill="#f97316" />
              </svg>
            </div>
            <p className="mt-4 text-center text-sm text-navy-600">
              Photo of Ben coming soon.
            </p>
          </div>

          {/* Story */}
          <div className="long-form max-w-prose">
            <p>
              I&apos;m an Oxfordshire-based software developer. Before
              starting Pandemonium Software Ltd, I spent years building
              software for real businesses — the kind of work where a
              broken button costs someone real money and nobody has patience
              for jargon.
            </p>

            <p>
              Along the way, I noticed something. The small business owners
              I knew — the plumbers, electricians, builders, gardeners,
              photographers and therapists who keep Oxfordshire running —
              were getting a terrible deal from the web. They either had no
              website at all, or a tired one built a decade ago, or they
              were paying 30% of every job to lead platforms like Checkatrade
              and MyBuilder.
            </p>

            <p>
              So I built <strong>ModuForge</strong> — a small, focused
              service that does one thing really well: professional
              websites for UK trades and small businesses, at a fair flat
              fee, with no lock-in and no lead fees. Pick the modules you
              need, get a site built around them. Proudly Oxfordshire-based,
              serving the UK. You own everything, forever.
            </p>

            <p>
              I keep the business deliberately small. I do the building and
              the human review myself. The routine work — reading enquiries,
              drafting replies, running compatibility checks against my
              playbook, tracking client progress, sending the right reminder
              at the right time — is done by an AI assistant I&apos;ve set
              up. Every client-facing email is reviewed by me before it
              sends. That means fast turnaround for you and proper time for
              me to spend building, not buried in admin.
            </p>

            <p>
              I&apos;m not trying to be a big agency. I&apos;m trying to
              be the developer your mate should have told you about — just
              with a smarter pipeline behind the scenes than most one-person
              shops can manage.
            </p>

            <p className="mt-10">
              <Link href="/pricing" className="btn-primary">
                See what&apos;s included
              </Link>
              <Link
                href={site.enquiryPath}
                className="btn-secondary ml-3"
              >
                Start your enquiry
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
