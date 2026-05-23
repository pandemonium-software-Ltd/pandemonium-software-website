"use client";

// Dashboard "Analytics" card — full-width, collapsible analytics
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
import { humanizePath, isMeaningfulPath } from "@/lib/humanize-path";

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
  /** DOM id on the outer <details>. Lets the dashboard timeline
   *  rail target this card for smooth-scroll + open. */
  id?: string;
  /** Whether the card starts expanded. Defaults to false so the
   *  dashboard starts as a compact accordion — the customer
   *  expands what they want via the rail or the chevron. */
  defaultOpen?: boolean;
  /** Show the Website / Newsletter tab toggle. Pass true when
   *  the customer has the Newsletter module + at least one send;
   *  false / unset hides the toggle and only renders Website. */
  hasNewsletter?: boolean;
};

export default function AnalyticsCard({
  token,
  domain,
  title = "📊 Analytics",
  apiPath,
  id,
  defaultOpen = false,
  hasNewsletter = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<"website" | "newsletter">(
    "website",
  );
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

  // Strip self-referrals + asset/probe paths from the lists. The
  // isMeaningfulPath filter is shared with the monthly digest
  // email so both surfaces agree on what counts as a real page.
  const externalReferrers = (data?.topReferrers ?? []).filter(
    (r) => r.name && r.name !== domain && !r.name.endsWith(`.${domain}`),
  );
  const meaningfulPages = (data?.topPages ?? []).filter((p) =>
    isMeaningfulPath(p.name),
  );

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
      id={id}
      open={defaultOpen}
      className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
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

        {/* Tab toggle — Website / Newsletter. Only shown when the
          * customer actually has the Newsletter module (hasNewsletter
          * prop), otherwise we render the website analytics
          * directly. Window selector above applies to both tabs. */}
        {hasNewsletter && (
          <div
            role="tablist"
            aria-label="Analytics view"
            className="mt-5 inline-flex overflow-hidden rounded-full border-2 border-navy-200 text-xs font-semibold"
          >
            {(["website", "newsletter"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={activeTab === t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 transition-colors ${
                  activeTab === t
                    ? "bg-navy-900 text-white"
                    : "bg-white text-navy-700 hover:bg-cream-50"
                }`}
              >
                {t === "website" ? "🌐 Website" : "📧 Newsletter"}
              </button>
            ))}
          </div>
        )}

        {hasNewsletter && activeTab === "newsletter" ? (
          <NewsletterAnalyticsPanel
            token={token}
            windowDays={windowDays}
          />
        ) : (
          <WebsiteAnalyticsPanel
            loading={loading}
            error={error}
            hasAnyData={hasAnyData}
            currentTotals={currentTotals}
            pvDelta={pvDelta}
            uvDelta={uvDelta}
            windowDays={windowDays}
            data={data}
            currentDays={currentDays}
            meaningfulPages={meaningfulPages}
            externalReferrers={externalReferrers}
            weekdayBuckets={weekdayBuckets}
          />
        )}
      </div>
    </details>
  );
}

// ---------- WebsiteAnalyticsPanel ----------
// Existing website analytics rendering, extracted into its own
// component so the tab toggle can swap between it and the
// newsletter panel without conditionally rendering hundreds of
// lines inline.

type WebsiteAnalyticsPanelProps = {
  loading: boolean;
  error: string | null;
  hasAnyData: boolean;
  currentTotals: { pageviews: number; uniques: number };
  pvDelta: number | null;
  uvDelta: number | null;
  windowDays: number;
  data: AnalyticsResponse | null;
  currentDays: DayPoint[];
  meaningfulPages: TopEntry[];
  externalReferrers: TopEntry[];
  weekdayBuckets: number[];
};

function WebsiteAnalyticsPanel(props: WebsiteAnalyticsPanelProps) {
  const {
    loading,
    error,
    hasAnyData,
    currentTotals,
    pvDelta,
    uvDelta,
    windowDays,
    data,
    currentDays,
    meaningfulPages,
    externalReferrers,
    weekdayBuckets,
  } = props;
  return (
    <>
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
    </>
  );
}

// ---------- NewsletterAnalyticsPanel ----------
// Fetches /api/account/analytics/[token]/newsletter for the
// current window and renders headline tiles + send-history table.
// Subscriber growth is derived client-side from the response so
// we don't fan out a second API call.

function NewsletterAnalyticsPanel({
  token,
  windowDays,
}: {
  token: string;
  windowDays: number;
}) {
  const [data, setData] = useState<NewsletterAnalyticsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/account/analytics/${token}/newsletter?window=${windowDays}`,
    )
      .then((r) => r.json())
      .then(
        (json: NewsletterAnalyticsResponse | { error: string }) => {
          if (cancelled) return;
          if ("error" in json) {
            setError(json.error);
            return;
          }
          setData(json);
        },
      )
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

  if (loading) {
    return <p className="mt-6 text-sm text-navy-500">Loading…</p>;
  }
  if (error) {
    return (
      <p className="mt-6 text-sm text-ember-700" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return null;

  const openRate = ratePct(data.totals.opened, data.totals.delivered);
  const clickRate = ratePct(data.totals.clicked, data.totals.delivered);
  const bounceRate = ratePct(
    data.totals.bounced,
    data.totals.recipientCount,
  );

  return (
    <>
      {data.sends.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-navy-200 bg-cream-50 p-6 text-sm leading-relaxed text-navy-700">
          <p className="font-semibold text-navy-900">
            No sends in the last {windowDays} days
          </p>
          <p className="mt-1">
            Once you send a newsletter, open / click / bounce stats
            will appear here. Stats update as soon as Resend reports
            them — usually within seconds of a subscriber opening
            the email.
          </p>
        </div>
      ) : (
        <>
          {/* Headline tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NewsletterStat
              label="Sends"
              value={data.totals.sendsCount.toLocaleString("en-GB")}
              hint={`${data.totals.recipientCount.toLocaleString("en-GB")} total recipients`}
            />
            <NewsletterStat
              label="Open rate"
              value={openRate === null ? "—" : `${openRate}%`}
              hint={`${data.totals.opened.toLocaleString("en-GB")} opened`}
            />
            <NewsletterStat
              label="Click rate"
              value={clickRate === null ? "—" : `${clickRate}%`}
              hint={`${data.totals.clicked.toLocaleString("en-GB")} clicked a link`}
            />
            <NewsletterStat
              label="Unsubscribes"
              value={data.totals.unsubscribed.toLocaleString("en-GB")}
              hint={
                bounceRate === null
                  ? `${data.totals.bounced} bounced`
                  : `${data.totals.bounced} bounced (${bounceRate}%)`
              }
              positiveIsGood={false}
            />
          </div>

          {/* Subscribers strip */}
          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-xl bg-cream-50 px-4 py-3 text-sm">
            <div>
              <span className="font-mono text-xl font-bold text-navy-900">
                {data.subscriberCountNow.toLocaleString("en-GB")}
              </span>
              <span className="ml-2 text-xs text-navy-600">
                active subscribers right now
              </span>
            </div>
            {data.subscriberGrowthInWindow !== 0 && (
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  data.subscriberGrowthInWindow > 0
                    ? "bg-green-100 text-green-800"
                    : "bg-ember-100 text-ember-700",
                ].join(" ")}
              >
                {data.subscriberGrowthInWindow > 0 ? "▲" : "▼"}{" "}
                {Math.abs(data.subscriberGrowthInWindow)} in last{" "}
                {windowDays} days
              </span>
            )}
          </div>

          {/* Per-send table */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Recent sends
              </p>
              {/* Scroll hint only on narrow viewports — the table
                  has min-w-[600px] and will overflow with sideways
                  scroll on mobile. Without this hint customers
                  won't realise the right-hand columns exist. */}
              <span className="text-[10px] italic text-navy-500 sm:hidden">
                Swipe →
              </span>
            </div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-navy-100">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-cream-50 text-[11px] uppercase tracking-wider text-navy-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Sent
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Subject
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Recipients
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Opens
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Clicks
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Bounces
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.sends.map((s) => {
                    const o = ratePct(s.opened, s.delivered);
                    const c = ratePct(s.clicked, s.delivered);
                    const b = ratePct(s.bounced, s.recipientCount);
                    return (
                      <tr
                        key={s.sendId}
                        className="border-t border-navy-100"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-navy-600">
                          {new Date(s.sentAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </td>
                        <td className="px-3 py-2 text-navy-900">
                          <span className="line-clamp-1">{s.subject}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-navy-700">
                          {s.recipientCount}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-navy-700">
                          {s.opened} {o === null ? "" : `(${o}%)`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-navy-700">
                          {s.clicked} {c === null ? "" : `(${c}%)`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-navy-700">
                          {s.bounced} {b === null ? "" : `(${b}%)`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-navy-500">
            Opens and clicks count unique recipients, not repeats.
            Stats arrive in real time as subscribers interact with
            the email — refresh to pick up new events.
          </p>
        </>
      )}
    </>
  );
}

type NewsletterAnalyticsResponse = {
  windowDays: number;
  sends: Array<{
    sendId: string;
    sentAt: string;
    subject: string;
    recipientCount: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
  }>;
  totals: {
    sendsCount: number;
    recipientCount: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };
  subscriberCountNow: number;
  subscriberGrowthInWindow: number;
};

function NewsletterStat({
  label,
  value,
  hint,
  positiveIsGood = true,
}: {
  label: string;
  value: string;
  hint?: string;
  positiveIsGood?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl p-4",
        positiveIsGood ? "bg-cream-50" : "bg-cream-100",
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold text-navy-900">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] leading-tight text-navy-500">
          {hint}
        </p>
      )}
    </div>
  );
}

function ratePct(num: number, denom: number): number | null {
  if (denom <= 0) return null;
  return Math.round((num / denom) * 100);
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
