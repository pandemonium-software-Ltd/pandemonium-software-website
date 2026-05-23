"use client";

// Dashboard "Visitors" card — visible to live customers.
//
// Renders a 7- or 30-day pageviews sparkline, totals (pageviews +
// uniques) for the window, and top 5 pages + top 5 referrers.
//
// Data source: GET /api/account/analytics/[token] — backed by
// the pandemonium_analytics D1, populated nightly by the ops
// Worker's analytics-tick at 02:00 UTC.
//
// Empty state: customers who've been Live < 24h won't have any
// rows yet — we show a friendly "First data lands overnight"
// message rather than a broken-looking empty chart.
//
// Privacy: data comes from Cloudflare's edge-level request
// counters — no client-side JS beacon, no cookies, no banner
// needed. Visitor counts are estimates Cloudflare derives from
// edge fingerprinting (good enough for trend visibility, not
// "1.0000 unique" precision).

import { useEffect, useState } from "react";

type TopEntry = { name: string; count: number };
type DayPoint = { date: string; pageviews: number; uniques: number };
type AnalyticsResponse = {
  windowDays: number;
  days: DayPoint[];
  topPages: TopEntry[];
  topReferrers: TopEntry[];
};

type WindowOption = 7 | 30;

type Props = {
  token: string;
  /** Customer's domain — used to pretty-print top page paths into
   *  full URLs and to filter own-domain referrers out of the top
   *  referrers list (a self-referral isn't an interesting source). */
  domain: string;
};

export default function AnalyticsCard({ token, domain }: Props) {
  const [windowDays, setWindowDays] = useState<WindowOption>(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/account/analytics/${token}?window=${windowDays}`)
      .then((r) => r.json())
      .then((json: AnalyticsResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in json) {
          setError(json.error);
          return;
        }
        setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, windowDays]);

  // Trim the days array to the selected window (server may have
  // returned more if we asked for 30 then switched to 7 in the UI).
  const days = (data?.days ?? []).slice(-windowDays);

  const totals = days.reduce(
    (acc, d) => ({
      pageviews: acc.pageviews + d.pageviews,
      uniques: acc.uniques + d.uniques,
    }),
    { pageviews: 0, uniques: 0 },
  );

  // Strip self-referrals — a customer doesn't need to be told
  // their own homepage refers their own contact page.
  const externalReferrers = (data?.topReferrers ?? []).filter(
    (r) => r.name && r.name !== domain && !r.name.endsWith(`.${domain}`),
  );

  // Drop noise from the top-pages list:
  //   - /_next/*   Next.js JS chunks + image proxy
  //   - /wp-*      WordPress probe attacks (every public site
  //                gets these; not interesting to the customer)
  //   - /favicon.ico, /robots.txt, /sitemap.xml — assets, not pages
  // We keep the raw data in D1 (so we can change this filter later
  // without re-fetching) and just strip at render time.
  const meaningfulPages = (data?.topPages ?? []).filter((p) => {
    const path = p.name || "/";
    if (path.startsWith("/_next/")) return false;
    if (path.startsWith("/wp-")) return false;
    if (path === "/favicon.ico") return false;
    if (path === "/robots.txt") return false;
    if (path === "/sitemap.xml") return false;
    return true;
  });

  const hasAnyData = days.length > 0;

  return (
    <article className="rounded-2xl bg-white p-6 shadow-card md:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold text-navy-900">
          📊 Visitors
        </h2>
        <div
          role="tablist"
          aria-label="Time window"
          className="inline-flex overflow-hidden rounded-full border border-navy-200 text-xs font-semibold"
        >
          {([7, 30] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              role="tab"
              aria-selected={windowDays === opt}
              onClick={() => setWindowDays(opt)}
              className={`px-3 py-1 transition-colors ${
                windowDays === opt
                  ? "bg-navy-900 text-white"
                  : "bg-white text-navy-700 hover:bg-cream-50"
              }`}
            >
              Last {opt}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="mt-4 text-sm text-navy-500">Loading…</p>
      )}

      {!loading && error && (
        <p className="mt-4 text-sm text-ember-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !hasAnyData && (
        <div className="mt-4 rounded-xl border border-dashed border-navy-200 bg-cream-50 p-5 text-sm leading-relaxed text-navy-700">
          <p className="font-semibold text-navy-900">No data yet</p>
          <p className="mt-1">
            Your first visitor stats land overnight. The dashboard
            updates once a day at around 02:00 — check back tomorrow.
          </p>
        </div>
      )}

      {!loading && !error && hasAnyData && (
        <>
          {/* Totals strip */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Pageviews" value={totals.pageviews} />
            <Stat label="Visitors" value={totals.uniques} approx />
          </div>

          {/* Sparkline */}
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Daily pageviews
            </p>
            <Sparkline points={days} className="mt-2" />
          </div>

          {/* Top pages + top referrers — side by side on md+,
              stacked on mobile. */}
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <TopList
              title="Top pages"
              entries={meaningfulPages.slice(0, 5)}
              empty="Not enough data yet."
              format={(name) => name || "/"}
            />
            <TopList
              title="Top referrers"
              entries={externalReferrers.slice(0, 5)}
              empty="Mostly direct visits or search — nothing else stands out."
              format={(name) => name || "(direct)"}
            />
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-navy-500">
            Powered by Cloudflare — measured at the edge, no cookies,
            no tracking script. Visitor counts are estimates. Resets
            nightly at 02:00.
          </p>
        </>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  approx,
}: {
  label: string;
  value: number;
  approx?: boolean;
}) {
  return (
    <div className="rounded-xl bg-cream-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold text-navy-900">
        {approx ? "≈ " : ""}
        {value.toLocaleString("en-GB")}
      </p>
    </div>
  );
}

function Sparkline({
  points,
  className = "",
}: {
  points: DayPoint[];
  className?: string;
}) {
  if (points.length === 0) return null;
  const w = 600;
  const h = 80;
  const padX = 4;
  const padY = 6;
  const max = Math.max(1, ...points.map((p) => p.pageviews));
  const stepX =
    points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = padX + i * stepX;
      const y = h - padY - ((h - padY * 2) * p.pageviews) / max;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Area fill underneath the line for visual heft.
  const area = `${path} L${(padX + (points.length - 1) * stepX).toFixed(1)},${h - padY} L${padX},${h - padY} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`h-20 w-full ${className}`}
      role="img"
      aria-label={`Daily pageviews chart, max ${max}`}
    >
      <path d={area} fill="rgb(15 23 42 / 0.06)" />
      <path
        d={path}
        fill="none"
        stroke="rgb(15 23 42)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TopList({
  title,
  entries,
  empty,
  format,
}: {
  title: string;
  entries: TopEntry[];
  empty: string;
  format: (name: string) => string;
}) {
  const total = entries.reduce((acc, e) => acc + e.count, 0) || 1;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
        {title}
      </p>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-navy-600">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((e) => {
            const pct = Math.round((e.count / total) * 100);
            return (
              <li key={e.name} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-mono text-xs text-navy-800">
                    {format(e.name)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-navy-600">
                    {e.count.toLocaleString("en-GB")}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-cream-100">
                  <div
                    className="h-full bg-navy-700"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
