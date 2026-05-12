"use client";

// Hub Step 4 — "Newsletter setup (optional)" section.
//
// Rendered inline at the bottom of Step4Content when the customer
// has the Newsletter module selected. Captures the minimal
// pre-launch config so the subscribe widget on their homepage is
// functional from day 1:
//   - Sender name (what subscribers see in their inbox)
//   - Sender email local-part (paired with their domain)
//   - Subscribe widget headline + body + CTA copy
//
// Stored under `content.newsletter.config` so it round-trips
// through Step 4's standard save pipeline — no new API surface
// needed.
//
// Subscriber list, drafts, sent history all live alongside in
// `content.newsletter.subscribers` / `.drafts` / `.history`
// but are populated post-launch (subscribe widget + dashboard
// composer respectively).

import { useState, useEffect } from "react";
import {
  NEWSLETTER_SENDER_NAME_MAX,
  NEWSLETTER_SENDER_LOCAL_MAX,
  NEWSLETTER_WIDGET_HEADLINE_MAX,
  NEWSLETTER_WIDGET_BODY_MAX,
  NEWSLETTER_WIDGET_CTA_MAX,
} from "@/lib/newsletter/limits";

type Config = {
  senderName?: string;
  senderEmailLocal?: string;
  widgetHeadline?: string;
  widgetBody?: string;
  widgetCta?: string;
};

type Draft = {
  senderName: string;
  senderEmailLocal: string;
  widgetHeadline: string;
  widgetBody: string;
  widgetCta: string;
};

type Props = {
  /** Current saved config. */
  current?: Config;
  /** Customer's domain — paired with senderEmailLocal in the
   *  preview ("news@yourdomain.co.uk"). Empty if Step 2 hasn't
   *  captured it yet — we render a placeholder. */
  customerDomain: string;
  /** Read-only state propagated from the Hub. */
  readOnly: boolean;
  /** Save callback. Receives the full config object. */
  onSave: (config: Config) => Promise<boolean>;
};

const DEFAULTS = {
  senderName: "",
  senderEmailLocal: "news",
  widgetHeadline: "Stay in the loop",
  widgetBody: "One short update a month — tips, offers, news. No spam.",
  widgetCta: "Subscribe",
};

function fromConfig(c: Config | undefined): Draft {
  return {
    senderName: c?.senderName ?? DEFAULTS.senderName,
    senderEmailLocal: c?.senderEmailLocal ?? DEFAULTS.senderEmailLocal,
    widgetHeadline: c?.widgetHeadline ?? DEFAULTS.widgetHeadline,
    widgetBody: c?.widgetBody ?? DEFAULTS.widgetBody,
    widgetCta: c?.widgetCta ?? DEFAULTS.widgetCta,
  };
}

