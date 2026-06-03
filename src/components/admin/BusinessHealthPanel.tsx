"use client";

import type { BusinessHealth } from "@/lib/admin-metrics";

type Props = { health: BusinessHealth };

const STATUS_DOT: Record<string, string> = {
  ok: "bg-green-500",
  pass: "bg-green-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  fail: "bg-red-500",
  unknown: "bg-navy-300",
};

const STATUS_BG: Record<string, string> = {
  ok: "border-green-300",
  pass: "border-green-300",
  warn: "border-amber-300",
  error: "border-red-300",
  fail: "border-red-300",
  unknown: "border-navy-200",
};

function dot(status: string) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-2 w-2 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT.unknown}`}
    />
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function BusinessHealthPanel({ health }: Props) {
  const { gdpr, ci, audit, secrets, overallStatus } = health;
  const gdprIssues = gdpr.overdueScrubs.length + gdpr.pendingScrubs.filter((s) => s.daysUntil < 7).length;
  const secretWarnings = secrets.filter((s) => s.status !== "ok").length;

  return (
    <details className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Business health
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-navy-500">
            {dot(overallStatus)}
            {overallStatus === "ok" ? "All clear" : overallStatus === "warn" ? "Needs attention" : "Action required"}
            {gdprIssues > 0 && (
              <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                {gdprIssues} GDPR
              </span>
            )}
            {secretWarnings > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                {secretWarnings} secret{secretWarnings !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        </div>
        <ChevronToggle />
      </summary>

      <div className="mt-5 space-y-6">
        {/* Top-level status strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            label="GDPR compliance"
            status={gdpr.overdueScrubs.length > 0 ? "error" : gdpr.pendingScrubs.some((s) => s.daysUntil < 7) ? "warn" : "ok"}
            detail={gdpr.overdueScrubs.length > 0
              ? `${gdpr.overdueScrubs.length} overdue scrub${gdpr.overdueScrubs.length !== 1 ? "s" : ""}`
              : `${gdpr.activeDataSubjects} active subjects`}
          />
          <StatusCard
            label="CI health"
            status={ci.status === "unknown" ? "unknown" : ci.status}
            detail={ci.lastRan ? `Last: ${relativeTime(ci.lastRan)}` : "No runs yet"}
          />
          <StatusCard
            label="Security audit"
            status={audit.status}
            detail={audit.lastAuditDate ? `${relativeTime(audit.lastAuditDate)} (${audit.fixed}/${audit.findings} fixed)` : "No audit on record"}
          />
          <StatusCard
            label="Secret rotation"
            status={secretWarnings > 0 ? (secrets.some((s) => s.status === "error") ? "error" : "warn") : "ok"}
            detail={secretWarnings > 0 ? `${secretWarnings} need rotation` : "All current"}
          />
        </div>

        {/* GDPR detail */}
        <Section title="GDPR compliance">
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniStat label="Active data subjects" value={gdpr.activeDataSubjects} />
            <MiniStat label="Pending scrubs" value={gdpr.pendingScrubs.length} variant={gdpr.pendingScrubs.some((s) => s.daysUntil < 7) ? "warn" : "neutral"} />
            <MiniStat label="Completed scrubs" value={gdpr.completedScrubs} />
          </div>
          {gdpr.overdueScrubs.length > 0 && (
            <div className="mt-3 rounded-lg border-2 border-red-200 bg-red-50/50 p-3">
              <p className="text-xs font-semibold text-red-800">Overdue data scrubs</p>
              {gdpr.overdueScrubs.map((s) => (
                <p key={s.token} className="mt-1 text-xs text-red-700">
                  {s.name} — {s.daysOverdue}d overdue (due {s.retentionUntil})
                </p>
              ))}
            </div>
          )}
          {gdpr.pendingScrubs.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-navy-600">Upcoming scrubs</p>
              {gdpr.pendingScrubs.map((s) => (
                <p key={s.token} className={`text-xs ${s.daysUntil < 7 ? "font-semibold text-amber-700" : "text-navy-600"}`}>
                  {s.name} — in {s.daysUntil}d ({s.retentionUntil})
                </p>
              ))}
            </div>
          )}
        </Section>

        {/* CI detail */}
        <Section title="CI health checks">
          {ci.lastRan ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <MiniStat
                label="npm audit"
                value={ci.npmAudit ? ci.npmAudit.status : "—"}
                variant={ci.npmAudit?.critical ? "error" : ci.npmAudit?.high ? "warn" : "ok"}
                sub={ci.npmAudit ? `${ci.npmAudit.critical}C / ${ci.npmAudit.high}H` : undefined}
              />
              <MiniStat
                label="TypeScript"
                value={ci.typecheck?.status ?? "—"}
                variant={ci.typecheck?.status === "pass" ? "ok" : "error"}
              />
              <MiniStat
                label="Tests"
                value={ci.tests ? `${ci.tests.passed} passed` : "—"}
                variant={ci.tests?.status === "pass" ? "ok" : "error"}
                sub={ci.tests?.failed ? `${ci.tests.failed} failed` : undefined}
              />
              <MiniStat
                label="Outdated (major)"
                value={ci.majorOutdated}
                variant={ci.majorOutdated > 2 ? "warn" : "ok"}
              />
            </div>
          ) : (
            <p className="text-xs text-navy-500">
              No CI runs recorded yet. The weekly security-check workflow will populate this automatically.
            </p>
          )}
        </Section>

        {/* Secret rotation */}
        <Section title="Secret rotation">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {secrets.map((s) => (
              <div
                key={s.key}
                className={`rounded-lg border-2 p-2.5 text-xs ${STATUS_BG[s.status] ?? STATUS_BG.unknown}`}
              >
                <div className="flex items-center gap-1.5">
                  {dot(s.status)}
                  <span className="font-mono font-semibold text-navy-800">{s.key}</span>
                </div>
                <p className="mt-0.5 text-navy-500">
                  {s.lastRotated === "unknown" ? "Never recorded" : `${relativeTime(s.lastRotated)} (${s.daysAgo}d)`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-navy-400">
            Green &lt; 6 months. Amber 6-12 months. Red &gt; 12 months. Record rotation via POST /api/internal/health-callback.
          </p>
        </Section>

        {/* Audit history */}
        <Section title="Security audit">
          {audit.lastAuditDate ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <MiniStat label="Last audit" value={relativeTime(audit.lastAuditDate)} variant={audit.status} />
              <MiniStat label="Findings" value={audit.findings} />
              <MiniStat label="Fixed" value={audit.fixed} variant="ok" />
              <MiniStat label="Accepted" value={audit.accepted} />
            </div>
          ) : (
            <p className="text-xs text-navy-500">No audit on record.</p>
          )}
          <p className="mt-2 text-[10px] text-navy-400">
            Green &lt; 90 days. Amber 90-180 days. Red &gt; 180 days. Next audit recommended quarterly.
          </p>
        </Section>
      </div>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500">{title}</p>
      {children}
    </div>
  );
}

function StatusCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <div className={`rounded-xl border-2 bg-white p-3 text-sm ${STATUS_BG[status] ?? STATUS_BG.unknown}`}>
      <div className="flex items-center gap-2">
        {dot(status)}
        <span className="font-semibold text-navy-900">{label}</span>
      </div>
      <p className="mt-1 truncate text-xs text-navy-600">{detail}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  variant = "neutral",
  sub,
}: {
  label: string;
  value: string | number;
  variant?: string;
  sub?: string;
}) {
  const textColor =
    variant === "error" || variant === "fail" ? "text-red-700"
    : variant === "warn" ? "text-amber-700"
    : variant === "ok" || variant === "pass" ? "text-green-700"
    : "text-navy-900";

  return (
    <div className="rounded-lg bg-cream-50 p-2.5">
      <p className={`font-mono text-lg font-bold ${textColor}`}>
        {typeof value === "number" ? value.toLocaleString("en-GB") : value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-500">{label}</p>
      {sub && <p className="text-[10px] text-navy-400">{sub}</p>}
    </div>
  );
}

function ChevronToggle() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-navy-400 transition-transform group-open:rotate-180"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
