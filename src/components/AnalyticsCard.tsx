"use client";

// Dashboard "Visitors" card — full-width, collapsible analytics
// tile shown on the customer dashboard (/account/[token]) and the
// admin self-view (/admin).
//
// Writing style: assume the reader is a non-technical small-
// business owner. No jargon (no "cache hit", no "HTTP status
// codes", no "edge"). Page paths are humanised — "Home" not "/".
// Top-N lists show percentages of total, not raw counts, because
// (a) percentages are more meaningful to the reader, and (b) the
// underlying Cloudflare counts include every request (HTML +
// images + JS), which can total much higher than pageviews and
// confuses people who try to add things up.
//
// Data source: GET /api/account/analytics/[token] for customers,
// or /api/admin/analytics for the marketing-site self view.
// Same {windowDays, days[], topPages, topReferrers, topCountries,
// statusCodes, threatsTotal, ...} shape from
// src/lib/d1-analytics.ts AnalyticsWindow.
//
// Privacy: data is Cloudflare edge-level — no cookies, no JS
// beacon, no banner needed. Visitor counts are estimates.

import { useEffect, useState } from "react";

type TopEntry = { name: string; count: number };
type DayPoint = { date: string; pageviews: number; uniques: number };
type AnalyticsResponse = {
  windowDays: number;
  days: DayPoint[];
  topPages: TopEntry[];
  topReferrers: TopEntry[];
  topCountries: TopEntry[];
  statusCodes: TopEntry[];
  threatsTotal: number;
  bandwidthBytesTotal: number;
  cachedRequestsTotal: number;
};

type WindowOption = 7 | 30 | 90;
const WINDOW_OPTIONS: readonly WindowOption[] = [7, 30, 90] as const;

type Props = {
  token: string;
  domain: string;
  title?: string;
  apiPath?: string;
};

