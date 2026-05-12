// Promotional strip rendered at the very top of the customer's
// homepage when their Offers module has an active offer.
//
// Behaviour:
//   - Only renders when SITE_DATA.modules.offer is populated AND
//     today's local calendar date is between startsAt and endsAt
//     (inclusive). The build-time adapter already skips emitting
//     expired offers; this client-side check is the second guard
//     so a stale build doesn't show an expired strip indefinitely.
//   - Dismissible per browser session (sessionStorage) so the
//     visitor isn't badgered on every page reload. The visitor's
//     next session sees it again.
//   - Brand-coloured background using the customer's primary
//     colour for impact, secondary for the CTA pill.
//   - Inline CTA — internal paths get prefixed `/`; external URLs
//     open in a new tab.

"use client";

import { useEffect, useState } from "react";

type OfferProps = {
  headline: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  startsAt: string;
  endsAt: string;
};

/** Format today's calendar date in YYYY-MM-DD using the visitor's
 *  local timezone. We compare strings — works because YYYY-MM-DD
 *  is lexicographically ordered. */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DISMISS_KEY_PREFIX = "moduforge-offer-dismissed:";

export default function OfferStrip({
  headline,
  body,
  ctaLabel,
  ctaUrl,
  startsAt,
  endsAt,
}: OfferProps) {
  // Server-render the strip optimistically — most visitors will see
  // it. After hydration the date check + dismissal state kicks in
  // and may hide it. Avoids a flash of nothing on first paint.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Date range check (client-side as the second guard — the
    // adapter does a build-time check too, but a stale deploy
    // could ship an expired offer).
    const today = todayLocal();
    if (today < startsAt || today > endsAt) {
      setHidden(true);
      return;
    }
    // Dismissed in this session? Hide.
    // Key includes the offer date range so a NEW offer (different
    // dates) doesn't inherit the dismissal from a prior one.
    try {
      const key = `${DISMISS_KEY_PREFIX}${startsAt}-${endsAt}`;
      if (sessionStorage.getItem(key) === "1") {
        setHidden(true);
      }
    } catch {
      // sessionStorage unavailable (e.g. iframe sandbox) — keep
      // visible. Worst case the visitor sees the strip once per
      // navigation, which is acceptable.
    }
  }, [startsAt, endsAt]);

  function dismiss() {
    setHidden(true);
    try {
      const key = `${DISMISS_KEY_PREFIX}${startsAt}-${endsAt}`;
      sessionStorage.setItem(key, "1");
    } catch {
      /* no-op */
    }
  }

  if (hidden) return null;

  // CTA — open external links in a new tab; internal paths in same.
  const isExternal =
    !!ctaUrl && (ctaUrl.startsWith("http://") || ctaUrl.startsWith("https://"));

  return (
    <aside
      role="region"
      aria-label="Site offer"
      className="relative w-full bg-brand-primary-500 text-brand-primary-text"
    >
      <div className="container-content flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-3 text-center md:py-2.5">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <p className="text-sm font-semibold md:text-base">{headline}</p>
          {body && (
            <p className="text-xs opacity-90 md:text-sm md:opacity-95">
              {body}
            </p>
          )}
        </div>
        {ctaLabel && ctaUrl && (
          <a
            href={ctaUrl}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="inline-flex items-center rounded-full bg-white/15 px-3.5 py-1 text-xs font-semibold transition-colors hover:bg-white/25 md:text-sm"
          >
            {ctaLabel} →
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss offer"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </aside>
  );
}
