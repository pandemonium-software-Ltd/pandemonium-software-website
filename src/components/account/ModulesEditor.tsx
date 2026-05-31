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

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isModuleSetupComplete, type ToolsSlice } from "@/lib/module-setup-status";
import {
  MODULE_BOOKING_SETUP_GBP,
  MODULE_BOOKING_MONTHLY_GBP,
  MODULE_ENQUIRY_SETUP_GBP,
  MODULE_ENQUIRY_MONTHLY_GBP,
  MODULE_NEWSLETTER_SETUP_GBP,
  MODULE_NEWSLETTER_MONTHLY_GBP,
  MODULE_OFFERS_SETUP_GBP,
  MODULE_OFFERS_MONTHLY_GBP,
  GBP_ADDON_ONE_OFF_GBP,
  GBP_ADDON_MONTHLY_GBP,
  MODULE_MULTILOCATION_SETUP_GBP,
} from "@/lib/fees";

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
    setup: MODULE_BOOKING_SETUP_GBP,
    monthly: MODULE_BOOKING_MONTHLY_GBP,
  },
  {
    name: "Enquiry Form",
    blurb: "Lead-capture form that emails you each enquiry",
    setup: MODULE_ENQUIRY_SETUP_GBP,
    monthly: MODULE_ENQUIRY_MONTHLY_GBP,
  },
  {
    name: "Newsletter",
    blurb: "Monthly send to your subscribers + signup widget",
    setup: MODULE_NEWSLETTER_SETUP_GBP,
    monthly: MODULE_NEWSLETTER_MONTHLY_GBP,
  },
  {
    name: "Offers",
    blurb: "Promo strip + offer composer in your dashboard",
    setup: MODULE_OFFERS_SETUP_GBP,
    monthly: MODULE_OFFERS_MONTHLY_GBP,
  },
  {
    name: "Google Business Profile Setup/Audit",
    blurb:
      "I claim/audit your listing + your top Google reviews appear on your site",
    setup: GBP_ADDON_ONE_OFF_GBP,
    monthly: GBP_ADDON_MONTHLY_GBP,
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
    | "cancel-immediate-prorated"
    | "multilocation-change";
  added: string[];
  removed: string[];
  effectiveDate: string;
  setupDelta: number;
  monthlyDelta: number;
  /** Only populated for multilocation-change entries — the new
   *  extra-locations count the customer is moving TO. Drives
   *  the dashboard's "pending: N → M extra locations" badge. */
  toExtraLocations?: number;
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
  /** Current multi-location counter. Drives the new
   *  Multi-location row's stepper + "+£15 per extra" copy.
   *  0 = customer has no extra locations today. */
  extraLocations: number;
  /** Slice of onboardingData.tools — used to decide which active
   *  modules still need a Set-up button next to them (Cal.com
   *  URL not yet pasted, Manager invite not yet ticked, etc).
   *  Optional for backwards-compat with existing call sites that
   *  do not yet pass it; missing slice = no Set-up buttons. */
  tools?: ToolsSlice;
};

