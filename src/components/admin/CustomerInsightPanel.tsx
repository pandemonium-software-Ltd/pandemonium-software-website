"use client";

import type { InsightMetrics } from "@/lib/admin-metrics";

type Props = { metrics: InsightMetrics };

export default function CustomerInsightPanel({ metrics }: Props) {
  const {
    conversionFunnel,
    revenueByTier,
    pipelineByNiche,
    modulePopularity,
    locationSpread,
    totalMrr,
    totalSetupCollected,
  } = metrics;

  const hasAnyData =
    conversionFunnel.some((s) => s.count > 0) ||
    pipelineByNiche.length > 0;

  return (
    <details className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Customer insight
          </h2>
          {hasAnyData && (
            <span className="text-xs text-navy-500">
              MRR: £{totalMrr}/mo · Setup: £{totalSetupCollected.toLocaleString("en-GB")}
            </span>
          )}
        </div>
        <ChevronToggle />
      </summary>

      <div className="mt-5">
        {!hasAnyData ? (
          <EmptyState />
        ) : (
          <>
            {/* Revenue tiles */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Total MRR"
                value={`£${totalMrr}`}
                hint="Monthly recurring revenue"
              />
              <StatTile
                label="Setup collected"
                value={`£${totalSetupCollected.toLocaleString("en-GB")}`}
                hint="One-off setup fees"
              />
              <StatTile
                label="Founding"
                value={String(revenueByTier.founding.count)}
                hint={`£${revenueByTier.founding.mrr}/mo MRR`}
              />
              <StatTile
                label="Standard"
                value={String(revenueByTier.standard.count)}
                hint={`£${revenueByTier.standard.mrr}/mo MRR`}
              />
            </div>

            {/* Conversion funnel */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Conversion funnel
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {conversionFunnel.map((stage, i) => (
                  <FunnelStage
                    key={stage.label}
                    label={stage.label}
                    count={stage.count}
                    isLast={i === conversionFunnel.length - 1}
                    prevCount={i > 0 ? conversionFunnel[i - 1].count : null}
                  />
                ))}
              </div>
            </div>

            {/* Niche + Module side-by-side */}
            <div className="grid gap-6 md:grid-cols-2">
              <BarList
                title="Pipeline by trade"
                entries={pipelineByNiche.slice(0, 10).map((e) => ({
                  name: e.niche,
                  count: e.count,
                }))}
                empty="No trades recorded yet."
              />
              <BarList
                title="Module popularity"
                entries={modulePopularity.map((e) => ({
                  name: e.module,
                  count: e.count,
                }))}
                empty="No modules selected yet."
              />
            </div>

            {/* Location spread */}
            {locationSpread.length > 0 && (
              <div className="mt-6">
                <BarList
                  title="Location spread"
                  entries={locationSpread.slice(0, 10).map((e) => ({
                    name: e.location,
                    count: e.count,
                  }))}
                  empty=""
                />
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function FunnelStage({
  label,
  count,
  isLast,
  prevCount,
}: {
  label: string;
  count: number;
  isLast: boolean;
  prevCount: number | null;
}) {
  const dropOff =
    prevCount !== null && prevCount > 0
      ? Math.round(((prevCount - count) / prevCount) * 100)
      : null;

  return (
    <>
      <div className="flex flex-col items-center">
        <div
          className={[
            "flex h-14 w-20 flex-col items-center justify-center rounded-lg text-center sm:w-24",
            count > 0 ? "bg-navy-900 text-white" : "bg-navy-100 text-navy-500",
          ].join(" ")}
        >
          <span className="font-mono text-lg font-bold">{count}</span>
          <span className="text-[10px] leading-tight">{label}</span>
        </div>
      </div>
      {!isLast && (
        <div className="flex flex-col items-center px-0.5">
          <span className="text-navy-300" aria-hidden="true">
            →
          </span>
          {dropOff !== null && dropOff > 0 && (
            <span className="text-[9px] font-semibold text-red-600">
              -{dropOff}%
            </span>
          )}
        </div>
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-cream-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold text-navy-900">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] leading-tight text-navy-500">{hint}</p>
      )}
    </div>
  );
}

function BarList({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: Array<{ name: string; count: number }>;
  empty: string;
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
                  <span className="truncate text-navy-800">{e.name}</span>
                  <span className="font-mono text-xs tabular-nums text-navy-600">
                    {e.count} ({pct}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream-100">
                  <div
                    className="h-full rounded-full bg-navy-700"
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

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-navy-200 bg-cream-50 p-6 text-sm text-navy-700">
      <p className="font-semibold text-navy-900">No data yet</p>
      <p className="mt-1">
        Customer insight will appear here once prospects start coming
        through the pipeline.
      </p>
    </div>
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
