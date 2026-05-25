// Customer-facing modules editor used by the dashboard's
// "Your modules" section AND "Billing" section.
//
// Behaviour:
//   - Lists every available module with its current state
//     (Active / Pending add / Pending remove)
//   - Each row offers a single context-appropriate Add or Remove
//     button (no toggle — the action is explicit)
//   - Clicking either opens a modal that spells out:
//       what changes, when it takes effect (next billing date),
//       what the new monthly + setup totals will be, what gets
//       charged or refunded
//   - On confirm, POSTs /api/account/module-change which writes a
//     pending entry. UI optimistically marks the module pending;
//     the actual selection flips when the operator (or Stripe
//     webhook, post task #56) applies the change on the effective
//     date.
//
// Self-contained — receives the prospect's current state via
// props, mutates via the API, and triggers a router.refresh()
// after success to re-read fresh state from Notion.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ModuleMeta = {
  name: string;
  blurb: string;
  setup: number;
  monthly: number;
  /** Optional friendlier display name (e.g. "Google Reviews" vs
   *  the canonical multi-select string). Falls back to `name`
   *  when absent. */
  shortName?: string;
};

const ALL_MODULES: readonly ModuleMeta[] = [
  {
    name: "Online Booking",
    blurb: "Cal.com booking widget on your site",
    setup: 39,
    monthly: 4,
  },
  {
    name: "Enquiry Form",
    blurb: "Lead-capture form that emails you each enquiry",
    setup: 39,
    monthly: 4,
  },
  {
    name: "Newsletter",
    blurb: "Monthly send to your subscribers + signup widget",
    setup: 39,
    monthly: 6,
  },
  {
    name: "Offers",
    blurb: "Promo strip + offer composer in your dashboard",
    setup: 29,
    monthly: 4,
  },
  {
    name: "Google Business Profile Setup/Audit",
    blurb:
      "I claim/audit your listing + your top Google reviews appear on your site",
    setup: 29,
    monthly: 2,
    shortName: "Google Reviews",
  },
];

/** A module name string — kept loose (not a union literal) because
 *  ALL_MODULES is a readonly array of ModuleMeta. The eligibility
 *  check is done server-side via z.enum(MODULE_OPTIONS). */
type ModuleName = string;

export type PendingChange = {
  id: string;
  kind:
    | "modules-post-launch"
    | "cancel-end-of-period"
    | "cancel-immediate-prorated";
  added: string[];
  removed: string[];
  effectiveDate: string;
  setupDelta: number;
  monthlyDelta: number;
};

type Props = {
  token: string;
  currentModules: readonly string[];
  pendingChanges: readonly PendingChange[];
  /** Founding members see a different pricing line because they
   *  pay a flat rate, not the per-module add-ons. */
  foundingMember: boolean;
  /** What the customer is paying RIGHT NOW. Drives the
   *  "current £X → new £Y" before-after totals in every
   *  modal so the customer sees the impact of the change on
   *  the actual numbers on their bill, not just a delta. */
  currentMonthly: number;
  /** What the customer has already PAID in setup (historical,
   *  non-refundable). Quoted in the modal so the customer
   *  understands what is and is not part of any change. */
  paidSetup: number;
};

