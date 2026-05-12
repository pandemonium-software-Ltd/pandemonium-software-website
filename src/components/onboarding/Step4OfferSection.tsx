"use client";

// Hub Step 4 — "Your launch offer (optional)" section.
//
// Rendered inline at the bottom of Step4Content when the customer
// has the Offers module selected. Lets the customer pre-set their
// first promotional strip before launch — headline, body, dates,
// CTA. The data ships at the customer's go-live and the strip
// appears on the homepage during the date range.
//
// Stored under `content.offers.current` so it round-trips through
// Step 4's standard save pipeline — no new API surface needed.
//
// Phase 1 (this commit): customer types + saves. Site renders if
// date range is current.
// Phase 2 (later): Cowork classification on submit, admin
// moderation queue, scheduled activate/expire via cron.

import { useState, useEffect } from "react";
import type { OfferEntry } from "@/lib/onboarding";
import {
  OFFER_HEADLINE_MAX,
  OFFER_BODY_MAX,
  OFFER_CTA_LABEL_MAX,
  OFFER_CTA_URL_MAX,
} from "@/lib/offers/limits";

type OfferDraft = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
};

type Props = {
  /** Current saved offer, if any. */
  current?: OfferEntry;
  /** Read-only state propagated from the Hub. */
  readOnly: boolean;
  /** Save callback — receives the new offer entry. Caller is
   *  responsible for merging into the content slice. */
  onSave: (offer: OfferEntry | null) => Promise<boolean>;
};

// Length caps live in src/lib/offers/limits.ts so Hub form,
// dashboard composer, server validator + schema all agree.
const HEADLINE_MAX = OFFER_HEADLINE_MAX;
const BODY_MAX = OFFER_BODY_MAX;
const CTA_LABEL_MAX = OFFER_CTA_LABEL_MAX;
const CTA_URL_MAX = OFFER_CTA_URL_MAX;

function emptyDraft(): OfferDraft {
  return {
    headline: "",
    body: "",
    ctaLabel: "",
    ctaUrl: "",
    startsAt: "",
    endsAt: "",
  };
}

function fromEntry(o: OfferEntry): OfferDraft {
  return {
    headline: o.headline,
    body: o.body ?? "",
    ctaLabel: o.ctaLabel ?? "",
    ctaUrl: o.ctaUrl ?? "",
    startsAt: o.startsAt,
    endsAt: o.endsAt,
  };
}

export default function Step4OfferSection({
  current,
  readOnly,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<OfferDraft>(() =>
    current ? fromEntry(current) : emptyDraft(),
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset draft when the saved offer changes externally (e.g. dashboard
  // composer wrote a new one, hub reloaded). Skipped during saves so
  // we don't fight in-progress edits.
  useEffect(() => {
    if (saveState !== "saving") {
      setDraft(current ? fromEntry(current) : emptyDraft());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.headline, current?.startsAt, current?.endsAt]);

  const hasAnyContent =
    draft.headline.trim() ||
    draft.body.trim() ||
    draft.ctaLabel.trim() ||
    draft.startsAt ||
    draft.endsAt;

  function buildEntry(): OfferEntry | null {
    if (!hasAnyContent) return null;
    const id = current?.id ?? crypto.randomUUID();
    const createdAt = current?.createdAt ?? new Date().toISOString();
    return {
      id,
      headline: draft.headline.trim(),
      body: draft.body.trim() || undefined,
      ctaLabel: draft.ctaLabel.trim() || undefined,
      ctaUrl: draft.ctaUrl.trim() || undefined,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      createdAt,
      status: "active",
    };
  }

  function validate(entry: OfferEntry | null): string | null {
    if (!entry) return null; // empty draft = clearing the offer
    if (!entry.headline) return "Add a headline (1-140 chars).";
    if (!entry.startsAt || !entry.endsAt)
      return "Pick both a start and end date.";
    if (entry.endsAt < entry.startsAt)
      return "End date can't be before start date.";
    if (entry.ctaLabel && !entry.ctaUrl)
      return "If you set a button label, add a link too (or clear the label).";
    return null;
  }

  async function save() {
    setErrorMsg(null);
    const entry = buildEntry();
    const validationErr = validate(entry);
    if (validationErr) {
      setErrorMsg(validationErr);
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    const ok = await onSave(entry);
    setSaveState(ok ? "saved" : "error");
    if (!ok) setErrorMsg("Save failed — try again.");
    if (ok) setTimeout(() => setSaveState("idle"), 2500);
  }

  async function clearOffer() {
    setErrorMsg(null);
    setSaveState("saving");
    const ok = await onSave(null);
    if (ok) {
      setDraft(emptyDraft());
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } else {
      setSaveState("error");
      setErrorMsg("Couldn't clear the offer — try again.");
    }
  }

  // Today (UK calendar) as the default min for date pickers.
  const todayUk = (() => {
    const d = new Date().toLocaleDateString("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const [day, month, year] = d.split("/");
    return `${year}-${month}-${day}`;
  })();

  return (
    <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          🏷️ Your launch offer (optional)
        </h3>
        {current && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
            Active {current.startsAt} → {current.endsAt}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-navy-700">
        Optionally set up a promotional strip that appears on your
        homepage from launch — headline, dates, optional button.
        You can leave this blank now and set it from your dashboard
        any time after launch.
      </p>

      <div className="mt-4 space-y-4">
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
            placeholder="e.g. Free quote on patio installs — June only"
            maxLength={HEADLINE_MAX}
            disabled={readOnly}
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
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
            placeholder="A short sentence or two of context. Keep it punchy — this sits in a slim strip at the top of your homepage."
            rows={2}
            maxLength={BODY_MAX}
            disabled={readOnly}
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
          <span className="mt-1 block text-[11px] text-navy-500">
            {draft.body.length}/{BODY_MAX}
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              Start date
            </span>
            <input
              type="date"
              value={draft.startsAt}
              onChange={(e) =>
                setDraft({ ...draft, startsAt: e.target.value })
              }
              min={todayUk}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              End date
            </span>
            <input
              type="date"
              value={draft.endsAt}
              onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              min={draft.startsAt || todayUk}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              Button label (optional)
            </span>
            <input
              type="text"
              value={draft.ctaLabel}
              onChange={(e) =>
                setDraft({ ...draft, ctaLabel: e.target.value })
              }
              placeholder="e.g. Get a quote"
              maxLength={CTA_LABEL_MAX}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              Button link (optional)
            </span>
            <input
              type="text"
              value={draft.ctaUrl}
              onChange={(e) => setDraft({ ...draft, ctaUrl: e.target.value })}
              placeholder="/contact OR https://..."
              maxLength={CTA_URL_MAX}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
          </label>
        </div>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-ember-200 bg-ember-50 p-2 text-sm text-ember-800"
        >
          {errorMsg}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={readOnly || saveState === "saving"}
          className="rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
        >
          {saveState === "saving"
            ? "Saving…"
            : current
              ? "Update offer"
              : "Save offer"}
        </button>
        {current && !readOnly && (
          <button
            type="button"
            onClick={clearOffer}
            disabled={saveState === "saving"}
            className="rounded-full border-2 border-navy-200 bg-white px-4 py-2 text-xs font-semibold text-navy-700 hover:border-navy-400"
          >
            Remove offer
          </button>
        )}
        {saveState === "saved" && (
          <span className="text-xs font-semibold text-green-700">Saved ✓</span>
        )}
      </div>
    </section>
  );
}
