"use client";

import type {
  RunMetrics,
  CronHealthEntry,
  DeploymentEntry,
} from "@/lib/admin-metrics";

type Props = { metrics: RunMetrics };

export default function RunMonitorPanel({ metrics }: Props) {
  const {
    liveSites,
    zoneStatusBreakdown,
    cronHealth,
    gbpIssues,
    sentryOpen,
    sentryResolved,
    deployment,
    payment,
    r2,
  } = metrics;

  const nonActiveSites = liveSites.filter((s) => s.zoneStatus !== "active");

  const headlineAlerts =
    deployment.failed.length +
    payment.billingFailures.length +
    (sentryOpen > 0 ? 1 : 0);

  return (
    <details className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Run monitoring
          </h2>
          <span className="text-xs text-navy-500">
            {liveSites.length} live site{liveSites.length !== 1 ? "s" : ""}
            {deployment.inProgress.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                {deployment.inProgress.length} building
              </span>
            )}
            {headlineAlerts > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                {headlineAlerts} alert{headlineAlerts !== 1 ? "s" : ""}
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

        {/* Deployment / build status */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Deployments
            </p>
            <span className="text-[11px] text-navy-500">
              {deployment.liveCount} live · {deployment.inProgress.length}{" "}
              building · {deployment.failed.length} failed
            </span>
          </div>

          {deployment.inProgress.length > 0 && (
            <ul className="mt-2 space-y-1">
              {deployment.inProgress.map((d) => (
                <DeploymentRow key={d.token} entry={d} tint="building" />
              ))}
            </ul>
          )}

          {deployment.failed.length > 0 && (
            <ul className="mt-2 space-y-1">
              {deployment.failed.map((d) => (
                <DeploymentRow key={d.token} entry={d} tint="failed" />
              ))}
            </ul>
          )}

          {deployment.inProgress.length === 0 &&
            deployment.failed.length === 0 && (
              <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                No builds in progress or failed — pipeline quiet.
              </p>
            )}

          {deployment.recent.length > 0 && (
            <details className="mt-2 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
              <summary className="cursor-pointer select-none text-[11px] font-semibold text-navy-500 hover:text-navy-700">
                Recent builds ({deployment.recent.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {deployment.recent.map((d) => (
                  <DeploymentRow key={d.token} entry={d} tint="neutral" />
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Stripe payment health */}
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
            Payment health
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Paying"
              value={payment.payingCustomers}
              variant="neutral"
            />
            <StatTile
              label="Subscriptions"
              value={payment.activeSubscriptions}
              variant={
                payment.missingSubscription.length > 0 ? "warn" : "ok"
              }
            />
            <StatTile
              label="Billing fails"
              value={payment.billingFailures.length}
              variant={payment.billingFailures.length > 0 ? "warn" : "ok"}
            />
            <StatTile label="MRR" value={payment.totalMrr} variant="ok" />
          </div>

          {payment.billingFailures.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
                Billing failures — payment method needs updating
              </p>
              <ul className="mt-2 space-y-1">
                {payment.billingFailures.map((b) => (
                  <li
                    key={`${b.token}-${b.failedAt}`}
                    className="rounded-lg bg-red-50 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-navy-900">
                      {b.name}
                    </span>
                    {b.modules.length > 0 && (
                      <span className="ml-2 text-xs text-navy-600">
                        {b.modules.join(", ")}
                      </span>
                    )}
                    <span className="ml-2 text-xs text-red-700">
                      {formatRelative(b.failedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {payment.missingSubscription.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Paid but no subscription recorded
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {payment.missingSubscription.map((m) => (
                  <span
                    key={m.token}
                    className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {payment.pendingStripeOps.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                Pending Stripe changes
              </p>
              <ul className="mt-2 space-y-1">
                {payment.pendingStripeOps.map((o, i) => (
                  <li
                    key={`${o.token}-${i}`}
                    className="flex items-center gap-2 rounded-lg bg-cream-50 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-navy-900">
                      {o.name}
                    </span>
                    <span className="text-xs text-navy-600">{o.summary}</span>
                    {o.effectiveDate && (
                      <span className="ml-auto text-[11px] text-navy-500">
                        effective {o.effectiveDate}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* R2 storage usage */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              R2 storage
            </p>
            {r2 && (
              <span className="text-[11px] text-navy-500">
                {formatBytes(r2.totalBytes)} · {r2.objectCount} object
                {r2.objectCount !== 1 ? "s" : ""}
                {r2.truncated && " (truncated)"}
              </span>
            )}
          </div>
          {!r2 ? (
            <p className="mt-2 rounded-lg bg-cream-50 px-3 py-2 text-sm text-navy-600">
              Storage data unavailable (R2 binding not reachable).
            </p>
          ) : r2.perCustomer.length === 0 ? (
            <p className="mt-2 rounded-lg bg-cream-50 px-3 py-2 text-sm text-navy-600">
              Bucket is empty.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {r2.perCustomer.slice(0, 12).map((c) => (
                <li
                  key={c.token}
                  className="flex items-center gap-3 rounded-lg bg-cream-50 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-navy-900">{c.name}</span>
                  <span className="text-xs text-navy-500">
                    {c.objects} file{c.objects !== 1 ? "s" : ""}
                  </span>
                  <span className="ml-auto font-mono text-xs text-navy-700">
                    {formatBytes(c.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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

function DeploymentRow({
  entry,
  tint,
}: {
  entry: DeploymentEntry;
  tint: "building" | "failed" | "neutral";
}) {
  const bg =
    tint === "building"
      ? "bg-blue-50"
      : tint === "failed"
        ? "bg-red-50"
        : "bg-cream-50";

  const stateBadge =
    entry.state === "in-progress"
      ? "bg-blue-100 text-blue-800"
      : entry.state === "failed"
        ? "bg-red-100 text-red-800"
        : entry.state === "live"
          ? "bg-green-100 text-green-800"
          : "bg-navy-100 text-navy-700";

  return (
    <li className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${bg}`}>
      <span className="font-semibold text-navy-900">{entry.name}</span>
      {entry.kind && (
        <span className="text-[11px] text-navy-500">{entry.kind}</span>
      )}
      {entry.lastBuildAt && (
        <span className="text-[11px] text-navy-500">
          {formatRelative(entry.lastBuildAt)}
        </span>
      )}
      <span
        className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateBadge}`}
      >
        {entry.state}
      </span>
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
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
