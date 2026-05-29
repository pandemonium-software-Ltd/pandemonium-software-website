"use client";

import { useState } from "react";

type Props = {
  token: string;
  itemId: string;
  itemKind: "cr" | "re";
  compact?: boolean;
};

export default function CoworkRetryButton({
  token,
  itemId,
  itemKind,
  compact,
}: Props) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRetry() {
    setState("pending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cowork-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, itemId, itemKind }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setErrorMsg(json.error ?? "Retry failed");
        setState("error");
        return;
      }
      setState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span
        className={
          compact
            ? "text-[10px] font-semibold text-green-700"
            : "rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-800"
        }
      >
        Queued — Cowork will re-classify on the next tick (~60s)
      </span>
    );
  }

  if (state === "error") {
    return (
      <span
        className={
          compact
            ? "text-[10px] text-red-700"
            : "text-xs text-red-700"
        }
      >
        {errorMsg}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={state === "pending"}
      className={
        compact
          ? "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-50"
          : "rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:border-amber-500 disabled:opacity-50"
      }
      title="Clear Cowork's latch and let the cron re-classify from scratch"
    >
      {state === "pending"
        ? "Resetting…"
        : compact
          ? "Retry"
          : "Ask Cowork to retry"}
    </button>
  );
}