export default function AnalyticsCard({
  token,
  domain,
  title = "📊 Visitors",
  apiPath,
}: Props) {
  const resolvedPath = apiPath ?? `/api/account/analytics/${token}`;
  const [windowDays, setWindowDays] = useState<WindowOption>(30);
  // Pull DOUBLE the window so we can split current vs previous for
  // the delta badges. Server caps at 365 — even 90×2 = 180 fits.
  const fetchWindow = windowDays * 2;

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sep = resolvedPath.includes("?") ? "&" : "?";
    fetch(`${resolvedPath}${sep}window=${fetchWindow}`)
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
  }, [resolvedPath, fetchWindow]);

  // Split returned days into current window + previous window for
  // comparison badges. The server gives us the most-recent N days
  // first by date sort — so "current" is the last `windowDays`,
  // "previous" is the `windowDays` before that.
  const allDays = data?.days ?? [];
  const currentDays = allDays.slice(-windowDays);
  const previousDays = allDays.slice(-windowDays * 2, -windowDays);

  const currentTotals = sumDays(currentDays);
  const previousTotals = sumDays(previousDays);
  const pvDelta = percentDelta(currentTotals.pageviews, previousTotals.pageviews);
  const uvDelta = percentDelta(currentTotals.uniques, previousTotals.uniques);

  // Strip self-referrals + meaningless meta-paths from the lists.
  const externalReferrers = (data?.topReferrers ?? []).filter(
    (r) => r.name && r.name !== domain && !r.name.endsWith(`.${domain}`),
  );
  const meaningfulPages = (data?.topPages ?? []).filter((p) => {
    const path = p.name || "/";
    if (path.startsWith("/_next/")) return false;
    if (path.startsWith("/wp-")) return false;
    if (path === "/favicon.ico") return false;
    if (path === "/robots.txt") return false;
    if (path === "/sitemap.xml") return false;
    if (path === "/icon.svg") return false;
    return true;
  });

  // Day-of-week pattern: average pageviews by weekday across the
  // current window. Mon-Sun bars.
  const weekdayBuckets = computeWeekdayPattern(currentDays);

  // (No broken-pages alert any more — it was firing on bot probe
  // noise. Without per-path status codes from Cloudflare's free
  // plan we can't distinguish a real broken link from 1,000 bots
  // hitting /wp-admin. If we want to surface this in future, we'd
  // need to either upgrade the customer's CF plan to Pro+ for
  // richer dimensions, or instrument the customer site with the
  // Cloudflare Web Analytics beacon which tracks "real visitor"
  // navigation distinctly from raw HTTP requests.)

  const hasAnyData = currentDays.length > 0;

  return (
    <details
      open
      className="group rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
    >
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            {title}
          </h2>
          {hasAnyData && (
            <span className="text-xs text-navy-500">
              Last {windowDays} days · {currentTotals.pageviews.toLocaleString("en-GB")}{" "}
              visits
            </span>
          )}
        </div>
        <ChevronToggle />
      </summary>

      <div className="mt-5">
        {/* Window selector */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-navy-500">
            Anonymous visit data — no cookies, no tracking script.
            Updates once a day, overnight.
          </p>
          <div
            role="tablist"
            aria-label="Time window"
            className="inline-flex overflow-hidden rounded-full border border-navy-200 text-xs font-semibold"
          >
            {WINDOW_OPTIONS.map((opt) => (
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

        {loading && <p className="mt-6 text-sm text-navy-500">Loading…</p>}

        {!loading && error && (
          <p className="mt-6 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && !hasAnyData && (
          <div className="mt-6 rounded-xl border border-dashed border-navy-200 bg-cream-50 p-6 text-sm leading-relaxed text-navy-700">
            <p className="font-semibold text-navy-900">No data yet</p>
            <p className="mt-1">
              Your first visitor stats land overnight. The dashboard
              refreshes once a day around 2am — check back tomorrow.
            </p>
          </div>
        )}

        {!loading && !error && hasAnyData && (
          <>
            {/* Headline totals — kept to three: visits, people,
                attacks-blocked. Cache hit and bandwidth removed —
                they're meaningless for a non-technical reader. */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Visits"
                value={currentTotals.pageviews}
                delta={pvDelta}
                windowDays={windowDays}
              />
              <Stat
                label="People who visited"
                value={currentTotals.uniques}
                delta={uvDelta}
                windowDays={windowDays}
                approx
                hint="Estimated — we count by device, not by login."
              />
              <Stat
                label="Attacks blocked"
                value={data!.threatsTotal}
                positiveIsGood={false}
                hint="Bots probing your site for vulnerabilities. Cloudflare blocks them automatically."
              />
            </div>

            {/* Sparkline with dual lines (pageviews + visitors) */}
            <div className="mt-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                  Daily visits
                </p>
                <div className="flex items-center gap-3 text-[11px] text-navy-600">
                  <LegendDot color="rgb(15 23 42)" /> Visits
                  <LegendDot color="rgb(220 38 38)" /> People
                </div>
              </div>
              <DualSparkline points={currentDays} className="mt-2" />
            </div>

            {/* Top pages + top countries side-by-side */}
            <div className="mt-7 grid gap-6 md:grid-cols-2">
              <TopList
                title="Most viewed pages"
                entries={meaningfulPages.slice(0, 8)}
                empty="Not enough data yet."
                format={(name) => humanizePath(name)}
              />
              <TopList
                title="Where your visitors are from"
                entries={(data!.topCountries ?? []).slice(0, 8)}
                empty="No country data yet."
                format={(code) => `${flagEmoji(code)} ${countryName(code)}`}
              />
            </div>

            {/* Top referrers + day-of-week pattern */}
            <div className="mt-7 grid gap-6 md:grid-cols-2">
              <TopList
                title="How people found you"
                entries={externalReferrers.slice(0, 8)}
                empty="Most visits arrived directly (typed your address, used a bookmark, or came from a Google search)."
                format={(name) => name || "Direct"}
              />
              <WeekdayPattern buckets={weekdayBuckets} />
            </div>

            <p className="mt-6 text-[11px] leading-relaxed text-navy-500">
              Percentages show share of total. Up/down badges compare
              this period with the previous {windowDays} days.
              Visit counts are estimates.
            </p>
          </>
        )}
      </div>
    </details>
  );
}

// ---------- Helpers ----------

function sumDays(
  days: DayPoint[],
): { pageviews: number; uniques: number } {
  return days.reduce(
    (acc, d) => ({
      pageviews: acc.pageviews + d.pageviews,
      uniques: acc.uniques + d.uniques,
    }),
    { pageviews: 0, uniques: 0 },
  );
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Turn a URL path into a friendly page name a non-tech customer
 *  will recognise. `/` → "Home". `/contact` → "Contact".
 *  `/our-services` → "Our services". Unknown paths fall back to a
 *  title-cased version of the path with dashes turned into spaces.
 *  Catalog-style nested paths get a "Section: leaf" form so
 *  blog/team/portfolio listings still read naturally. */
function humanizePath(raw: string): string {
  const path = (raw || "/").split("?")[0].split("#")[0];
  if (path === "/" || path === "") return "Home";
  // Known one-word paths get specific labels.
  const COMMON: Record<string, string> = {
    "/contact": "Contact",
    "/about": "About",
    "/about-us": "About us",
    "/services": "Services",
    "/our-services": "Our services",
    "/work": "Our work",
    "/portfolio": "Portfolio",
    "/gallery": "Gallery",
    "/projects": "Projects",
    "/testimonials": "Testimonials",
    "/reviews": "Reviews",
    "/pricing": "Pricing",
    "/quote": "Get a quote",
    "/book": "Book",
    "/booking": "Book",
    "/blog": "Blog",
    "/news": "News",
    "/faq": "FAQs",
    "/faqs": "FAQs",
    "/team": "The team",
    "/privacy": "Privacy policy",
    "/terms": "Terms",
    "/cookies": "Cookies policy",
  };
  if (COMMON[path]) return COMMON[path];
  // Generic: split on slashes, drop empties, title-case each
  // segment (dashes become spaces). Use ": " between segments
  // so "/blog/my-first-post" becomes "Blog: My first post".
  const parts = path.split("/").filter(Boolean).map((seg) =>
    seg
      .replace(/-/g, " ")
      .replace(/^./, (c) => c.toUpperCase()),
  );
  return parts.join(": ");
}

/** Two-letter ISO → flag emoji via regional indicator code points.
 *  Falls back to a globe if the code isn't 2 chars or is "??". */
function flagEmoji(code: string): string {
  if (!code || code.length !== 2 || code === "??") return "🌐";
  const A = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(
    code.charCodeAt(0) + A,
    code.charCodeAt(1) + A,
  );
}

/** Tiny country-code → name map for the most likely visitor sources
 *  for UK trade businesses. Unknown codes display as the raw code. */
const COUNTRY_NAMES: Record<string, string> = {
  GB: "United Kingdom",
  US: "United States",
  IE: "Ireland",
  FR: "France",
  DE: "Germany",
  NL: "Netherlands",
  ES: "Spain",
  IT: "Italy",
  PL: "Poland",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  CN: "China",
  RU: "Russia",
  BR: "Brazil",
  ZA: "South Africa",
  NZ: "New Zealand",
  PT: "Portugal",
  BE: "Belgium",
  DK: "Denmark",
  SE: "Sweden",
  NO: "Norway",
  FI: "Finland",
  AT: "Austria",
  CH: "Switzerland",
  CZ: "Czech Republic",
  GR: "Greece",
  TR: "Turkey",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  HK: "Hong Kong",
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

function computeWeekdayPattern(days: DayPoint[]): number[] {
  // Index 0 = Monday … 6 = Sunday. Buckets hold avg pageviews per
  // weekday across the window.
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const d of days) {
    const js = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    const idx = (js + 6) % 7;
    sums[idx] += d.pageviews;
    counts[idx]++;
  }
  return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : 0));
}

// ---------- Sub-components ----------

function ChevronToggle() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5 flex-none text-navy-500 transition-transform duration-200 group-open:rotate-180"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Stat({
  label,
  value,
  delta,
  windowDays,
  approx,
  positiveIsGood = true,
  hint,
}: {
  label: string;
  value: number;
  delta?: number | null;
  windowDays?: number;
  approx?: boolean;
  /** Up = green when true; up = red when false (e.g. attacks). */
  positiveIsGood?: boolean;
  /** Optional one-line clarifier shown beneath the number. */
  hint?: string;
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
      {delta !== undefined && delta !== null && (
        <p
          className={[
            "mt-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            delta === 0
              ? "bg-navy-100 text-navy-700"
              : (delta > 0) === positiveIsGood
                ? "bg-green-100 text-green-800"
                : "bg-ember-100 text-ember-700",
          ].join(" ")}
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta)}%
          {windowDays ? ` vs previous ${windowDays} days` : ""}
        </p>
      )}
      {delta === null && (
        <p className="mt-1 inline-block rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-semibold text-navy-600">
          first period
        </p>
      )}
      {hint && (
        <p className="mt-2 text-[11px] leading-tight text-navy-500">{hint}</p>
      )}
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function DualSparkline({
  points,
  className = "",
}: {
  points: DayPoint[];
  className?: string;
}) {
  if (points.length === 0) return null;
  const w = 800;
  const h = 140;
  const padX = 4;
  const padY = 8;
  const maxPv = Math.max(1, ...points.map((p) => p.pageviews));
  const maxUv = Math.max(1, ...points.map((p) => p.uniques));
  // Shared y-scale so both lines render comparably.
  const yMax = Math.max(maxPv, maxUv);
  const stepX =
    points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;

  function buildPath(getY: (p: DayPoint) => number): string {
    return points
      .map((p, i) => {
        const x = padX + i * stepX;
        const y = h - padY - ((h - padY * 2) * getY(p)) / yMax;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }
  const pvPath = buildPath((p) => p.pageviews);
  const uvPath = buildPath((p) => p.uniques);
  const pvArea = `${pvPath} L${(padX + (points.length - 1) * stepX).toFixed(1)},${h - padY} L${padX},${h - padY} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`h-36 w-full ${className}`}
      role="img"
      aria-label={`Daily visits chart, max ${yMax}`}
    >
      <path d={pvArea} fill="rgb(15 23 42 / 0.05)" />
      <path
        d={pvPath}
        fill="none"
        stroke="rgb(15 23 42)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={uvPath}
        fill="none"
        stroke="rgb(220 38 38)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="4 3"
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
  // Total over the LIST (not the full window) so percentages add
  // to 100 across the items shown. This is what most users
  // intuitively expect from a top-N share view, and it sidesteps
  // the "totals more than pageviews" confusion that comes from
  // Cloudflare counting every request (HTML + assets) in the
  // country/path breakdowns while pageviews is HTML-only.
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
                  <span className="truncate text-sm text-navy-800">
                    {format(e.name)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-navy-600">
                    {pct}%
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

function WeekdayPattern({ buckets }: { buckets: number[] }) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(1, ...buckets);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
        When people visit
      </p>
      <p className="mt-1 text-[11px] text-navy-500">
        Average visits per weekday for this period.
      </p>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {buckets.map((v, i) => {
          const heightPct = Math.max(4, Math.round((v / max) * 100));
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1"
              title={`${labels[i]}: ${v} avg visits`}
            >
              <div className="flex h-16 w-full items-end">
                <div
                  className="w-full rounded-t bg-navy-700"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-navy-500">
                {labels[i].slice(0, 1)}
              </span>
              <span className="text-[10px] font-mono tabular-nums text-navy-700">
                {v}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
