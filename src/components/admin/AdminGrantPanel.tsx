"use client";

// Admin "monthly allowance" grant panel — lives on /admin/[token]
// above the change-requests inbox.
//
// For each of the three monthly caps a customer faces, shows:
//   - The default cap (e.g. "2 free-text change requests / month")
//   - Current bonus granted by admin this month (e.g. "+1")
//   - Effective cap (default + bonus)
//   - Buttons to grant +1 / -1 (clamped at 0)
//
// Each button POSTs to /api/admin/grant-allowance which patches the
// prospect's onboardingData.adminGrants[YYYY-MM][kind]. Resets at
// month rollover (no cron — the lookup just reads the current
// month key).
//
// UX notes:
//   - Optimistic UI: increment locally on click, revert on failure.
//   - Plus button is the primary action; minus is small + secondary
//     so accidental clawbacks are hard.
//   - Toast-style success line at the bottom for paper trail.

import { useState } from "react";

type GrantKind = "changeRequests" | "offers" | "newsletters";

type Row = {
  kind: GrantKind;
  label: string;
  defaultCap: number;
  helper: string;
};

const ROWS: Row[] = [
  {
    kind: "changeRequests",
    label: "Free-text change requests",
    defaultCap: 2,
    helper:
      "Customer's monthly allowance for the &ldquo;Submit a change&rdquo; form on /account/[token].",
  },
  {
    kind: "offers",
    label: "Offer updates",
    defaultCap: 2,
    helper:
      "Monthly cap on changes to the homepage promotional strip (the Offers module).",
  },
  {
    kind: "newsletters",
    label: "Newsletter sends",
    defaultCap: 2,
    helper:
      "Monthly cap on broadcast sends from the Newsletter composer.",
  },
];

type Props = {
  token: string;
  /** Initial bonus values from the prospect's onboardingData.
   *  Server-rendered so the panel reflects the live state on load. */
  initialBonuses: Record<GrantKind, number>;
  /** Current YYYY-MM key — passed in so the server + client agree
   *  on which month's grants we're showing. */
  monthKey: string;
};

export default function AdminGrantPanel({
  token,
  initialBonuses,
  monthKey,
}: Props) {
  const [bonuses, setBonuses] = useState(initialBonuses);
  const [pending, setPending] = useState<GrantKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<{
    kind: GrantKind;
    delta: number;
    newTotal: number;
  } | null>(null);

  async function grant(kind: GrantKind, delta: number) {
    setError(null);
    setLastChange(null);
    // Optimistic update.
    const prev = bonuses[kind];
    const next = Math.max(0, prev + delta);
    setBonuses({ ...bonuses, [kind]: next });
    setPending(kind);
    try {
      const res = await fetch("/api/admin/grant-allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind, delta }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        newTotal?: number;
        error?: string;
      };
      if (!res.ok || !json.success || typeof json.newTotal !== "number") {
        // Revert optimistic update.
        setBonuses({ ...bonuses, [kind]: prev });
        setError(json.error ?? "Grant failed. Try again.");
        return;
      }
      // Sync to the server's authoritative count (in case of race).
      setBonuses((b) => ({ ...b, [kind]: json.newTotal! }));
      setLastChange({ kind, delta, newTotal: json.newTotal });
      setTimeout(() => setLastChange(null), 6000);
    } catch (e) {
      setBonuses({ ...bonuses, [kind]: prev });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-label="Admin: grant extra monthly allowance"
      className="rounded-2xl border-2 border-navy-100 bg-cream-50 p-5"
    >
      <header className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-serif text-lg font-semibold text-navy-900">
          Monthly allowances
        </h2>
        <p className="text-xs text-navy-500">
          Granting bonus for {monthKey}. Resets at month rollover.
        </p>
      </header>

      <ul className="mt-4 space-y-3">
        {ROWS.map((r) => {
          const bonus = bonuses[r.kind] ?? 0;
          const effective = r.defaultCap + bonus;
          return (
            <li
              key={r.kind}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-100 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900">
                  {r.label}
                </p>
                <p className="mt-0.5 text-xs text-navy-500"
                  dangerouslySetInnerHTML={{ __html: r.helper }}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-navy-700">
                <span className="font-mono text-navy-500">
                  {r.defaultCap}
                </span>
                <span className="text-xs text-navy-400">+</span>
                <span
                  className={`font-mono font-semibold ${bonus > 0 ? "text-green-700" : "text-navy-300"}`}
                  aria-label={`bonus ${bonus}`}
                >
                  {bonus}
                </span>
                <span className="text-xs text-navy-400">=</span>
                <span className="font-mono font-semibold text-navy-900">
                  {effective}
                </span>
                <span className="ml-1 text-xs text-navy-500">/mo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => grant(r.kind, -1)}
                  disabled={pending !== null || bonus === 0}
                  className="rounded-md border border-navy-200 px-2 py-1 text-xs font-semibold text-navy-700 transition-colors hover:border-navy-400 disabled:opacity-40"
                  title="Take back one bonus grant"
                  aria-label={`Reduce ${r.label} bonus by 1`}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => grant(r.kind, 1)}
                  disabled={pending !== null}
                  className="rounded-md bg-navy-900 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-navy-700 disabled:opacity-60"
                  title="Grant one extra this month"
                  aria-label={`Grant ${r.label} +1`}
                >
                  + Grant 1
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 text-xs text-ember-700" role="alert">
          {error}
        </p>
      )}
      {lastChange && (
        <p className="mt-3 text-xs text-green-700" role="status">
          Granted {lastChange.delta > 0 ? "+" : ""}
          {lastChange.delta}{" "}
          {labelOf(lastChange.kind)}. Customer&apos;s {monthKey} bonus
          is now {lastChange.newTotal}.
        </p>
      )}
    </section>
  );
}

function labelOf(kind: GrantKind): string {
  return ROWS.find((r) => r.kind === kind)?.label ?? kind;
}
