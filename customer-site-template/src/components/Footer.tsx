// Footer with NAP (name / address / phone — local SEO) + a small
// "powered by ModuForge" credit. Plain server component, no state.

import Link from "next/link";
import type { SiteData } from "@/lib/types";

type Props = { data: SiteData };

export default function Footer({ data }: Props) {
  const year = new Date().getFullYear();
  const { business, copy } = data;
  const hasFaq = (copy.faq?.length ?? 0) > 0;
  return (
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
  );
}
