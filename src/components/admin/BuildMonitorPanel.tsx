"use client";

import type { BuildMetrics, OnboardingCustomer } from "@/lib/admin-metrics";

type Props = { metrics: BuildMetrics };

export default function BuildMonitorPanel({ metrics }: Props) {
  const { onboardingCustomers, stepCompletionRates, upcomingLaunches, buildFailures } =
    metrics;

  const hasCustomers = onboardingCustomers.length > 0;

  return (
    <details className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Build monitoring
          </h2>
          {hasCustomers && (
            <span className="text-xs text-navy-500">
              {onboardingCustomers.length} in onboarding
              {buildFailures.length > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                  {buildFailures.length} failed
                </span>
              )}
            </span>
          )}
        </div>
        <ChevronToggle />
      </summary>

      <div className="mt-5">
        {!hasCustomers ? (
          <EmptyState message="No customers in onboarding yet." />
        ) : (
          <>
            {/* Alerts */}
            {(buildFailures.length > 0 || upcomingLaunches.length > 0) && (
              <div className="mb-5 space-y-2">
                {buildFailures.map((c) => (
                  <AlertBanner
                    key={c.token}
                    variant="error"
                    text={`Build failure: ${c.name}${c.business ? ` (${c.business})` : ""}`}
                  />
                ))}
                {upcomingLaunches.map((c) => (
                  <AlertBanner
                    key={c.token}
                    variant="warn"
                    text={`Launch in ${c.daysUntilLaunch}d: ${c.name}${c.business ? ` (${c.business})` : ""} — go-live ${c.goLiveDate}`}
                  />
                ))}
              </div>
            )}

            {/* Step completion rates */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Step completion rates
              </p>
              <div className="mt-2 space-y-1.5">
                {Object.entries(stepCompletionRates).map(([step, pct]) => (
                  <div key={step} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-navy-800">{step}</span>
                      <span className="font-mono text-xs tabular-nums text-navy-600">
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream-100">
                      <div
                        className="h-full rounded-full bg-navy-700 transition-all"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active onboarding table */}
            <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Active onboarding
            </p>
            <div className="mt-2 overflow-x-auto rounded-xl border border-navy-100">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-cream-50 text-[11px] uppercase tracking-wider text-navy-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Customer</th>
                    <th className="px-3 py-2 text-left font-semibold">Steps</th>
                    <th className="px-3 py-2 text-right font-semibold">Days</th>
                    <th className="px-3 py-2 text-right font-semibold">Launch</th>
                    <th className="px-3 py-2 text-right font-semibold">Build</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {onboardingCustomers.map((c) => (
                    <OnboardingRow key={c.token} customer={c} />
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-navy-500">
              Stuck = {">"}7 days with incomplete steps. Red dots = step not done.
            </p>
          </>
        )}
      </div>
    </details>
  );
}

function OnboardingRow({ customer: c }: { customer: OnboardingCustomer }) {
  const rowBg = c.hasBuildFailure
    ? "bg-red-50/40"
    : c.isStuck
      ? "bg-orange-50/40"
      : "";

  return (
    <tr className={rowBg}>
      <td className="px-3 py-2">
        <div className="font-semibold text-navy-900">
          {c.name}
        </div>
        {c.business && (
          <div className="text-xs text-navy-600">{c.business}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <StepDots steps={c.steps} isStuck={c.isStuck} />
        <span className="ml-2 text-xs text-navy-600">
          {c.stepsCompleted}/{c.totalSteps}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <span
          className={[
            "font-mono text-xs tabular-nums",
            c.isStuck ? "font-bold text-red-700" : "text-navy-700",
          ].join(" ")}
        >
          {c.daysInOnboarding}d
        </span>
        {c.isStuck && (
          <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
            stuck
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-navy-700">
        {c.goLiveDate ? (
          <>
            {c.goLiveDate}
            {c.daysUntilLaunch !== null && c.daysUntilLaunch >= 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                {c.daysUntilLaunch}d
              </span>
            )}
          </>
        ) : (
          <span className="text-navy-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {c.hasBuildFailure ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
            failed
          </span>
        ) : c.lastBuildTriggered ? (
          <span className="text-xs text-navy-600">
            {formatRelative(c.lastBuildTriggered)}
          </span>
        ) : (
          <span className="text-xs text-navy-400">—</span>
        )}
      </td>
    </tr>
  );
}

function StepDots({
  steps,
  isStuck,
}: {
  steps: OnboardingCustomer["steps"];
  isStuck: boolean;
}) {
  const labels = ["CF", "DNS", "Tools", "Assets", "Review", "Content"];
  const vals = [
    steps.cloudflare,
    steps.domain,
    steps.tools,
    steps.assets,
    steps.review,
    steps.content,
  ];

  return (
    <span className="inline-flex gap-1">
      {vals.map((done, i) => (
        <span
          key={i}
          title={`${labels[i]}: ${done ? "done" : "pending"}`}
          className={[
            "inline-block h-2.5 w-2.5 rounded-full",
            done
              ? "bg-green-500"
              : isStuck
                ? "bg-red-400"
                : "bg-navy-200",
          ].join(" ")}
        />
      ))}
    </span>
  );
}

function AlertBanner({
  variant,
  text,
}: {
  variant: "error" | "warn";
  text: string;
}) {
  const styles =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm font-medium ${styles}`}
      role="alert"
    >
      {variant === "error" ? "⚠ " : "📅 "}
      {text}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-200 bg-cream-50 p-6 text-sm text-navy-700">
      <p className="font-semibold text-navy-900">All clear</p>
      <p className="mt-1">{message}</p>
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
