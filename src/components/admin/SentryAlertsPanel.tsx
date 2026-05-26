// Sentry alerts inbox panel on /admin.
//
// Server-fed list (parent passes the SentryAlertRow[]) but the
// rows themselves are client-interactive so the Resolve button
// can POST + remove the row optimistically.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SentryAlertRow } from "@/lib/d1-sentry";

type Props = {
  alerts: readonly SentryAlertRow[];
};

export default function SentryAlertsPanel({ alerts }: Props) {
  // Optimistic-resolve state — once a row is resolved we hide it
  // immediately, even though the actual D1 write happens async.
  // router.refresh() reconciles after the response lands.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !hidden.has(a.sentry_issue_id));

  // Empty state — render a quiet "all good" panel rather than
  // hiding entirely, so the operator has visual confirmation that
  // the Sentry → admin pipeline is wired and listening. Repeat the
  // "Open in Sentry" link so they can still poke around.
  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-navy-900">
            ✅ Sentry — all quiet
          </h2>
          <a
            href="https://sentry.io/organizations/pandemonium-software-ltd/issues/?statsPeriod=7d&query=is%3Aunresolved"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-navy-700 underline hover:text-navy-900"
          >
            Open in Sentry →
          </a>
        </div>
        <p className="mt-2 text-sm text-navy-700">
          No open alerts. The integration is live — any new Sentry
          alerts will land here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ember-200 bg-ember-50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold text-navy-900">
          🔔 Sentry alerts ({visible.length})
        </h2>
        <a
          href="https://sentry.io/organizations/pandemonium-software-ltd/issues/?statsPeriod=7d&query=is%3Aunresolved"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-navy-700 underline hover:text-navy-900"
        >
          Open in Sentry →
        </a>
      </div>
      <ul className="mt-4 space-y-2">
        {visible.map((a) => (
          <SentryAlertRowItem
            key={a.sentry_issue_id}
            alert={a}
            onResolved={() =>
              setHidden((prev) => new Set(prev).add(a.sentry_issue_id))
            }
          />
        ))}
      </ul>
    </div>
  );
}

function SentryAlertRowItem({
  alert,
  onResolved,
}: {
  alert: SentryAlertRow;
  onResolved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/sentry/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentry_issue_id: alert.sentry_issue_id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Couldn't resolve. Try again.");
        return;
      }
      onResolved();
      router.refresh();
    });
  }

  return (
    <li className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm">
      <LevelBadge level={alert.level} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-navy-900">{alert.title}</p>
        <p className="mt-0.5 text-xs text-navy-600">
          {alert.project_slug ?? "unknown project"}
          {alert.environment ? ` · ${alert.environment}` : ""}
          {" · "}
          {alert.event_count} event
          {alert.event_count === 1 ? "" : "s"}
          {" · last seen "}
          {formatRelative(alert.last_seen_at)}
        </p>
        {error && (
          <p className="mt-1 text-xs text-ember-700" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-none flex-col items-end gap-2">
        <a
          href={alert.sentry_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-navy-700 underline hover:text-navy-900"
        >
          View
        </a>
        <button
          type="button"
          onClick={resolve}
          disabled={pending}
          className="rounded-md bg-navy-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy-700 disabled:bg-navy-400"
        >
          {pending ? "…" : "Resolve"}
        </button>
      </div>
    </li>
  );
}

function LevelBadge({ level }: { level: string }) {
  const palette: Record<string, { bg: string; text: string }> = {
    fatal: { bg: "bg-red-200", text: "text-red-900" },
    error: { bg: "bg-ember-200", text: "text-ember-900" },
    warning: { bg: "bg-amber-100", text: "text-amber-900" },
    info: { bg: "bg-blue-100", text: "text-blue-800" },
    debug: { bg: "bg-navy-100", text: "text-navy-700" },
  };
  const p = palette[level] ?? palette.error;
  return (
    <span
      className={`flex-none rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.bg} ${p.text}`}
    >
      {level}
    </span>
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