export default function ModulesEditor({
  token,
  currentModules,
  pendingChanges,
  foundingMember,
  currentMonthly,
  paidSetup,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<{
    module: ModuleName;
    action: "add" | "remove";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = new Set(currentModules);

  /** True if this exact module is queued for an add (so we should
   *  show "Pending add" on the row + suppress the Add button). */
  function isPendingAdd(mod: ModuleName): PendingChange | undefined {
    return pendingChanges.find(
      (p) => p.kind === "modules-post-launch" && p.added.includes(mod),
    );
  }
  function isPendingRemove(mod: ModuleName): PendingChange | undefined {
    return pendingChanges.find(
      (p) => p.kind === "modules-post-launch" && p.removed.includes(mod),
    );
  }

  async function submit() {
    if (!modal) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/module-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          module: modal.module,
          action: modal.action,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  return (
    <div>
      <ul className="divide-y divide-navy-100">
        {ALL_MODULES.map((m) => {
          const active = current.has(m.name);
          const pAdd = isPendingAdd(m.name);
          const pRemove = isPendingRemove(m.name);
          return (
            <li key={m.name} className="flex items-start gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900">
                  {m.shortName ?? m.name}
                  {active && !pRemove && (
                    <StateBadge tone="green" label="Active" />
                  )}
                  {pAdd && (
                    <StateBadge
                      tone="amber"
                      label={`Pending add · ${formatDate(pAdd.effectiveDate)}`}
                    />
                  )}
                  {pRemove && (
                    <StateBadge
                      tone="amber"
                      label={`Pending remove · ${formatDate(pRemove.effectiveDate)}`}
                    />
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-navy-600">
                  {m.blurb}
                </p>
                {!foundingMember && (
                  <p className="mt-0.5 text-xs text-navy-500">
                    £{m.setup} setup · £{m.monthly}/mo
                  </p>
                )}
              </div>
              <div className="flex-none">
                {active && !pRemove && (
                  <button
                    type="button"
                    onClick={() =>
                      setModal({ module: m.name, action: "remove" })
                    }
                    className="rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:border-ember-400 hover:text-ember-700"
                  >
                    Remove
                  </button>
                )}
                {!active && !pAdd && (
                  <button
                    type="button"
                    onClick={() =>
                      setModal({ module: m.name, action: "add" })
                    }
                    className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700"
                  >
                    Add
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {modal && (
        <ConfirmModal
          module={modal.module}
          action={modal.action}
          foundingMember={foundingMember}
          currentMonthly={currentMonthly}
          paidSetup={paidSetup}
          pending={pending}
          error={error}
          onCancel={() => {
            setModal(null);
            setError(null);
          }}
          onConfirm={submit}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  module: moduleName,
  action,
  foundingMember,
  currentMonthly,
  paidSetup,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  module: ModuleName;
  action: "add" | "remove";
  foundingMember: boolean;
  currentMonthly: number;
  paidSetup: number;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const meta = ALL_MODULES.find((m) => m.name === moduleName)!;
  // Same nextBillingDate logic as the server — duplicated here so
  // we can render the date in the modal without an extra fetch.
  // If client + server disagree (e.g. timezone roll between
  // render + submit), the server is authoritative.
  const effectiveDate = clientNextBillingDate();
  const effectiveLabel = formatDate(effectiveDate);
  // Founding members don't see per-module monthly changes — they
  // pay a flat rate. So the new-monthly figure for them equals
  // the current-monthly figure regardless of add/remove.
  const newMonthly = foundingMember
    ? currentMonthly
    : action === "add"
      ? currentMonthly + meta.monthly
      : currentMonthly - meta.monthly;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card"
        role="dialog"
        aria-modal="true"
      >
        <h2 className="font-serif text-xl font-semibold text-navy-900">
          {action === "add" ? `Add ${meta.shortName ?? meta.name}?` : `Remove ${meta.shortName ?? meta.name}?`}
        </h2>
        {action === "add" ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-navy-700">
            <p>
              You&apos;re adding <strong>{meta.shortName ?? meta.name}</strong>{" "}
              to your subscription.
            </p>
            <Bullet>
              <strong>Effective {effectiveLabel}</strong> — the
              module activates and your bill goes up from that date.
              You won&apos;t be charged anything extra this month.
            </Bullet>
            <BeforeAfterPanel
              paidSetup={paidSetup}
              currentMonthly={currentMonthly}
              newMonthly={newMonthly}
              extraSetup={meta.setup}
              foundingMember={foundingMember}
              effectiveLabel={effectiveLabel}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-navy-700">
            <p>
              You&apos;re removing{" "}
              <strong>{meta.shortName ?? meta.name}</strong> from your
              subscription.
            </p>
            <Bullet>
              <strong>You keep access until {effectiveLabel}</strong>.
              No refund — you&apos;ve already paid for the rest of
              this month.
            </Bullet>
            <BeforeAfterPanel
              paidSetup={paidSetup}
              currentMonthly={currentMonthly}
              newMonthly={newMonthly}
              extraSetup={0}
              foundingMember={foundingMember}
              effectiveLabel={effectiveLabel}
            />
          </div>
        )}
        {error && (
          <p
            className="mt-4 rounded-lg bg-ember-50 px-3 py-2 text-sm text-ember-800"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-cream-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
          >
            {pending
              ? "Submitting…"
              : action === "add"
                ? `Add — bill from ${effectiveLabel}`
                : `Remove — keep access until ${effectiveLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The numeric table in every Add/Remove modal: setup paid
 *  to date (non-refundable), current monthly, new monthly,
 *  and any extra setup that lands on the next invoice. Replaces
 *  the previous "delta-only" copy so the customer reads the
 *  actual numbers that will be on their bill — not a maths
 *  problem they have to solve in their head. */
function BeforeAfterPanel({
  paidSetup,
  currentMonthly,
  newMonthly,
  extraSetup,
  foundingMember,
  effectiveLabel,
}: {
  paidSetup: number;
  currentMonthly: number;
  newMonthly: number;
  extraSetup: number;
  foundingMember: boolean;
  effectiveLabel: string;
}) {
  const monthlyChanged = currentMonthly !== newMonthly;
  return (
    <div className="rounded-lg bg-cream-50 p-3 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
        <dt className="text-navy-600">Setup paid to date</dt>
        <dd className="font-semibold text-navy-900">£{paidSetup}</dd>
        {extraSetup > 0 && (
          <>
            <dt className="text-navy-600">
              Extra setup on {effectiveLabel} invoice
            </dt>
            <dd className="font-semibold text-ember-700">
              +£{extraSetup}
            </dd>
          </>
        )}
        <dt className="text-navy-600">Current monthly</dt>
        <dd className="font-semibold text-navy-900">
          £{currentMonthly}/mo
        </dd>
        <dt className="text-navy-600">
          New monthly from {effectiveLabel}
        </dt>
        <dd
          className={`font-semibold ${
            monthlyChanged
              ? newMonthly > currentMonthly
                ? "text-ember-700"
                : "text-green-700"
              : "text-navy-900"
          }`}
        >
          £{newMonthly}/mo
        </dd>
      </dl>
      {foundingMember && (
        <p className="mt-2 text-xs text-navy-500">
          Founding rate is flat — your monthly fee covers all
          modules included in the plan.
        </p>
      )}
      <p className="mt-2 text-[11px] text-navy-500">
        Setup paid to date is{" "}
        <strong>non-refundable</strong> — it covered building
        your site, which has been delivered.
      </p>
    </div>
  );
}

function StateBadge({
  tone,
  label,
}: {
  tone: "green" | "amber";
  label: string;
}) {
  const cls =
    tone === "green"
      ? "bg-green-100 text-green-800"
      : "bg-amber-100 text-amber-800";
  return (
    <span
      className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-navy-400" />
      <span>{children}</span>
    </p>
  );
}

function clientNextBillingDate(): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