export default function Step4NewsletterSection({
  current,
  customerDomain,
  readOnly,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => fromConfig(current));
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (saveState !== "saving") setDraft(fromConfig(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current?.senderName,
    current?.senderEmailLocal,
    current?.widgetHeadline,
    current?.widgetBody,
    current?.widgetCta,
  ]);

  function validate(): string | null {
    if (draft.senderName.trim() && draft.senderName.length > NEWSLETTER_SENDER_NAME_MAX)
      return `Sender name must be ≤ ${NEWSLETTER_SENDER_NAME_MAX} chars.`;
    if (draft.senderEmailLocal.trim()) {
      if (!/^[a-z0-9._-]+$/i.test(draft.senderEmailLocal.trim()))
        return "Sender email local-part: letters, numbers, dot, dash, underscore only.";
      if (draft.senderEmailLocal.length > NEWSLETTER_SENDER_LOCAL_MAX)
        return `Sender email local-part must be ≤ ${NEWSLETTER_SENDER_LOCAL_MAX} chars.`;
    }
    return null;
  }

  async function save() {
    setErrorMsg(null);
    const v = validate();
    if (v) {
      setErrorMsg(v);
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    const config: Config = {
      senderName: draft.senderName.trim() || undefined,
      senderEmailLocal: draft.senderEmailLocal.trim().toLowerCase() || undefined,
      widgetHeadline: draft.widgetHeadline.trim() || undefined,
      widgetBody: draft.widgetBody.trim() || undefined,
      widgetCta: draft.widgetCta.trim() || undefined,
    };
    const ok = await onSave(config);
    if (ok) {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } else {
      setSaveState("error");
      setErrorMsg("Save failed — try again.");
    }
  }

  // Live preview values (default fallback when fields are blank).
  const previewSender = (draft.senderName.trim() || "Acme Co.") +
    " <" +
    (draft.senderEmailLocal.trim().toLowerCase() || DEFAULTS.senderEmailLocal) +
    "@" +
    (customerDomain || "yourdomain.co.uk") +
    ">";

  return (
    <section className="rounded-2xl border-2 border-sky-200 bg-sky-50/40 p-5 md:p-6">
      <h3 className="font-serif text-lg font-semibold text-navy-900">
        📬 Newsletter setup
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-navy-700">
        Quick config for the newsletter signup widget that appears
        on your homepage from launch. You can tweak any of this
        post-launch from your dashboard.
      </p>

      <div className="mt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              Sender name
            </span>
            <input
              type="text"
              value={draft.senderName}
              onChange={(e) =>
                setDraft({ ...draft, senderName: e.target.value })
              }
              placeholder="e.g. Acme Gardens"
              maxLength={NEWSLETTER_SENDER_NAME_MAX}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
            <span className="mt-1 block text-[11px] text-navy-500">
              {draft.senderName.length}/{NEWSLETTER_SENDER_NAME_MAX} — what
              shows in the recipient&apos;s inbox.
            </span>
          </label>

          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              Sender email
            </span>
            <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border-2 border-navy-200">
              <input
                type="text"
                value={draft.senderEmailLocal}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    senderEmailLocal: e.target.value.toLowerCase(),
                  })
                }
                placeholder="news"
                maxLength={NEWSLETTER_SENDER_LOCAL_MAX}
                disabled={readOnly}
                className="flex-1 bg-white px-3 py-2 font-mono text-sm text-navy-900 outline-none disabled:bg-cream-50"
              />
              <span className="flex items-center bg-cream-100 px-2 font-mono text-xs text-navy-600">
                @{customerDomain || "yourdomain.co.uk"}
              </span>
            </div>
            <span className="mt-1 block text-[11px] text-navy-500">
              Letters, numbers, dot, dash, underscore. Lowercase.
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-navy-100 bg-white p-3 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-navy-500">
            Preview — From line
          </span>
          <p className="mt-1 font-mono text-navy-700">{previewSender}</p>
        </div>

        <div className="space-y-3 border-t border-navy-100 pt-4">
          <p className="text-sm font-semibold text-navy-900">
            Subscribe widget copy
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-navy-700">
              Headline
            </span>
            <input
              type="text"
              value={draft.widgetHeadline}
              onChange={(e) =>
                setDraft({ ...draft, widgetHeadline: e.target.value })
              }
              maxLength={NEWSLETTER_WIDGET_HEADLINE_MAX}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
            <span className="mt-1 block text-[11px] text-navy-500">
              {draft.widgetHeadline.length}/{NEWSLETTER_WIDGET_HEADLINE_MAX}
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-navy-700">
              Body
            </span>
            <textarea
              value={draft.widgetBody}
              onChange={(e) =>
                setDraft({ ...draft, widgetBody: e.target.value })
              }
              maxLength={NEWSLETTER_WIDGET_BODY_MAX}
              rows={2}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
            <span className="mt-1 block text-[11px] text-navy-500">
              {draft.widgetBody.length}/{NEWSLETTER_WIDGET_BODY_MAX}
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-navy-700">
              Button label
            </span>
            <input
              type="text"
              value={draft.widgetCta}
              onChange={(e) => setDraft({ ...draft, widgetCta: e.target.value })}
              maxLength={NEWSLETTER_WIDGET_CTA_MAX}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
            <span className="mt-1 block text-[11px] text-navy-500">
              {draft.widgetCta.length}/{NEWSLETTER_WIDGET_CTA_MAX}
            </span>
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
          {saveState === "saving" ? "Saving…" : "Save newsletter setup"}
        </button>
        {saveState === "saved" && (
          <span className="text-xs font-semibold text-green-700">Saved ✓</span>
        )}
      </div>
    </section>
  );
}
