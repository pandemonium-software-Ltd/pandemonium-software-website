"use client";

// Small cookie disclosure banner — bottom-of-page, dismissable.
//
// We deliberately don't ship a full consent-toggle UI. The
// customer-site uses only ESSENTIAL cookies (Cloudflare for
// security/performance, plus Cal.com session cookies if the
// booking widget is rendered). Essential cookies don't require
// consent under PECR / UK GDPR — they require disclosure, which
// this banner provides.
//
// Dismissal persists in localStorage (NOT a cookie, intentionally —
// "we use cookies, accept" would itself be a consent cookie which
// triggers the chicken-and-egg debate). localStorage is exempt
// from the cookie law since it's the user's own browser storage
// for their own preference, not a tracking mechanism.
//
// If we ever add non-essential tracking (Plausible is cookieless,
// fine; Google Analytics would not be), upgrade this to a proper
// consent UI with a toggle for analytics + retargeting buckets.

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISSED_KEY = "moduforge_cookie_notice_dismissed_v1";

export default function CookieNotice() {
  // SSR-safe: render nothing until mounted on the client, then
  // check localStorage. Avoids hydration-mismatch flicker.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) !== "1") {
        setVisible(true);
      }
    } catch {
      // localStorage blocked (rare — private browsing / paranoid
      // browser settings). Default to NOT showing the banner;
      // disclosure stays available via the /privacy page footer
      // link.
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore — banner just won't persist its dismissed state
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-100 bg-cream-50/95 backdrop-blur-sm shadow-[0_-4px_12px_rgba(15,23,42,0.06)]"
    >
      <div className="container-content flex flex-col gap-3 py-3 text-sm text-navy-700 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-4">
        <p>
          We use a small number of essential cookies to keep this site
          working — no tracking, no ads.{" "}
          <Link href="/privacy" className="font-semibold underline hover:no-underline">
            Privacy policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="self-end rounded-full bg-navy-900 px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-800 sm:self-auto"
        >
          OK, got it
        </button>
      </div>
    </div>
  );
}
