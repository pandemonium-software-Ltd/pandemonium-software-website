"use client";

// Operator inline editor for one ChangeRequest, lives inside
// /admin/[token]'s server component as a client island.
//
// UX:
//   - Status pill = current state, RAG-coloured (red/amber/green/grey)
//   - "Update status" expands a small form with status select + reply
//     textarea + Save button
//   - On Save: PATCH /api/admin/change-request → if Notion update
//     succeeds and the request transitioned to terminal, the customer
//     also gets an email (server side handles that)
//   - Local state updates from the response so the UI reflects the
//     new state without a page reload

import { useState } from "react";
import type { ChangeRequest } from "@/lib/notion-prospects";
import RAGStatus from "@/components/RAGStatus";

type Props = {
  token: string;
  request: ChangeRequest;
};

const STATUS_OPTIONS: ChangeRequest["status"][] = [
  "pending",
  "in-progress",
  "resolved",
  "rejected",
];

export default function ChangeRequestEditor({ token, request }: Props) {
  const [current, setCurrent] = useState<ChangeRequest>(request);
  const [editing, setEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<ChangeRequest["status"]>(
    request.status,
  );
  const [draftReply, setDraftReply] = useState(request.reply ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isTerminal =
    current.status === "resolved" || current.status === "rejected";

  function startEdit() {
    setDraftStatus(current.status);
    setDraftReply(current.reply ?? "");
    setError(null);
    setSuccess(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
    setSuccess(null);
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    if (
      (draftStatus === "resolved" || draftStatus === "rejected") &&
      !draftReply.trim()
    ) {
      setError(
        "Resolving or rejecting needs a reply — the customer sees this on their dashboard + email.",
      );
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/admin/change-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          changeRequestId: current.id,
          status: draftStatus,
          reply: draftReply.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        request?: ChangeRequest;
        customerNotified?: boolean;
        emailWarning?: string | null;
        rebuild?:
          | { dispatched: true; via: string }
          | { dispatched: false; reason: string }
          | null;
        error?: string;
      };
      if (!res.ok || !json.success || !json.request) {
        setError(json.error ?? "Save failed. Try again.");
        return;
      }
      setCurrent(json.request);
      setEditing(false);
      // Compose a single success line that summarises EVERY side
      // effect of this save (Notion, customer email, rebuild). The
      // operator can scan one line + know whether anything needs
      // manual follow-up.
      const parts: string[] = ["Saved."];
      if (json.customerNotified) {
        parts.push("Customer emailed.");
      } else if (json.emailWarning) {
        parts.push(`Customer email FAILED (${json.emailWarning}).`);
      }
      if (json.rebuild?.dispatched) {
        parts.push("Site rebuild dispatched — preview live in ~90s.");
      } else if (json.rebuild && !json.rebuild.dispatched) {
        parts.push(`Rebuild skipped: ${json.rebuild.reason}`);
      }
      setSuccess(parts.join(" "));
      // Clear success after a few seconds so it doesn't linger.
      // 8s instead of 5s because the longer rebuild messages need
      // a moment to read.
      setTimeout(() => setSuccess(null), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* RAG status row */}
      <div className="flex items-center gap-3">
        <RAGStatus status={current.status} />
        {current.resolvedAt && (
          <span className="text-xs text-navy-500">
            {isTerminal ? "Closed" : "Updated"}{" "}
            {formatDateTime(current.resolvedAt)}
          </span>
        )}
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="ml-auto rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-700"
          >
            {current.reply ? "Edit reply / status" : "Update status"}
          </button>
        )}
      </div>

      {/* Read-only reply (when not editing) */}
      {!editing && current.reply && (
        <div className="rounded-lg bg-cream-50 p-3 text-xs text-navy-700">
          <p className="mb-1 font-semibold uppercase tracking-wider text-navy-500">
            Reply sent to customer
          </p>
          <p className="whitespace-pre-wrap text-sm text-navy-800">
            {current.reply}
          </p>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="rounded-xl border-2 border-navy-200 bg-cream-50 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-navy-600">
                Status
              </span>
              <select
                value={draftStatus}
                onChange={(e) =>
                  setDraftStatus(e.target.value as ChangeRequest["status"])
                }
                disabled={pending}
                className="mt-1 rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-navy-600">
              Reply to customer
              {(draftStatus === "resolved" || draftStatus === "rejected") && (
                <span className="ml-1 text-ember-600">required</span>
              )}
            </span>
            <textarea
              value={draftReply}
              onChange={(e) => setDraftReply(e.target.value)}
              disabled={pending}
              rows={4}
              maxLength={5000}
              placeholder={
                draftStatus === "resolved"
                  ? "Done — your phone number is updated. Refresh your site to see it live."
                  : draftStatus === "rejected"
                    ? "I've quoted this separately because it's out of scope for the monthly allowance — see my email."
                    : "Optional note for the customer (won't trigger an email yet)…"
              }
              className="mt-1 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
            />
            <span className="mt-1 block text-[11px] text-navy-500">
              Goes verbatim into the customer&apos;s dashboard and (if
              status flips to resolved/rejected) into their email.
            </span>
          </label>

          {error && (
            <p className="mt-3 text-sm text-ember-700" role="alert">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="rounded-lg border-2 border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:border-navy-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {success && (
        <p className="text-xs text-green-700" role="status">
          {success}
        </p>
      )}
    </div>
  );
}

// ---------- Status labels (for the editor's <select>) ----------

const LABEL: Record<ChangeRequest["status"], string> = {
  pending: "Pending",
  "in-progress": "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
  retracted: "Retracted",
};

// ---------- Helpers ----------

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
