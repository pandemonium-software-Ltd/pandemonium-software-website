"use client";

// Sticky site header with the customer's logo + brand name + the
// primary nav. Multi-page navigation: each item is a real
// `next/link` to a separate route. Nav adapts to the customer's
// active modules — Booking only appears if they bought it.

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { SiteData } from "@/lib/types";

type Props = { data: SiteData };

export default function Header({ data }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { business, copy } = data;
  // Booking + enquiry are now folded into the unified /contact page,
  // so neither needs a top-level nav link. /contact's "Get in touch"
  // CTA covers all of them.
  const hasFaq = (copy.faq?.length ?? 0) > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-navy-100/60 bg-cream-50/85 backdrop-blur-md backdrop-saturate-150">
      <div className="container-content flex h-16 items-center justify-between md:h-20">
        <Link
          href="/"
          className="flex items-center gap-3 font-serif text-lg font-semibold text-navy-900 hover:text-navy-700"
        >
          {/* Logo as next/image with explicit width + height to
              prevent layout shift. The actual aspect ratio depends
              on the customer's logo file; w-auto on the className
              keeps it natural while h-9 fixes the rendered height. */}
          <Image
            src={data.brandAssets.logoUrl}
            alt={`${business.name} logo`}
            width={144}
            height={36}
            priority
            className="h-9 w-auto rounded-md object-contain"
          />
          <span>{business.name}</span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-8 text-sm font-medium md:flex"
        >
          <NavLink href="/about">About</NavLink>
          <NavLink href="/services">Services</NavLink>
          {hasFaq && <NavLink href="/faq">FAQs</NavLink>}
          <Link
            href="/contact"
            className="rounded-full bg-brand-primary-500 px-5 py-2.5 font-semibold text-brand-primary-text transition-all duration-200 hover:-translate-y-px hover:bg-brand-primary-600"
          >
            Get in touch
          </Link>
        </nav>

        <button
          type="button"
          className="flex flex-col gap-1 rounded-md p-2 md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="block h-0.5 w-5 rounded-full bg-navy-900" />
          <span className="block h-0.5 w-5 rounded-full bg-navy-900" />
          <span className="block h-0.5 w-5 rounded-full bg-navy-900" />
        </button>
      </div>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <nav
          aria-label="Mobile navigation"
          className="border-t border-navy-100/60 bg-cream-50/95 md:hidden"
        >
          <ul className="container-content flex flex-col py-3 text-base font-medium text-navy-800">
            <MobileLink href="/about" onClick={() => setMobileOpen(false)}>
              About
            </MobileLink>
            <MobileLink href="/services" onClick={() => setMobileOpen(false)}>
              Services
            </MobileLink>
            {hasFaq && (
              <MobileLink href="/faq" onClick={() => setMobileOpen(false)}>
                FAQs
              </MobileLink>
            )}
            <MobileLink href="/contact" onClick={() => setMobileOpen(false)}>
              Get in touch
            </MobileLink>
          </ul>
        </nav>
      )}
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-navy-700 transition-colors hover:text-navy-900"
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="block rounded-md px-3 py-3 hover:bg-navy-100"
      >
        {children}
      </Link>
    </li>
  );
}
