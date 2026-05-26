// Customer-facing Billing section of the dashboard.
//
// Composes three concerns into one panel:
//   1. Current charges — setup + monthly with Founding-rate
//      callout if applicable
//   2. ModulesEditor — same component the Modules section uses,
//      so the customer can change modules from either place
//   3. Cancel account — dedicated button that opens a modal with
//      TWO explicit options (end-of-period free / immediate
//      prorated refund). Cancellation lives ONLY here (not in
//      the Modules section) to keep the destructive action
//      cordoned off from the routine add/remove flow.
//
// All money movements are pending until Ben (or, post task #56,
// the Stripe webhook) actions them. We make this explicit in the
// modal copy so the customer knows the change is queued, not live
// the second they click.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ModulesEditor, { type PendingChange } from "./ModulesEditor";
import type { ToolsSlice } from "@/lib/module-setup-status";

type Props = {
  token: string;
  setupFee: number;
  monthlyFee: number;
  foundingMember: boolean;
  currentModules: readonly string[];
  pendingChanges: readonly PendingChange[];
  extraLocations: number;
  tools?: ToolsSlice;
};

export default function BillingPanel({
  token,
  setupFee,
  monthlyFee,
  foundingMember,
  currentModules,
  pendingChanges,
  extraLocations,
  tools,
}: Props) {
  const router = useRouter();
  const [cancelModal, setCancelModal] = useState<
    null | "menu" | "end-of-period" | "immediate-prorated"
  >(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pendingCancel = pendingChanges.find(
    (p) =>
      p.kind === "cancel-end-of-period" ||
      p.kind === "cancel-immediate-prorated",
  );

  async function submitCancel(mode: "end-of-period" | "immediate-prorated") {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, mode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      setCancelModal(null);
      router.refresh();
    });
  }

  return (
    <div>
      {/* ---------- Current charges ---------- */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-navy-600">Setup fee</dt>
        <dd className="font-semibold text-navy-900">
          £{setupFee}
          <span className="ml-1 text-xs font-normal text-navy-500">
            (one-off, already paid)
          </span>
        </dd>
        <dt className="text-navy-600">Monthly</dt>
        <dd className="font-semibold text-navy-900">
          £{monthlyFee}/mo
          {foundingMember && (
            <span className="ml-2 inline-block rounded-full bg-ember-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ember-700">
              Founding rate
            </span>
          )}
        </dd>
      </dl>

      {/* Stripe Customer Portal — opens Stripe-hosted self-service
       *  UI in a new tab so the customer can update their card,
       *  view past invoices, see upcoming charges. Cancellation is
       *  intentionally NOT in the portal (we own that flow below). */}
      <div className="mt-4">
        <BillingPortalButton token={token} />
      </div>

      {/* Pending changes summary — gives the customer a single
       *  source of truth for what will happen on their next bill. */}
      {pendingChanges.length > 0 && (
        <div className="mt-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">
            Pending changes
          </p>
          <ul className="mt-2 space-y-1.5 text-amber-900">
            {pendingChanges.map((p) => (
              <li key={p.id} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{describePending(p)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Pending changes lock in once we process the next
            billing cycle. Email us if you change your mind before
            the effective date.
          </p>
        </div>
      )}

      {/* ---------- Modules editor (same component as the Modules section) ---------- */}
      <section className="mt-7 border-t border-navy-100 pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-700">
          Add or remove modules
        </h3>
        <p className="mt-1 text-xs text-navy-500">
          Changes take effect from your next billing date. No
          partial-month charges.
        </p>
        <div className="mt-3">
          <ModulesEditor
            token={token}
            currentModules={currentModules}
            pendingChanges={pendingChanges}
            foundingMember={foundingMember}
            currentMonthly={monthlyFee}
            paidSetup={setupFee}
            extraLocations={extraLocations}
            tools={tools}
          />
        </div>
      </section>

      {/* ---------- Cancel my account ---------- */}
      <section className="mt-7 border-t border-navy-100 pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-700">
          Cancel my account
        </h3>
        {pendingCancel ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Cancellation pending — effective {formatDate(pendingCancel.effectiveDate)}. Email us if you change your mind.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-navy-500">
              Stops your site and ends future billing. Pick the
              option that works for you.
            </p>
            <button
              type="button"
              onClick={() => setCancelModal("menu")}
              className="mt-3 rounded-lg border-2 border-ember-300 px-4 py-2 text-sm font-semibold text-ember-800 hover:bg-ember-50"
            >
              Cancel my account…
            </button>
          </>
        )}
      </section>

      {cancelModal && (
        <CancelModal
          stage={cancelModal}
          monthlyFee={monthlyFee}
          pending={pending}
          error={error}
          onPick={(m) => setCancelModal(m)}
          onCancel={() => {
            setCancelModal(null);
            setError(null);
          }}
          onConfirm={submitCancel}
        />
      )}
    </div>
  );
}

function CancelModal({
  stage,
  monthlyFee,
  pending,
  error,
  onPick,
  onCancel,
  onConfirm,
}: {
  stage: "menu" | "end-of-period" | "immediate-prorated";
  monthlyFee: number;
  pending: boolean;
  error: string | null;
  onPick: (s: "end-of-period" | "immediate-prorated") => void;
  onCancel: () => void;
  onConfirm: (mode: "end-of-period" | "immediate-prorated") => void;
}) {
  const effectiveLabel = formatDate(clientNextBillingDate());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4">
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-card"
        role="dialog"
        aria-modal="true"
      >
        {stage === "menu" && (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy-900">
              Cancel your account
            </h2>
            <p className="mt-2 text-sm text-navy-700">
              Pick the option that works best:
            </p>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => onPick("end-of-period")}
                className="w-full rounded-xl border-2 border-navy-200 p-4 text-left hover:border-navy-400"
              >
                <p className="font-semibold text-navy-900">
                  Cancel at end of month
                  <span className="ml-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-800">
                    Free
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-navy-600">
                  Full access until {effectiveLabel}. After that,
                  your site goes offline and billing stops. No
                  refund — you keep what you&apos;ve paid for.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onPick("immediate-prorated")}
                className="w-full rounded-xl border-2 border-navy-200 p-4 text-left hover:border-navy-400"
              >
                <p className="font-semibold text-navy-900">
                  Cancel now with prorated refund
                </p>
                <p className="mt-1 text-xs leading-relaxed text-navy-600">
                  Your site goes offline today. We refund the
                  unused portion of <strong>this month&apos;s
                  subscription</strong> based on days left
                  (typically £{Math.round((monthlyFee / 30) * 15)}–£
                  {monthlyFee} depending on timing).{" "}
                  <strong>Your one-off setup fee is non-refundable</strong>{" "}
                  — that paid for building your site, which has
                  already been delivered.
                </p>
              </button>
            </div>
            <div className="mt-6 text-right">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-cream-100"
              >
                Back
              </button>
            </div>
          </>
        )}
        {stage !== "menu" && (
          <ConfirmCancel
            mode={stage}
            effectiveLabel={effectiveLabel}
            monthlyFee={monthlyFee}
            pending={pending}
            error={error}
            onCancel={onCancel}
            onConfirm={() => onConfirm(stage)}
          />
        )}
      </div>
    </div>
  );
}

