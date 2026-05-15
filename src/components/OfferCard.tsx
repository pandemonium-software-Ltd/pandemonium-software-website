"use client";

// Dashboard "Your offers" card — visible to live customers with
// the Offers module bought.
//
// Shows:
//   • The current active offer (if any) with countdown to its
//     end date
//   • A "Schedule a new offer" button that opens a modal composer
//   • Past offers archive (read-only)
//
// Submitting from the composer creates a normal change-request
// via /api/account/change-request — it counts as 1 of the
// customer's monthly 2-change allowance. The CR is pre-populated
// with the offer patch so Cowork's classifier doesn't need to
// parse the offer fields out of free text; admin approves through
// the standard change-request review queue.
//
// Same offer composer form as Hub Step 4 (Step4OfferSection) —
// rendered here in a dialog so post-launch customers don't need
// to leave the dashboard.

import { useRef, useState } from "react";
import {
  countActiveChangeRequestsByKind,
  MONTHLY_OFFER_UPDATE_LIMIT,
  type ChangeRequest,
} from "@/lib/notion-prospects";
import {
  OFFER_HEADLINE_MAX,
  OFFER_BODY_MAX,
  OFFER_CTA_LABEL_MAX,
  OFFER_CTA_URL_MAX,
} from "@/lib/offers/limits";

export type OfferView = {
  headline: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  startsAt: string;
  endsAt: string;
};

type Props = {
  token: string;
  /** Current active offer if set, null otherwise. */
  current: OfferView | null;
  /** Change-request list — used for the monthly-cap check. */
  changeRequests: ChangeRequest[];
  /** Effective monthly offer-update cap = default + admin grant
   *  bonus. Caller computes; falls back to MONTHLY_OFFER_UPDATE_LIMIT
   *  when not provided so legacy callers keep working. */
  cap?: number;
};

type Draft = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
};

// Mirror limits from the shared module so Hub form, dashboard
// composer, server validator + schema all agree.
const HEADLINE_MAX = OFFER_HEADLINE_MAX;
const BODY_MAX = OFFER_BODY_MAX;
const CTA_LABEL_MAX = OFFER_CTA_LABEL_MAX;
const CTA_URL_MAX = OFFER_CTA_URL_MAX;

function emptyDraft(): Draft {
  return {
    headline: "",
    body: "",
    ctaLabel: "",
    ctaUrl: "",
    startsAt: "",
    endsAt: "",
  };
}

function fromCurrent(o: OfferView): Draft {
  return {
    headline: o.headline,
    body: o.body ?? "",
    ctaLabel: o.ctaLabel ?? "",
    ctaUrl: o.ctaUrl ?? "",
    startsAt: o.startsAt,
    endsAt: o.endsAt,
  };
}

function todayUk(): string {
  const d = new Date().toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [day, month, year] = d.split("/");
  return `${year}-${month}-${day}`;
}

