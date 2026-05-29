"use client";

import Link from "next/link";
import type { OpsException, OpsAuditEntry, PendingAdminAction } from "@/lib/notion-ops";
import ResolveExceptionButton from "./ResolveExceptionButton";
import CoworkRetryButton from "./CoworkRetryButton";
import CoworkApplyButton from "./CoworkApplyButton";

type Props = {
  exceptions: OpsException[];
  recentActions: OpsAuditEntry[];
  unresolvedCount: number;
  actionCounts: { total: number; ok: number; fail: number };
  pendingActions: PendingAdminAction[];
};

export default function OpsActivityPanel({
  exceptions,
  recentActions,
  unresolvedCount,
  actionCounts,
  pendingActions,
}: Props) {
  const totalAttention = pendingActions.length + unresolvedCount;

  return (
    <details className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none" open={totalAttention > 0}>
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Ops activity
          </h2>
          <span className="text-xs text-navy-500">
            {actionCounts.total} action{actionCounts.total !== 1 ? "s" : ""}{" "}
            (24h)
            {totalAttention > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                {totalAttention} need{totalAttention !== 1 ? "" : "s"} attention
              </span>
            )}
          </span>
        </div>
        <ChevronToggle />
      </summary>

      <div className="mt-5">
        {/* Pending admin actions */}
        {pendingActions.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-amber-900">
              Requires your action
              <span className="ml-2 text-xs font-normal text-amber-700">
                {pendingActions.length} pending
              </span>
            </h3>
            <div className="mt-2 divide-y divide-amber-100 rounded-lg border border-amber-200 bg-amber-50/50">
              {pendingActions.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${a.type === "change-request" ? "bg-amber-200 text-amber-900" : "bg-navy-100 text-navy-700"}`}>
                          {a.type === "change-request" ? "Change req" : "Review edit"}
                        </span>
                        <Link
                          href={`/admin/${a.prospectToken}#${a.type === "change-request" ? "cr" : "re"}-${a.id.slice(0, 8)}`}
                          className="truncate text-sm font-medium text-navy-900 underline hover:text-amber-700"
                        >
                          {a.prospectName}
                        </Link>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-navy-600">
                        {a.message}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.type === "change-request" && (
                        <CoworkApplyButton
                          token={a.prospectToken}
                          changeRequestId={a.id}
                          compact
                        />
                      )}
                      <CoworkRetryButton
                        token={a.prospectToken}
                        itemId={a.id}
                        itemKind={a.type === "change-request" ? "cr" : "re"}
                        compact
                      />
                      <span className="text-[10px] text-navy-400">
                        {formatRelative(a.submittedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Unresolved incidents */}
        <h3 className={`text-sm font-semibold text-navy-900 ${pendingActions.length > 0 ? "mt-6" : ""}`}>
          Open incidents
          {unresolvedCount > 0 && (
            <span className="ml-2 text-xs font-normal text-red-700">
              {unresolvedCount} unresolved
            </span>
          )}
        </h3>
        {exceptions.length === 0 ? (
          <p className="mt-2 text-xs text-navy-500">No open incidents.</p>
        ) : (
          <div className="mt-2 divide-y divide-navy-100">
            {exceptions.map((ex) => (
              <div key={ex.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StepBadge step={ex.step} />
                      <span className="truncate text-sm font-medium text-navy-900">
                        {ex.prospectName}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-navy-600">
                      {ex.errorMessage}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ResolveExceptionButton exceptionId={ex.id} />
                    <span className="text-[10px] text-navy-400">
                      {formatRelative(ex.detectedAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent actions */}
        <h3 className="mt-6 text-sm font-semibold text-navy-900">
          Recent actions (24h)
          <span className="ml-2 text-xs font-normal text-navy-500">
            {actionCounts.ok} ok · {actionCounts.fail} fail
          </span>
        </h3>
        {recentActions.length === 0 ? (
          <p className="mt-2 text-xs text-navy-500">
            No actions in the last 24 hours.
          </p>
        ) : (
          <div className="mt-2 max-h-72 divide-y divide-navy-100 overflow-y-auto">
            {recentActions.map((a) => (
              <div key={a.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <StatusDot status={a.status} />
                  <StepBadge step={a.step} />
                  <span className="truncate text-xs text-navy-700">
                    {a.prospectName}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-navy-400">
                    {formatRelative(a.timestamp)}
                  </span>
                </div>
                {a.status !== "skip" && a.notes && (
                  <p className="mt-0.5 truncate pl-7 text-[11px] text-navy-500">
                    {a.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function StepBadge({ step }: { step: string }) {
  return (
    <span className="inline-flex rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">
      {step}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok"
      ? "bg-green-500"
      : status === "fail"
        ? "bg-red-500"
        : "bg-navy-300";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-2 w-2 shrink-0 rounded-full ${color}`}
    />
  );
}

function ChevronToggle() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-navy-400 transition-transform group-open:rotate-180"
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="M5 7l5 5 5-5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
