"use client";

import type { RunMetrics, CronHealthEntry } from "@/lib/admin-metrics";

type Props = { metrics: RunMetrics };

export default function RunMonitorPanel({ metrics }: Props) {
  const {
    liveSites,
    zoneStatusBreakdown,
    cronHealth,
    gbpIssues,
    sentryOpen,
    sentryResolved,
  } = metrics;

  const nonActiveSites = liveSites.filter((s) => s.zoneStatus !== "active");

  return (
    <details className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Run monitoring
          </h2>
          <span className="text-xs text-navy-500">
            {liveSites.length} live site{liveSites.length !== 1 ? "s" : ""}
            {sentryOpen > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                {sentryOpen} open alert{sentryOpen !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        </div>
        <ChevronToggle />
      </summary>

      <div className="mt-5">
        {/* Cron health strip */}
        <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
          Cron health
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cronHealth.map((c) => (
            <CronCard key={c.label} entry={c} />
          ))}
        </div>

        {/* Sentry summary */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Sentry open"
            value={sentryOpen}
            variant={sentryOpen > 0 ? "warn" : "ok"}
          />
          <StatTile
            label="Sentry resolved"
            value={sentryResolved}
            variant="neutral"
          />
          <StatTile
            label="Live sites"
            value={liveSites.length}
            variant="ok"
          />
        </div>

        {/* Zone status breakdown */}
        {Object.keys(zoneStatusBreakdown).length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Zone status
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(zoneStatusBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <ZoneBadge key={status} status={status} count={count} />
                ))}
            </div>
          </div>
        )}

        {/* Non-active zones needing attention */}
        {nonActiveSites.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Zones needing attention
            </p>
            <ul className="mt-2 space-y-1">
              {nonActiveSites.map((s) => (
                <li
                  key={s.token}
                  className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm"
                >
                  <ZoneDot status={s.zoneStatus} />
                  <span className="font-semibold text-navy-900">{s.name}</span>
                  {s.business && (
                    <span className="text-navy-600">({s.business})</span>
                  )}
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    {s.zoneStatus}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* GBP API issues */}
        {gbpIssues.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
              GBP API issues
            </p>
            <ul className="mt-2 space-y-1">
              {gbpIssues.map((g) => (
                <li
                  key={g.token}
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-navy-900">{g.name}</span>
                  <span className="ml-2 text-xs text-red-700">
                    {g.lastError}
                  </span>
                  <span className="ml-2 text-xs text-navy-500">
                    Last fetch: {formatRelative(g.fetchedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function CronCard({ entry }: { entry: CronHealthEntry }) {
  const border =
    entry.status === "ok"
      ? "border-green-300"
      : entry.status === "warn"
        ? "border-amber-300"
        : "border-red-300";
  const dot =
    entry.status === "ok"
      ? "bg-green-500"
      : entry.status === "warn"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className={`rounded-xl border-2 bg-white p-3 text-sm ${border}`}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex h-2.5 w-2.5 rounded-full ${dot}`}
        />
        <span className="font-semibold text-navy-900">{entry.label}</span>
      </div>
      <p className="mt-1 truncate text-xs text-navy-600">
        {entry.lastRan ? formatRelative(entry.lastRan) : "Never ran"}
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "ok" | "warn" | "neutral";
}) {
  const bg =
    variant === "ok"
      ? "bg-green-50"
      : variant === "warn"
        ? "bg-amber-50"
        : "bg-cream-50";

  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold text-navy-900">
        {value}
      </p>
    </div>
  );
}

function ZoneBadge({ status, count }: { status: string; count: number }) {
  const color =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "pending" || status === "initializing"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${color}`}
    >
      {status}: {count}
    </span>
  );
}

function ZoneDot({ status }: { status: string }) {
  const color =
    status === "active"
      ? "bg-green-500"
      : status === "pending" || status === "initializing"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${color}`}
    />
  );
}

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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
