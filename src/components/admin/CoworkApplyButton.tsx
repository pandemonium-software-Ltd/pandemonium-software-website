"use client";

import { useState } from "react";

type Props = {
  token: string;
  changeRequestId: string;
  compact?: boolean;
};

type ApiResult = {
  success?: boolean;
  outcome?: "applied" | "escalated" | "apply-failed";
  classification?: string;
  confidence?: number;
  reasoning?: string;
  appliedCount?: number;
  appliedTargets?: string[];
  skippedPatches?: Array<{ target: string; reason: string }>;
  rebuildOnly?: boolean;
  buildDispatched?: boolean;
  buildError?: string;
  emailSent?: boolean;
  autoReply?: string;
  message?: string;
  error?: string;
};

export default function CoworkApplyButton({
  token,
  changeRequestId,
  compact,
}: Props) {
  const [state, setState] = useState<
    "idle" | "pending" | "done" | "escalated" | "error"
  >("idle");
  const [result, setResult] = useState<ApiResult | null>(null);

  async function handleApply() {
    setState("pending");
    setResult(null);
    try {
      const res = await fetch("/api/admin/cowork-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, changeRequestId }),
      });
      const json = (await res.json().catch(() => ({}))) as ApiResult;
      if (!res.ok || !json.success) {
        setResult(json);
        setState("error");
        return;
      }
      setResult(json);
      if (json.outcome === "applied") {
        setState("done");
      } else {
        setState("escalated");
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setState("error");
    }
  }

  if (state === "done" && result) {
    const parts: string[] = [];
    if (result.appliedCount && result.appliedCount > 0) {
      parts.push(
        `Applied ${result.appliedCount} patch${result.appliedCount === 1 ? "" : "es"}: ${result.appliedTargets?.join(", ")}`,
      );
    } else if (result.rebuildOnly) {
      parts.push("Rebuild-only (asset refresh)");
    }
    if (result.buildDispatched) parts.push("build dispatched");
    if (result.emailSent) parts.push("customer emailed");
    if (result.skippedPatches && result.skippedPatches.length > 0) {
      parts.push(
        `${result.skippedPatches.length} skipped`,
      );
    }
    return (
      <span
        className={
          compact
            ? "text-[10px] font-semibold text-green-700"
            : "rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-800"
        }
      >
        Done — {parts.join(", ")}
      </span>
    );
  }

  if (state === "escalated" && result) {
    return (
      <span
        className={
          compact
            ? "text-[10px] text-amber-800"
            : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
        }
      >
        {result.message ?? `${result.classification} (${((result.confidence ?? 0) * 100).toFixed(0)}%) — needs manual handling`}
      </span>
    );
  }

  if (state === "error") {
    return (
      <span
        className={
          compact ? "text-[10px] text-red-700" : "text-xs text-red-700"
        }
      >
        {result?.error ?? result?.message ?? "Failed"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleApply}
      disabled={state === "pending"}
      className={
        compact
          ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-900 hover:bg-green-200 disabled:opacity-50"
          : "rounded-lg border-2 border-green-400 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-900 hover:border-green-600 disabled:opacity-50"
      }
      title="Run Haiku now, apply patches, resolve, rebuild, and email the customer — all in one"
    >
      {state === "pending"
        ? "Classifying…"
        : compact
          ? "Push through"
          : "Push through with Cowork"}
    </button>
  );
}