export default function ModulesEditor({
  token,
  currentModules,
  pendingChanges,
  foundingMember,
  currentMonthly,
  paidSetup,
  extraLocations,
  tools,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<{
    module: ModuleName;
    action: "add" | "remove";
  } | null>(null);
  // Separate modal state for multi-location changes — the
  // shape (target count) is different from a module add/remove
  // (boolean action), so a discriminated state would be ugly.
  // Keep them parallel for clarity.
  const [locModal, setLocModal] = useState<{ target: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optimistic pending changes submitted this session. Tracked
  // locally because router.refresh() is async — the user can open
  // the next Remove modal before the server-side pendingChanges
  // prop updates. Without this, removing 3 modules in sequence
  // shows the same "before" price in every modal.
  //
  // Each entry records the module name + its monthly/setup delta.
  // Entries that already appear in the server-confirmed
  // pendingChanges prop are filtered out when computing effective
  // amounts, so there's no double-counting once the refresh lands.
  type OptimisticEntry = {
    module: string;
    action: "add" | "remove";
    monthlyDelta: number;
    setupDelta: number;
  };
  const [optimistic, setOptimistic] = useState<OptimisticEntry[]>([]);

  // When pendingChanges prop updates (router.refresh() landed),
  // prune any optimistic entries that the server now confirms.
  const prevPendingRef = useRef(pendingChanges);
  useEffect(() => {
    if (prevPendingRef.current !== pendingChanges) {
      prevPendingRef.current = pendingChanges;
      setOptimistic((prev) =>
        prev.filter((o) => {
          const serverHas = pendingChanges.some(
            (p) =>
              p.kind === "modules-post-launch" &&
              (p.added.includes(o.module) || p.removed.includes(o.module)),
          );
          return !serverHas;
        }),
      );
    }
  }, [pendingChanges]);

  const current = new Set(currentModules);

  // Effective monthly/setup: server-confirmed pending deltas PLUS
  // any optimistic entries not yet confirmed by the server.
  const serverModuleDeltas = pendingChanges.filter(
    (p) => p.kind === "modules-post-launch",
  );
  const serverPendingModules = new Set(
    serverModuleDeltas.flatMap((p) => [...p.added, ...p.removed]),
  );
  const unconfirmedOptimistic = optimistic.filter(
    (o) => !serverPendingModules.has(o.module),
  );

  const effectiveMonthly = foundingMember
    ? currentMonthly
    : currentMonthly +
      serverModuleDeltas.reduce((s, p) => s + p.monthlyDelta, 0) +
      unconfirmedOptimistic.reduce((s, o) => s + o.monthlyDelta, 0);
  const effectiveSetup =
    paidSetup +
    serverModuleDeltas.reduce((s, p) => s + p.setupDelta, 0) +
    unconfirmedOptimistic.reduce((s, o) => s + o.setupDelta, 0);

  // The customer's effective extra-locations target if there's a
  // pending change queued — otherwise the current count. The
  // stepper's "value" starts here so re-opens don't lose the
  // pending state.
  const pendingLocChange = pendingChanges.find(
    (p) => p.kind === "multilocation-change",
  );
  const targetExtraLocations =
    pendingLocChange?.toExtraLocations ?? extraLocations;

  // Combine server-confirmed + optimistic for badge/button gating
  // so buttons update immediately after submit, not after refresh.
  const allPendingModules = new Set([
    ...serverPendingModules,
    ...optimistic.map((o) => o.module),
  ]);

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
  function isOptimisticAdd(mod: ModuleName): boolean {
    return (
      !isPendingAdd(mod) &&
      optimistic.some((o) => o.module === mod && o.action === "add")
    );
  }
  function isOptimisticRemove(mod: ModuleName): boolean {
    return (
      !isPendingRemove(mod) &&
      optimistic.some((o) => o.module === mod && o.action === "remove")
    );
  }

  async function submit() {
    if (!modal) return;
    setError(null);
    const submittedModule = modal.module;
    const submittedAction = modal.action;
    startTransition(async () => {
      const res = await fetch("/api/account/module-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          module: submittedModule,
          action: submittedAction,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      const meta = ALL_MODULES.find((m) => m.name === submittedModule);
      if (meta) {
        setOptimistic((prev) => [
          ...prev,
          {
            module: submittedModule,
            action: submittedAction,
            monthlyDelta:
              submittedAction === "add" ? meta.monthly : -meta.monthly,
            setupDelta: submittedAction === "add" ? meta.setup : 0,
          },
        ]);
      }
      setModal(null);
      router.refresh();
    });
  }

  async function submitLocChange() {
    if (!locModal) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/multilocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newExtraLocations: locModal.target,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      setLocModal(null);
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
          const oAdd = isOptimisticAdd(m.name);
          const oRemove = isOptimisticRemove(m.name);
          const anyPendingAdd = !!(pAdd || oAdd);
          const anyPendingRemove = !!(pRemove || oRemove);
          return (
            <li key={m.name} className="flex items-start gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900">
                  {m.shortName ?? m.name}
                  {active && !anyPendingRemove && (
                    <StateBadge tone="green" label="Active" />
                  )}
                  {pAdd && (
                    <StateBadge
                      tone="amber"
                      label={`Pending add · ${formatDate(pAdd.effectiveDate)}`}
                    />
                  )}
                  {oAdd && (
                    <StateBadge tone="amber" label="Pending add" />
                  )}
                  {pRemove && (
                    <StateBadge
                      tone="amber"
                      label={`Pending remove · ${formatDate(pRemove.effectiveDate)}`}
                    />
                  )}
                  {oRemove && (
                    <StateBadge tone="amber" label="Pending remove" />
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
              <div className="flex flex-none flex-col items-end gap-2">
                {active &&
                  !anyPendingRemove &&
                  !isModuleSetupComplete(m.name, tools) && (
                    <a
                      href={`/onboarding/${token}?step=tools&focus=${encodeURIComponent(m.name)}`}
                      className="rounded-lg bg-ember-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-700"
                    >
                      Set up →
                    </a>
                  )}
                {active && !anyPendingRemove && (
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
                {!active && !anyPendingAdd && (
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

        {/* Multi-location — counter, not a boolean. £15 per extra
            location, no monthly. The stepper UI shows the current
            (or pending-effective) count with +/- buttons that open
            a confirmation modal before committing. */}
        <li className="flex items-start gap-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy-900">
              Multi-location
              {extraLocations > 0 && (
                <StateBadge
                  tone="green"
                  label={`${extraLocations} extra location${extraLocations === 1 ? "" : "s"}`}
                />
              )}
              {pendingLocChange && (
                <StateBadge
                  tone="amber"
                  label={`Pending → ${pendingLocChange.toExtraLocations} · ${formatDate(pendingLocChange.effectiveDate)}`}
                />
              )}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-navy-600">
              Each extra location appears as its own contact / map /
              hours block on your site. Add details in your Hub
              Step 4 once a change is applied.
            </p>
            {!foundingMember && (
              <p className="mt-0.5 text-xs text-navy-500">
                £{MODULE_MULTILOCATION_SETUP_GBP} setup per extra
                location · no monthly fee
              </p>
            )}
          </div>
          <div className="flex flex-none flex-col items-end gap-2">
            <div className="inline-flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-2 py-1">
              <button
                type="button"
                disabled={targetExtraLocations === 0 || !!pendingLocChange}
                onClick={() =>
                  setLocModal({ target: targetExtraLocations - 1 })
                }
                aria-label="Remove one extra location"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-900 text-white disabled:bg-navy-200"
              >
                −
              </button>
              <span
                className="min-w-[2rem] text-center text-sm font-semibold text-navy-900"
                aria-live="polite"
              >
                {targetExtraLocations}
              </span>
              <button
                type="button"
                disabled={!!pendingLocChange}
                onClick={() =>
                  setLocModal({ target: targetExtraLocations + 1 })
                }
                aria-label="Add one extra location"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-900 text-white disabled:bg-navy-200"
              >
                +
              </button>
            </div>
            {pendingLocChange && (
              <p className="text-[10px] text-navy-500">
                Change queued — wait for {formatDate(pendingLocChange.effectiveDate)}
              </p>
            )}
          </div>
        </li>
      </ul>

      {modal && (
        <ConfirmModal
          module={modal.module}
          action={modal.action}
          foundingMember={foundingMember}
          currentMonthly={effectiveMonthly}
          paidSetup={effectiveSetup}
          pending={pending}
          error={error}
          onCancel={() => {
            setModal(null);
            setError(null);
          }}
          onConfirm={submit}
        />
      )}

      {locModal && (
        <LocationChangeModal
          fromCount={extraLocations}
          toCount={locModal.target}
          paidSetup={effectiveSetup}
          pending={pending}
          error={error}
          onCancel={() => {
            setLocModal(null);
            setError(null);
          }}
          onConfirm={submitLocChange}
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

// ---------- Multi-location confirm modal ----------
//
// Lighter than ConfirmModal — multi-location has no monthly
// impact, only setup-fee delta. Modal shows:
//   - "Going from N → M extra locations"
//   - £15 × diff = total charge / refund (calculated client-side)
//   - effective date (1st of next month)
//   - confirm / cancel
//
// Once confirmed, the customer can fill in per-location details
// in their Hub Step 4 once the change applies.

function LocationChangeModal({
  fromCount,
  toCount,
  paidSetup,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  fromCount: number;
  toCount: number;
  paidSetup: number;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const diff = toCount - fromCount;
  const isAdding = diff > 0;
  const setupCharge = Math.abs(diff) * MODULE_MULTILOCATION_SETUP_GBP;
  const effectiveDate = clientNextBillingDate();
  const effectiveLabel = formatDate(effectiveDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card"
        role="dialog"
        aria-modal="true"
      >
        <h2 className="font-serif text-xl font-semibold text-navy-900">
          {isAdding ? "Add an extra location?" : "Remove an extra location?"}
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-navy-700">
          <p>
            You&apos;re going from <strong>{fromCount}</strong> extra
            location{fromCount === 1 ? "" : "s"} to{" "}
            <strong>{toCount}</strong>.
          </p>
          <Bullet>
            <strong>Effective {effectiveLabel}</strong> — your{" "}
            {isAdding
              ? "next invoice picks up the one-off setup below; the new location slot opens in your Hub Step 4 so you can fill in name, address and hours."
              : "monthly stays the same; no refund of the original setup (that work was already delivered)."}
          </Bullet>
          <div className="rounded-xl bg-cream-50 p-4">
            <table className="w-full text-xs text-navy-800">
              <tbody>
                <tr>
                  <td className="py-1 text-navy-600">Setup paid to date</td>
                  <td className="py-1 text-right font-mono text-navy-900">
                    £{paidSetup}
                  </td>
                </tr>
                {isAdding ? (
                  <tr>
                    <td className="py-1 text-navy-600">
                      Extra setup on {effectiveLabel}
                    </td>
                    <td className="py-1 text-right font-mono text-navy-900">
                      +£{setupCharge}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td className="py-1 text-navy-600">
                      Setup adjustment
                    </td>
                    <td className="py-1 text-right font-mono text-navy-500">
                      £0 (no refund)
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-1 text-navy-600">Monthly impact</td>
                  <td className="py-1 text-right font-mono text-navy-500">
                    £0
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {error && (
          <p className="mt-4 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:bg-navy-400"
          >
            {pending ? "Submitting…" : isAdding ? "Confirm add" : "Confirm remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
