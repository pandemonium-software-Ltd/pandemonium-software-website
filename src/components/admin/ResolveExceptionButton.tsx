"use client";

import { useState } from "react";

type Props = {
  exceptionId: string;
  onResolved?: () => void;
};

export default function ResolveExceptionButton({
  exceptionId,
  onResolved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <span className="text-xs font-semibold text-green-700">
        Resolved
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100"
      >
        Resolve
      </button>
    );
  }

  async function submit() {
    if (!notes.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resolve-exception", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId,
          resolutionNotes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      setDone(true);
      onResolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Resolution notes (required)"
        maxLength={2000}
        rows={2}
        className="w-full rounded-lg border border-navy-200 bg-cream-50 px-3 py-2 text-xs text-navy-900 placeholder:text-navy-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
        disabled={busy}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !notes.trim()}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? "Resolving…" : "Confirm resolve"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNotes("");
            setError(null);
          }}
          className="text-xs text-navy-500 hover:text-navy-700"
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
