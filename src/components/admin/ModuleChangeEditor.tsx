"use client";

// Operator inline editor for ONE pending module change entry. Lives
// inside /admin/[token]'s server component as a client island.
//
// UX: collapsed by default, shows the diff + money summary. Three
// buttons:
//   - "Mark Stripe done — apply" → operator confirms the
//     charge/refund happened in Stripe, requires a paymentLine
//     ("Your card was charged £39…") that goes verbatim to the
//     customer
//   - "Mark billing failed" → Stripe declined; modules customer
//     was adding get reverted; customer emailed with the
//     payment-method-update template
//   - "Reject" → operator declines the change; selection unchanged,
//     no customer email by default
//
// Resolved entries (status != pending-stripe) render read-only with
// the resolution note + status pill.

import { useState } from "react";
import type { ModuleChangeLogEntry } from "@/lib/notion-prospects";

type Props = {
  token: string;
  entry: ModuleChangeLogEntry;
};

export default function ModuleChangeEditor({ token, entry: initial }: Props) {
  const [entry, setEntry] = useState<ModuleChangeLogEntry>(initial);
  const [pickedAction, setPickedAction] = useState<
    "applied" | "billing-failed" | "rejected" | null
  >(null);
  const [paymentLine, setPaymentLine] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isResolved = entry.status !== "pending-stripe";
  const added = entry.toModules.filter(
    (m) => !entry.fromModules.includes(m),
  );
  const removed = entry.fromModules.filter(
    (m) => !entry.toModules.includes(m),
  );

  async function submit() {
    if (!pickedAction) return;
    if (
      (pickedAction === "applied" || pickedAction === "billing-failed") &&
      !paymentLine.trim()
    ) {
      setError(
        "paymentLine is required — it goes verbatim into the customer's confirmation email.",
      );
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/module-change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          changeId: entry.id,
          action: pickedAction,
          paymentLine: paymentLine.trim() || undefined,
          resolutionNote: resolutionNote.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        entry?: ModuleChangeLogEntry;
        customerNotified?: boolean;
        emailWarning?: string | null;
      };
      if (!res.ok) {
        setError(json.error ?? "Update failed.");
        return;
      }
      if (json.entry) setEntry(json.entry);
      const noteParts: string[] = [`Saved as ${json.entry?.status}.`];
      if (json.customerNotified) noteParts.push("Customer emailed.");
      if (json.emailWarning) noteParts.push(`Email warning: ${json.emailWarning}`);
      setSuccess(noteParts.join(" "));
      setPickedAction(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-xs text-navy-500">
          <span className="font-semibold text-navy-900">
            Submitted {new Date(entry.submittedAt).toLocaleString("en-GB")}
          </span>
          <span className="ml-2 font-mono text-[11px]">
            {entry.id.slice(0, 8)}
          </span>
        </div>
        <StatusPill status={entry.status} />
      </div>

      {/* Diff */}
      <div className="mt-4 grid gap-2 text-sm text-navy-800">
        {added.length > 0 && (
          <p>
            <strong className="text-green-700">+ Added:</strong>{" "}
            {added.join(", ")}
          </p>
        )}
        {removed.length > 0 && (
          <p>
            <strong className="text-ember-700">− Removed:</strong>{" "}
            {removed.join(", ")}
          </p>
        )}
        <p className="text-xs text-navy-600">
          From: {entry.fromModules.join(", ") || "(base only)"}
          <br />
          To: {entry.toModules.join(", ") || "(base only)"}
        </p>
      </div>

      {/* Money */}
      <div className="mt-4 rounded-lg bg-cream-50 p-3 text-sm text-navy-800">
        <p>
          <strong>Setup delta:</strong>{" "}
          {entry.setupDelta > 0
            ? `+£${entry.setupDelta} (CHARGE customer)`
            : entry.setupDelta < 0
              ? `−£${Math.abs(entry.setupDelta)} (REFUND customer)`
              : "no change"}
        </p>
        <p>
          <strong>Monthly delta:</strong>{" "}
          {entry.monthlyDelta > 0
            ? `+£${entry.monthlyDelta}/mo (update Stripe sub)`
            : entry.monthlyDelta < 0
              ? `−£${Math.abs(entry.monthlyDelta)}/mo (update Stripe sub)`
              : "no change"}
        </p>
        <p>
          <strong>New totals:</strong> setup £{entry.newSetupTotal}, monthly £
          {entry.newMonthlyTotal}/mo
        </p>
      </div>

      {/* Resolved state */}
      {isResolved && (
        <div className="mt-4 rounded-lg border border-navy-100 bg-cream-50 p-3 text-sm text-navy-800">
          <p>
            <strong>Resolved {entry.resolvedAt ? new Date(entry.resolvedAt).toLocaleString("en-GB") : ""}</strong>
          </p>
          {entry.resolutionNote && (
            <p className="mt-1 whitespace-pre-wrap text-navy-700">
              {entry.resolutionNote}
            </p>
          )}
        </div>
      )}

      {/* Pending: action picker */}
      {!isResolved && (
        <div className="mt-4 space-y-3">
          {!pickedAction && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPickedAction("applied")}
                className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800"
              >
                Mark Stripe done — apply ✓
              </button>
              <button
                type="button"
                onClick={() => setPickedAction("billing-failed")}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Mark billing failed
              </button>
              <button
                type="button"
                onClick={() => setPickedAction("rejected")}
                className="rounded-lg border-2 border-navy-200 px-3 py-2 text-sm font-semibold text-navy-900 hover:border-navy-400"
              >
                Reject
              </button>
            </div>
          )}

          {pickedAction && (
            <div className="space-y-3 rounded-lg border-2 border-navy-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-600">
                Action: {pickedAction}
              </p>

              {(pickedAction === "applied" ||
                pickedAction === "billing-failed") && (
                <label className="block">
                  <span className="block text-sm font-semibold text-navy-900">
                    Customer-facing payment line *
                  </span>
                  <span className="mt-0.5 block text-xs text-navy-600">
                    {pickedAction === "applied"
                      ? "Goes verbatim into the customer's confirmation email. Be concrete: 'Your card was charged £39 for the Newsletter setup. You'll see it on your statement as MODUFORGE.'"
                      : "What you tried to do, in customer-friendly words: 'charge £39 for the Newsletter module you wanted to add'."}
                  </span>
                  <textarea
                    value={paymentLine}
                    onChange={(e) => setPaymentLine(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="mt-2 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                  />
                </label>
              )}

              <label className="block">
                <span className="block text-sm font-semibold text-navy-900">
                  Internal note (optional)
                </span>
                <span className="mt-0.5 block text-xs text-navy-600">
                  Operator-only. Useful for the audit log + later
                  reconciliation.
                </span>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="mt-2 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              </label>

              {error && (
                <p className="text-sm text-ember-700" role="alert">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickedAction(null);
                    setError(null);
                    setPaymentLine("");
                    setResolutionNote("");
                  }}
                  disabled={pending}
                  className="rounded-lg border-2 border-navy-200 px-3 py-2 text-sm font-semibold text-navy-900 hover:border-navy-400 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save resolution"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {success && (
        <p className="mt-3 text-sm text-green-700" role="status">
          {success}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ModuleChangeLogEntry["status"] }) {
  const palette: Record<
    ModuleChangeLogEntry["status"],
    { bg: string; text: string; label: string }
  > = {
    "pending-stripe": {
      bg: "bg-amber-100",
      text: "text-amber-900",
      label: "Pending Stripe",
    },
    applied: {
      bg: "bg-green-100",
      text: "text-green-900",
      label: "Applied",
    },
    rejected: {
      bg: "bg-navy-100",
      text: "text-navy-700",
      label: "Rejected",
    },
    "billing-failed": {
      bg: "bg-ember-100",
      text: "text-ember-900",
      label: "Billing failed",
    },
  };
  const p = palette[status];
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.bg} ${p.text}`}
    >
      {p.label}
    </span>
  );
}
