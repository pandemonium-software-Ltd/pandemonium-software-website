import Link from "next/link";
import { site } from "@/lib/site";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-navy-100 bg-navy-950 text-cream-100">
      <div className="container-content py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-2xl font-semibold text-white">
                {site.shortName}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-cream-300/70">
                {site.tagline}
              </span>
            </div>
            <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-cream-200/80">
              Professional websites for UK trades and small businesses.
              Built properly, priced fairly, and yours to keep.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-cream-300/70">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Proudly Oxfordshire-based, serving the UK
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-cream-300/60">
              Pages
            </h3>
            <ul className="space-y-3">
              {site.footerNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[0.95rem] text-cream-200/90 transition-colors hover:text-ember-400"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-cream-300/60">
              Get in touch
            </h3>
            <ul className="space-y-3 text-[0.95rem]">
              <li>
                <a
                  href={`mailto:${site.contactEmail}`}
                  className="text-cream-200/90 transition-colors hover:text-ember-400"
                >
                  {site.contactEmail}
                </a>
              </li>
              <li>
                <Link
                  href={site.contactPath}
                  className="text-cream-200/90 transition-colors hover:text-ember-400"
                >
                  Contact us now
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-8 text-sm text-cream-300/60 md:flex-row md:items-center">
          <p>© {year} {site.name}. All rights reserved.</p>
          <p>
            Made in {site.location.city}, {site.location.region}.
          </p>
        </div>
      </div>
    </footer>
  );
}
