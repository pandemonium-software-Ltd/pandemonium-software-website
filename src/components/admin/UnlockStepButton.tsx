"use client";

// Tiny inline button for /admin/[token] that unlocks a completed
// onboarding step. Same shape as the other admin micro-controls
// (single POST → optimistic UI → reload on success).

import { useState } from "react";

type Props = {
  token: string;
  stepId: string;
  stepLabel: string;
};

export default function UnlockStepButton({ token, stepId, stepLabel }: Props) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function unlock() {
    if (!confirm(`Unlock the "${stepLabel}" step? The customer will be able to edit it again.`)) {
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/unlock-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, stepId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setErr(json.error ?? "Unlock failed. Try again.");
        return;
      }
      setDone(true);
      // Reload so the dot turns back into a number and any other
      // dependent UI (status badge, isHubComplete logic) updates.
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <span className="text-[10px] font-semibold text-green-700">
        ✓ Unlocked
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={unlock}
        disabled={pending}
        title={`Unlock ${stepLabel}`}
        className="text-[10px] font-semibold text-navy-500 underline decoration-dotted underline-offset-2 hover:text-ember-700 disabled:opacity-50"
      >
        {pending ? "Unlocking…" : "unlock"}
      </button>
      {err && (
        <span
          role="alert"
          className="ml-1 text-[10px] font-medium text-ember-700"
        >
          {err}
        </span>
      )}
    </>
  );
}
