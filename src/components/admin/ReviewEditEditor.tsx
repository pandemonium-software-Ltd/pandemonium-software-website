"use client";

// Per-review-edit operator action panel for /admin/[token].
// Mirrors ChangeRequestEditor but for the pre-commit (Hub Step 5)
// review-edit inbox. Two actions:
//   - approve: flips status to "applied" + dispatches a fresh
//     LIVE build to deploy whatever's currently in Notion. The
//     customer gets the review-edit-applied email when the build
//     callback fires.
//   - reject: flips status to "rejected" + emails the customer
//     using the change-request-rejected template (operator's
//     reply included verbatim). Customer's allowance increments
//     back since the edit didn't consume a slot.

import { useState } from "react";

type ReviewEditView = {
  id: string;
  message: string;
  status: "submitted" | "applied" | "rejected";
  resolvedAt?: string;
  adminReply?: string;
  coworkClassification?: "in_scope" | "out_of_scope" | "ambiguous";
  coworkConfidence?: number;
  coworkReasoning?: string;
  coworkPatch?: {
    target: string;
    newValue?: unknown;
    previousValue?: unknown;
    serviceName?: string;
    faqQuestion?: string;
  };
  coworkPatchAppliedAt?: string;
  coworkEscalatedAt?: string;
};

type Props = {
  token: string;
  edit: ReviewEditView;
};

export default function ReviewEditEditor({ token, edit }: Props) {
  const [current, setCurrent] = useState(edit);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState<"none" | "approve" | "reject">("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isClosed = current.status !== "submitted";

  async function submit(action: "approve" | "reject") {
    if (action === "reject" && !reply.trim()) {
      setError(
        "Add a reply explaining why — that's what the customer sees on their dashboard.",
      );
      return;
    }
    setError(null);
    setSuccess(null);
    setPending(action);
    try {
      const res = await fetch("/api/admin/review-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          editId: current.id,
          action,
          reply: reply.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        action?: "approve" | "reject";
        build?: { dispatched: true } | { dispatched: false; reason: string } | null;
        customerNotified?: boolean | null;
        emailWarning?: string | null;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Save failed. Try again.");
        return;
      }
      setCurrent((c) => ({
        ...c,
        status: action === "approve" ? "applied" : "rejected",
        resolvedAt: new Date().toISOString(),
        adminReply: reply.trim() || c.adminReply,
      }));
      const parts: string[] = [`${action === "approve" ? "Approved" : "Rejected"}.`];
      if (action === "approve") {
        if (json.build?.dispatched) {
          parts.push("Build dispatched — customer email lands when it completes.");
        } else if (json.build && !json.build.dispatched) {
          parts.push(`Build skipped: ${json.build.reason}`);
        }
      } else {
        if (json.customerNotified) parts.push("Customer emailed.");
        else if (json.emailWarning) parts.push(`Email FAILED (${json.emailWarning}).`);
      }
      setSuccess(parts.join(" "));
      setTimeout(() => setSuccess(null), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending("none");
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Cowork's analysis */}
      {(current.coworkClassification ||
        current.coworkReasoning ||
        current.coworkPatch) && (
        <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-xs">
          <p className="font-semibold uppercase tracking-wider text-amber-900">
            Cowork&apos;s take
            {current.coworkConfidence !== undefined && (
              <span className="ml-2 font-mono text-[10px]">
                ({current.coworkClassification},{" "}
                {(current.coworkConfidence * 100).toFixed(0)}% confidence)
              </span>
            )}
          </p>
          {current.coworkReasoning && (
            <p className="mt-1.5 text-amber-900">{current.coworkReasoning}</p>
          )}
          {current.coworkPatch && (
            <div className="mt-2 rounded border border-amber-200 bg-white p-2 font-mono text-[11px] text-navy-800">
              <p>
                <strong>Suggested target:</strong> {current.coworkPatch.target}
              </p>
              <p className="mt-0.5">
                <strong>New value:</strong>{" "}
                <span className="break-all">
                  {String(current.coworkPatch.newValue)}
                </span>
              </p>
              {current.coworkPatch.previousValue !== undefined && (
                <p className="mt-0.5">
                  <strong>Was:</strong>{" "}
                  <span className="break-all">
                    {String(current.coworkPatch.previousValue) || "(empty)"}
                  </span>
                </p>
              )}
            </div>
          )}
          {current.coworkPatchAppliedAt && (
            <p className="mt-1.5 text-amber-900">
              ✓ Patch applied to Notion{" "}
              <span className="text-[10px]">
                {new Date(current.coworkPatchAppliedAt).toLocaleString()}
              </span>
              . Approve below to dispatch the deploy.
            </p>
          )}
        </div>
      )}

      {isClosed ? (
        <div className="rounded-lg border border-navy-100 bg-cream-50 p-3 text-sm">
          <p className="font-semibold text-navy-900">
            {current.status === "applied" ? "Approved ✓" : "Rejected"}
            {current.resolvedAt && (
              <span className="ml-2 text-xs font-normal text-navy-500">
                {new Date(current.resolvedAt).toLocaleString()}
              </span>
            )}
          </p>
          {current.adminReply && (
            <p className="mt-1.5 whitespace-pre-wrap text-navy-700">
              {current.adminReply}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to the customer (required for reject; optional for approve)…"
            rows={3}
            disabled={pending !== "none"}
            className="w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => submit("approve")}
              disabled={pending !== "none"}
              className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {pending === "approve"
                ? "Approving…"
                : current.coworkPatchAppliedAt
                  ? "Approve & deploy"
                  : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => submit("reject")}
              disabled={pending !== "none"}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-300 bg-white px-4 py-1.5 text-xs font-semibold text-red-800 hover:border-red-400 disabled:opacity-50"
            >
              {pending === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </div>
      )}

      {success && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-800"
        >
          {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-ember-200 bg-ember-50 p-2 text-xs text-ember-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
