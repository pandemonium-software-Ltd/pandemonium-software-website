"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "@/lib/site";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-navy-100/60 bg-cream-50/90 backdrop-blur-md">
      <div className="container-content flex items-center justify-between py-5">
        <Link
          href="/"
          className="group flex items-baseline gap-2"
          aria-label={`${site.name} — home`}
        >
          <span className="font-serif text-2xl font-semibold leading-none tracking-tight text-navy-900 transition-colors group-hover:text-ember-600 md:text-[1.65rem]">
            {site.shortName}
          </span>
          <span className="hidden font-sans text-[11px] font-normal text-navy-500 sm:inline">
            {site.tagline}
          </span>
        </Link>

        <nav className="hidden items-center gap-10 md:flex" aria-label="Main">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[0.95rem] font-medium text-navy-700 transition-colors hover:text-ember-600"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={site.enquiryPath}
            className="btn-primary !py-2.5 !text-[0.95rem]"
          >
            Start your enquiry
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-navy-200 text-navy-800 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="border-t border-navy-100 bg-cream-50 md:hidden"
        >
          <nav
            className="container-content flex flex-col gap-2 py-5"
            aria-label="Mobile"
          >
            {site.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-3 text-base font-medium text-navy-800 hover:bg-cream-100"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={site.enquiryPath}
              onClick={() => setOpen(false)}
              className="btn-primary mt-2 w-full"
            >
              Start your enquiry
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
