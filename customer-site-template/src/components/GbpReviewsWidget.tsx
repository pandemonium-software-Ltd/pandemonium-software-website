// Google reviews — fetched at runtime from the marketing site's
// /api/public/gbp-reviews?token=... endpoint and rendered as a
// rating badge + top 3 review cards + "See all on Google" link.
//
// Why runtime fetch (not build-time): customer-site builds happen
// rarely (preview + go-live). The reviews refresh daily via the
// gbp-reviews cron, so build-time injection would be stale within
// 24 hours. A client-side fetch keeps the live feed actually live
// while letting the static site Worker stay edge-cached.
//
// Brand-aware: rating stars + the CTA use `text-brand-primary-500`
// and `border-brand-primary-200` so the block matches the
// customer's site palette.
//
// Empty / error states:
//   - 404 from the API (no snapshot yet)  → render nothing
//   - 503 / network error                 → render nothing
//   - rating === null (brand-new listing) → render nothing
// "Render nothing" is deliberate — better to skip the block than
// show "we found no reviews :(" to a site visitor.

"use client";

import { useEffect, useState } from "react";

type Review = {
  authorName: string;
  rating: number;
  text: string;
  relativeTimeDescription: string;
  profilePhotoUrl?: string;
};

type Payload = {
  rating: number | null;
  totalReviews: number | null;
  topReviews: Review[];
  fetchedAt: string;
};

type Props = {
  customerToken: string;
  apiOrigin: string;
  /** Public Google Business Profile listing URL — the "See all on
   *  Google" link target. Comes from data.modules.gbp.listingUrl
   *  (verbatim what the customer pasted at intake). */
  listingUrl: string;
  /** Trading name interpolated into the heading. */
  businessName: string;
};

export default function GbpReviewsWidget({
  customerToken,
  apiOrigin,
  listingUrl,
  businessName,
}: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = `${apiOrigin}/api/public/gbp-reviews?token=${encodeURIComponent(customerToken)}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        setData(json as Payload | null);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apiOrigin, customerToken]);

  if (!loaded) return null;
  if (!data || data.rating === null || data.topReviews.length === 0) {
    return null;
  }
  // Staleness gate — if the cron has not refreshed in 14+ days
  // something is wrong (API key revoked, listing removed, cron
  // disabled). Better to hide the block than show 3-week-old
  // reviews to a visitor as if they were fresh. We use 14d (not
  // 7d) so a one-week ops outage does not silently disappear
  // the reviews from every customer site — only persistent
  // failure does.
  const ageMs = Date.now() - new Date(data.fetchedAt).getTime();
  if (Number.isFinite(ageMs) && ageMs > 14 * 24 * 60 * 60 * 1000) {
    return null;
  }

  return (
    <section className="py-20 md:py-28" aria-label="Google reviews">
      <div className="container-content">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Verified on Google</p>
          <h2 className="heading-2">What customers are saying</h2>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Stars rating={Math.round(data.rating)} />
            <span className="text-2xl font-semibold text-navy-900">
              {data.rating.toFixed(1)}
            </span>
            {data.totalReviews !== null && data.totalReviews > 0 && (
              <span className="text-sm text-navy-500">
                · based on {data.totalReviews.toLocaleString()} Google review
                {data.totalReviews === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <ul className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-3">
          {data.topReviews.slice(0, 3).map((r, i) => (
            <li
              key={i}
              className="flex flex-col rounded-3xl border border-navy-100 bg-cream-50 p-7 shadow-card"
            >
              <Stars rating={r.rating} />
              <blockquote className="mt-4 grow text-base leading-relaxed text-navy-800">
                {/* Cap to ~280 chars so cards stay roughly the
                    same height; long reviews ellipsise rather
                    than blow the layout out. */}
                &ldquo;{r.text.length > 280 ? `${r.text.slice(0, 277)}…` : r.text}&rdquo;
              </blockquote>
              <footer className="mt-5 text-sm">
                <p className="font-semibold text-navy-900">{r.authorName}</p>
                <p className="text-navy-500">{r.relativeTimeDescription}</p>
              </footer>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center">
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            See all reviews for {businessName} on Google
          </a>
        </div>
      </div>
    </section>
  );
}

/** Inline star row — same visual as the testimonial block so the
 *  two sit comfortably together if the customer has both. */
function Stars({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, rating));
  return (
    <span
      className="flex items-center text-lg text-brand-primary-500"
      role="img"
      aria-label={`${clamped} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s > clamped ? "text-navy-200" : ""}>
          {s <= clamped ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
