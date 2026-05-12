// Footer with NAP (name / address / phone — local SEO) + a small
// "powered by ModuForge" credit. Plain server component, no state.
// Optional newsletter signup widget renders above the NAP block
// when the customer has the Newsletter module + sender config.

import Link from "next/link";
import type { SiteData } from "@/lib/types";
import SubscribeWidget from "@/components/SubscribeWidget";

type Props = { data: SiteData };

export default function Footer({ data }: Props) {
  const year = new Date().getFullYear();
  const { business, copy, modules } = data;
  const hasFaq = (copy.faq?.length ?? 0) > 0;
  const newsletter = modules.newsletter;
  // Preview detection — same env-var pattern as the lock-down
  // suppressor in layout.tsx. When the version was uploaded as
  // a preview (PREVIEW_ACCESS_TOKEN env is set), we want the
  // SubscribeWidget to render visually but be non-submittable
  // so the customer reviewing their own preview can't accidentally
  // subscribe themselves with test emails. The widget ALSO does
  // a client-side iframe check (window.self !== top) so pre-commit
  // live builds reviewed in the Hub iframe get the same treatment.
  const isPreviewBuild = !!process.env.PREVIEW_ACCESS_TOKEN;
  return (
    <>
      {newsletter && (
        <SubscribeWidget
          customerToken={newsletter.customerToken}
          apiOrigin={newsletter.apiOrigin}
          headline={newsletter.widgetHeadline}
          body={newsletter.widgetBody}
          ctaLabel={newsletter.widgetCta}
          variant="footer"
          isPreviewBuild={isPreviewBuild}
        />
      )}
    <footer className="mt-20 bg-navy-950 text-cream-100">
      <div className="container-content grid gap-10 py-14 md:grid-cols-3">
        <div>
          <p className="font-serif text-xl font-semibold text-white">
            {business.name}
          </p>
          <p className="mt-2 text-sm text-navy-300">
            {business.type}
            {business.location ? ` in ${business.location}` : ""}
          </p>
          {business.address && (
            <address className="mt-3 not-italic text-sm text-navy-200">
              {business.address}
            </address>
          )}
          {business.hours && (
            <p className="mt-2 text-sm text-navy-300">{business.hours}</p>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-navy-300">
            Get in touch
          </p>
          <ul className="mt-3 space-y-2 text-sm text-navy-100">
            <li>
              <a
                href={`tel:${business.phone.replace(/\s/g, "")}`}
                className="hover:text-white"
              >
                {business.phone}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${business.email}`}
                className="hover:text-white"
              >
                {business.email}
              </a>
            </li>
          </ul>
        </div>

        <nav aria-label="Footer navigation">
          <p className="text-sm font-semibold uppercase tracking-wider text-navy-300">
            Site
          </p>
          <ul className="mt-3 space-y-2 text-sm text-navy-100">
            <li>
              <Link href="/about" className="hover:text-white">
                About
              </Link>
            </li>
            <li>
              <Link href="/services" className="hover:text-white">
                Services
              </Link>
            </li>
            {hasFaq && (
              <li>
                <Link href="/faq" className="hover:text-white">
                  FAQs
                </Link>
              </li>
            )}
            <li>
              <Link href="/contact" className="hover:text-white">
                Contact
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-navy-800/60 py-6 text-center text-xs text-navy-400">
        © {year} {business.name}. Built with{" "}
        <a
          href="https://modu-forge.co.uk"
          className="text-navy-200 underline hover:text-white"
        >
          ModuForge
        </a>
        .
      </div>
    </footer>
    </>
  );
}