function ConfirmCancel({
  mode,
  effectiveLabel,
  monthlyFee,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  mode: "end-of-period" | "immediate-prorated";
  effectiveLabel: string;
  monthlyFee: number;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <h2 className="font-serif text-xl font-semibold text-navy-900">
        {mode === "end-of-period"
          ? `Cancel at end of month?`
          : `Cancel now with refund?`}
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-navy-700">
        {mode === "end-of-period" ? (
          <>
            <p>
              Your site stays live until <strong>{effectiveLabel}</strong>.
            </p>
            <p>
              On {effectiveLabel} your site goes offline, billing
              stops, and you&apos;ll get a final receipt by email.
              No refund.
            </p>
            <p className="text-xs text-navy-500">
              Change your mind before then? Just email us and
              we&apos;ll undo it.
            </p>
          </>
        ) : (
          <>
            <p>
              Your site goes offline <strong>today</strong>.
            </p>
            <p>
              We&apos;ll refund the unused portion of{" "}
              <strong>this month&apos;s subscription</strong> (based
              on days remaining) to the card on file{" "}
              <strong>within 14 days</strong> of cancellation. Most
              card refunds land in 5–10 working days; the
              14-day backstop matches our statutory commitment.
              Exact figure confirmed in your final receipt.
            </p>
            <p className="rounded-lg bg-cream-100 px-3 py-2 text-xs text-navy-700">
              <strong>The one-off setup fee is not refunded</strong>{" "}
              — that covered building your site, which has already
              been delivered. Only the monthly subscription is
              prorated.
            </p>
            <p className="text-xs text-navy-500">
              You can&apos;t reactivate after this — you&apos;d
              start a new account from scratch.
            </p>
          </>
        )}
      </div>
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
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-lg bg-ember-700 px-4 py-2 text-sm font-semibold text-white hover:bg-ember-800 disabled:opacity-60"
        >
          {pending
            ? "Submitting…"
            : mode === "end-of-period"
              ? `Cancel from ${effectiveLabel}`
              : "Cancel now + refund"}
        </button>
      </div>
    </>
  );
}

function BillingPortalButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Couldn't open the portal. Try again.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (body.url) {
        // Same-window navigation — Stripe's portal expects to OWN the
        // tab. The portal's "Return to ModuForge" button uses the
        // returnUrl we passed, which brings the customer right back
        // here. Opening in a new tab would orphan the parent dashboard
        // and break the round-trip UX.
        window.location.href = body.url;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="rounded-lg border border-navy-300 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-cream-100 disabled:opacity-60"
      >
        {pending ? "Opening…" : "Update card / view invoices →"}
      </button>
      {error && (
        <p className="mt-1.5 text-xs text-ember-700" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function describePending(p: PendingChange): string {
  if (p.kind === "cancel-end-of-period") {
    return `Account cancels on ${formatDate(p.effectiveDate)} (no refund — setup is non-refundable + you've already paid this month)`;
  }
  if (p.kind === "cancel-immediate-prorated") {
    return `Account cancellation in progress (refund of unused monthly subscription only; setup fee is non-refundable)`;
  }
  const parts: string[] = [];
  if (p.added.length > 0) parts.push(`Add ${p.added.join(", ")}`);
  if (p.removed.length > 0) parts.push(`Remove ${p.removed.join(", ")}`);
  const deltaTxt =
    p.monthlyDelta !== 0
      ? ` · ${p.monthlyDelta > 0 ? "+" : "−"}£${Math.abs(p.monthlyDelta)}/mo`
      : "";
  return `${parts.join(" · ")} from ${formatDate(p.effectiveDate)}${deltaTxt}`;
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
