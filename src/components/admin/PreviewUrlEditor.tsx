"use client";

// Operator panel in /admin/[token] for setting a customer's
// preview URL. Lives as a client island inside the server component.
//
// Three render states:
//   - "request not yet received" → muted info card (nothing to do)
//   - "request received, no URL yet" → highlighted input + Send button
//   - "URL already set" → shows current URL + Update / Clear buttons
//
// On Send: PATCH /api/admin/preview-url. If first-set, server fires
// the customer's preview-ready email automatically.

import { useState } from "react";

type Props = {
  token: string;
  /** ISO-8601 timestamp the customer requested the preview, or
   *  undefined if they haven't yet. Drives the empty-state vs
   *  active-state rendering. */
  previewSubmittedAt: string | undefined;
  /** Currently-set preview URL, or empty string. */
  currentPreviewUrl: string;
};

export default function PreviewUrlEditor({
  token,
  previewSubmittedAt,
  currentPreviewUrl: initial,
}: Props) {
  const [currentUrl, setCurrentUrl] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState<"none" | "send" | "clear">("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function send() {
    setError(null);
    setSuccess(null);
    if (draft.trim().length === 0) {
      setError("Paste a preview URL first.");
      return;
    }
    setPending("send");
    try {
      const res = await fetch("/api/admin/preview-url", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, previewUrl: draft.trim() }),
      });
      const json = (await res.json()) as {
        error?: string;
        previewUrl?: string | null;
        customerNotified?: boolean;
        emailWarning?: string | null;
      };
      if (!res.ok) {
        setError(json.error ?? "Update failed.");
        return;
      }
      setCurrentUrl(json.previewUrl ?? "");
      const parts = ["URL saved."];
      if (json.customerNotified) parts.push("Customer emailed.");
      if (json.emailWarning) parts.push(`Email warning: ${json.emailWarning}`);
      setSuccess(parts.join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending("none");
    }
  }

  async function clear() {
    if (
      !window.confirm(
        "Clear the preview URL? The customer will lose access to the preview iframe (their hub falls back to the 'preview being built' state).",
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    setPending("clear");
    try {
      const res = await fetch("/api/admin/preview-url", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, previewUrl: "" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Clear failed.");
        return;
      }
      setCurrentUrl("");
      setDraft("");
      setSuccess("URL cleared. No customer email sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending("none");
    }
  }

  // --- Render: customer hasn't requested preview yet ---
  if (!previewSubmittedAt) {
    return (
      <div className="rounded-xl border border-navy-100 bg-cream-50 p-5 shadow-card">
        <h3 className="font-serif text-base font-semibold text-navy-900">
          Preview URL
        </h3>
        <p className="mt-2 text-sm text-navy-700">
          Customer hasn&apos;t requested their preview yet. Once they
          click &ldquo;Request site preview&rdquo; in their hub, this
          panel unlocks and you&apos;ll get a notification email.
        </p>
      </div>
    );
  }

  // --- Render: request received, awaiting URL or already set ---
  return (
    <div
      className={`rounded-xl border-2 p-5 shadow-card ${
        currentUrl
          ? "border-green-200 bg-white"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-serif text-base font-semibold text-navy-900">
          Preview URL
        </h3>
        <span className="text-xs text-navy-600">
          Requested {new Date(previewSubmittedAt).toLocaleString("en-GB")}
        </span>
      </div>

      {currentUrl ? (
        <p className="mt-2 text-sm text-navy-700">
          Current preview URL is set. Customer&apos;s hub Step 5 is in
          Phase 3 (iframe + edits + commit unlocked).
        </p>
      ) : (
        <p className="mt-2 text-sm text-navy-700">
          <strong>Action needed:</strong> build the preview site,
          deploy it (subdomain / Vercel preview / Loom mockup), then
          paste the HTTPS URL below. Saving fires the customer email
          + flips their hub Step 5 to Phase 3.
        </p>
      )}

      <label className="mt-4 block">
        <span className="block text-sm font-semibold text-navy-900">
          Preview URL (HTTPS only)
        </span>
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://abc-preview.modu-forge.co.uk"
          disabled={pending !== "none"}
          className="mt-2 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 font-mono text-sm text-navy-900 outline-none focus:border-navy-900"
        />
      </label>

      {error && (
        <p className="mt-3 text-sm text-ember-700" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-green-700" role="status">
          {success}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending !== "none" || draft.trim() === currentUrl.trim()}
          className="rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
        >
          {pending === "send"
            ? "Saving…"
            : currentUrl
              ? "Update URL"
              : "Save + email customer"}
        </button>
        {currentUrl && (
          <>
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border-2 border-navy-200 px-3 py-2 text-sm font-semibold text-navy-900 hover:border-navy-400"
            >
              Open preview ↗
            </a>
            <button
              type="button"
              onClick={clear}
              disabled={pending !== "none"}
              className="rounded-lg border-2 border-ember-200 px-3 py-2 text-sm font-semibold text-ember-700 hover:bg-ember-50 disabled:opacity-50"
            >
              {pending === "clear" ? "Clearing…" : "Clear"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