function daysUntil(iso: string): number {
  const today = new Date(todayUk());
  const target = new Date(iso);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export default function OfferCard({
  token,
  current,
  changeRequests,
  cap: capProp,
}: Props) {
  // Effective cap = default + any admin-granted bonus this month.
  // Falls back to the hardcoded default so callers that haven't
  // been updated yet still render correctly.
  const cap = capProp ?? MONTHLY_OFFER_UPDATE_LIMIT;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Offer updates now have their own per-kind 2/month budget,
  // independent of the legacy free-text change-request cap. The
  // dashboard's "Your modules" section reads this same counter.
  const usedThisMonth = countActiveChangeRequestsByKind(
    changeRequests,
    "offer-update",
  );
  const remaining = Math.max(0, cap - usedThisMonth);
  const atCap = remaining === 0;

  function openComposer() {
    setError(null);
    setSuccess(null);
    setDraft(current ? fromCurrent(current) : emptyDraft());
    dialogRef.current?.showModal();
  }

  function validate(): string | null {
    if (!draft.headline.trim()) return "Add a headline.";
    if (!draft.startsAt || !draft.endsAt)
      return "Pick both a start and end date.";
    if (draft.endsAt < draft.startsAt)
      return "End date can't be before start date.";
    if (draft.ctaLabel.trim() && !draft.ctaUrl.trim())
      return "If you set a button label, add a link too (or clear the label).";
    return null;
  }

  async function submit() {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setPending(true);
    try {
      // The endpoint accepts a structured `offer` payload alongside
      // the usual `message` — server validates, embeds the
      // pre-baked patch on the resulting change-request, and the
      // standard /admin queue picks it up. Counts as 1 monthly slot.
      const res = await fetch("/api/account/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          message: composeMessage(draft),
          kind: "offer-update",
          offer: {
            headline: draft.headline.trim(),
            body: draft.body.trim() || undefined,
            ctaLabel: draft.ctaLabel.trim() || undefined,
            ctaUrl: draft.ctaUrl.trim() || undefined,
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
          },
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        autoApplied?: boolean;
        buildWarning?: string | null;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      dialogRef.current?.close();
      const remainingAfter = remaining - 1;
      setSuccess(
        json.autoApplied && !json.buildWarning
          ? `Done — your offer is being deployed and will be live on your site in about 2 minutes. (${remainingAfter} of ${cap} changes remaining this month.)`
          : json.autoApplied && json.buildWarning
            ? `Saved your offer details — there's a hiccup with the build (${json.buildWarning}). We've been notified and will sort it. (${remainingAfter} of ${cap} remaining this month.)`
            : `Submitted. (${remainingAfter} of ${cap} changes remaining this month.)`,
      );
      setTimeout(() => setSuccess(null), 12000);
      // Soft refresh so the updated offer shows up on the card.
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-2xl bg-white p-6 shadow-card md:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold text-navy-900">
          🏷️ Your offers
        </h2>
        {current && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
            Live until {formatDate(current.endsAt)}
            {(() => {
              const d = daysUntil(current.endsAt);
              if (d < 0) return "";
              if (d === 0) return " · ends today";
              if (d === 1) return " · 1 day left";
              return ` · ${d} days left`;
            })()}
          </span>
        )}
      </div>

      {current ? (
        <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4">
          <p className="text-sm font-semibold text-navy-900">
            {current.headline}
          </p>
          {current.body && (
            <p className="mt-1 text-sm text-navy-700">{current.body}</p>
          )}
          <p className="mt-2 text-xs text-navy-500">
            Runs {formatDate(current.startsAt)} → {formatDate(current.endsAt)}
            {current.ctaLabel && current.ctaUrl && (
              <>
                {" · button "}
                <span className="font-mono text-[11px]">
                  &ldquo;{current.ctaLabel}&rdquo; → {current.ctaUrl}
                </span>
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-navy-700">
          No active offer right now. Use the button below to schedule
          a promotional strip for your homepage — a headline, dates and
          optional button. Counts as one of your{" "}
          <strong>{cap} changes a month</strong>.
        </p>
      )}

      {success && (
        <p
          className="mt-3 rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-800"
          role="status"
        >
          {success}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openComposer}
          disabled={atCap}
          className="rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
        >
          {current ? "Update offer" : "Schedule a new offer"}
        </button>
        <span className="text-xs text-navy-500">
          {atCap
            ? `All ${cap} monthly changes used — resets on the 1st`
            : `Uses 1 of ${remaining} remaining this month`}
        </span>
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto max-w-lg rounded-2xl border-0 p-0 shadow-lift backdrop:bg-navy-900/50"
      >
        <div className="p-6 md:p-7">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            {current ? "Update your offer" : "Schedule an offer"}
          </h2>
          <p className="mt-1 text-sm text-navy-600">
            This counts as 1 of your {cap}{" "}
            monthly offer updates. Once you save, it&apos;ll be live on
            your site within a couple of minutes.
          </p>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="block text-sm font-semibold text-navy-900">
                Headline
              </span>
              <input
                type="text"
                value={draft.headline}
                onChange={(e) =>
                  setDraft({ ...draft, headline: e.target.value })
                }
                maxLength={HEADLINE_MAX}
                placeholder="e.g. Free quote on patio installs — June only"
                className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
              />
              <span className="mt-1 block text-[11px] text-navy-500">
                {draft.headline.length}/{HEADLINE_MAX}
              </span>
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-navy-900">
                Details (optional)
              </span>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={2}
                maxLength={BODY_MAX}
                placeholder="Short and punchy — this sits in a slim strip at the top of your homepage."
                className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
              />
              <span className="mt-1 block text-[11px] text-navy-500">
                {draft.body.length}/{BODY_MAX}
              </span>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="block text-sm font-semibold text-navy-900">
                  Start date
                </span>
                <input
                  type="date"
                  value={draft.startsAt}
                  min={todayUk()}
                  onChange={(e) =>
                    setDraft({ ...draft, startsAt: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-navy-900">
                  End date
                </span>
                <input
                  type="date"
                  value={draft.endsAt}
                  min={draft.startsAt || todayUk()}
                  onChange={(e) =>
                    setDraft({ ...draft, endsAt: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="block text-sm font-semibold text-navy-900">
                  Button label (optional)
                </span>
                <input
                  type="text"
                  value={draft.ctaLabel}
                  maxLength={CTA_LABEL_MAX}
                  onChange={(e) =>
                    setDraft({ ...draft, ctaLabel: e.target.value })
                  }
                  placeholder="e.g. Get a quote"
                  className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-navy-900">
                  Button link (optional)
                </span>
                <input
                  type="text"
                  value={draft.ctaUrl}
                  maxLength={CTA_URL_MAX}
                  onChange={(e) =>
                    setDraft({ ...draft, ctaUrl: e.target.value })
                  }
                  placeholder="/contact OR https://..."
                  className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              </label>
            </div>
          </div>

          {error && (
            <p
              className="mt-3 rounded-lg border border-ember-200 bg-ember-50 p-2 text-sm text-ember-800"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className="rounded-lg border-2 border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 hover:border-navy-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
            >
              {pending
                ? "Sending…"
                : current
                  ? "Submit update"
                  : "Submit offer"}
            </button>
          </div>
        </div>
      </dialog>
    </article>
  );
}

/** Build the human-readable change-request message from the draft.
 *  Stored in Notion as the change-request `message` so admin /
 *  operator sees a readable summary in the queue — the actual
 *  patch data is embedded separately on the change-request. */
function composeMessage(d: Draft): string {
  const lines = [`[Offer update] ${d.headline.trim()}`];
  if (d.body.trim()) lines.push(d.body.trim());
  lines.push(`Runs ${d.startsAt} → ${d.endsAt}.`);
  if (d.ctaLabel.trim() && d.ctaUrl.trim()) {
    lines.push(`Button: "${d.ctaLabel.trim()}" → ${d.ctaUrl.trim()}`);
  }
  return lines.join(" ");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
