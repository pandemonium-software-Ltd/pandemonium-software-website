"use client";

// Dashboard "Newsletter" card — replaces the earlier "Coming soon"
// placeholder.
//
// Shows:
//   • Current subscriber count (confirmed only)
//   • Last sent date (from history)
//   • "Compose newsletter" button → modal composer
//   • Send history (collapsed list of past sends)
//
// Submitting from the composer hits POST /api/account/newsletter,
// which sends to all confirmed subscribers via Resend's batch
// endpoint. Counts as 1 of the customer's NEWSLETTER_MONTHLY_SEND_LIMIT
// monthly sends (currently 1).

import { useRef, useState } from "react";
import {
  NEWSLETTER_SUBJECT_MAX,
  NEWSLETTER_BODY_MAX,
  NEWSLETTER_MONTHLY_SEND_LIMIT,
} from "@/lib/newsletter/limits";

export type NewsletterSummary = {
  subscriberCount: number;
  /** ISO of the most recent successful send, if any. */
  lastSentAt?: string;
  /** Total successful sends this calendar month. */
  sentThisMonth: number;
  /** Recent history entries (newest first). Capped client-side
   *  to ~5 in the rendered list. */
  history: ReadonlyArray<{
    id: string;
    subject: string;
    sentAt: string;
    recipientCount: number;
    status: "draft" | "sending" | "sent" | "failed";
  }>;
};

type Props = {
  token: string;
  summary: NewsletterSummary;
  /** Effective monthly send cap = default + admin grant bonus.
   *  Caller computes from prospect.onboardingData.adminGrants[mm]
   *  + NEWSLETTER_MONTHLY_SEND_LIMIT. Falls back to the bare
   *  default if not provided so legacy callers keep working. */
  cap?: number;
};

type TemplateId =
  | "announcement"
  | "monthly-update"
  | "promo"
  | "personal-note";

type Draft = {
  template: TemplateId;
  subject: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
};

const TEMPLATES: { id: TemplateId; label: string; hint: string }[] = [
  {
    id: "announcement",
    label: "Announcement",
    hint: "Big headline + image + one CTA. Use for launches or news.",
  },
  {
    id: "monthly-update",
    label: "Monthly update",
    hint: "2-4 short news items, each its own block. Use for regular updates.",
  },
  {
    id: "promo",
    label: "Offer / promo",
    hint: "Bold branded banner + offer + CTA. Use for time-bound deals.",
  },
  {
    id: "personal-note",
    label: "Personal note",
    hint: "Minimal — plain text + signature. Use for one-off messages.",
  },
];

function emptyDraft(): Draft {
  return {
    template: "monthly-update",
    subject: "",
    body: "",
    imageUrl: "",
    ctaLabel: "",
    ctaUrl: "",
  };
}

export default function NewsletterCard({
  token,
  summary,
  cap: capProp,
}: Props) {
  // Effective cap = caller-provided (admin-granted bonus included)
  // or default. Internal references use this so admin grants flow
  // through without changing the call sites.
  const cap = capProp ?? NEWSLETTER_MONTHLY_SEND_LIMIT;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const subscribersDialogRef = useRef<HTMLDialogElement | null>(null);
  // Hidden <input type=file> the "Upload image" button triggers.
  // Refs (not state) because the dialog re-mounts between opens.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pending, setPending] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Subscriber management state (loaded on first dialog open).
  const [subscribers, setSubscribers] = useState<
    Array<{
      email: string;
      firstName?: string;
      status: "active" | "unsubscribed" | "unconfirmed";
      subscribedAt?: string;
    }>
  >([]);
  const [subscribersLoaded, setSubscribersLoaded] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFirstName, setAddFirstName] = useState("");
  const [subscribersBusy, setSubscribersBusy] = useState(false);
  const [subscribersErr, setSubscribersErr] = useState<string | null>(null);

  async function loadSubscribers() {
    setSubscribersErr(null);
    try {
      const res = await fetch(
        `/api/account/newsletter/subscribers?token=${encodeURIComponent(token)}`,
      );
      const json = (await res.json()) as {
        success?: boolean;
        subscribers?: typeof subscribers;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setSubscribersErr(json.error ?? "Couldn't load subscribers.");
        return;
      }
      setSubscribers(json.subscribers ?? []);
      setSubscribersLoaded(true);
    } catch (e) {
      setSubscribersErr(e instanceof Error ? e.message : String(e));
    }
  }

  function openSubscribers() {
    setSubscribersErr(null);
    if (!subscribersLoaded) loadSubscribers();
    subscribersDialogRef.current?.showModal();
  }

  async function addSubscriber() {
    setSubscribersErr(null);
    if (!addEmail.trim()) {
      setSubscribersErr("Enter an email.");
      return;
    }
    setSubscribersBusy(true);
    try {
      const res = await fetch("/api/account/newsletter/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: addEmail.trim().toLowerCase(),
          firstName: addFirstName.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setSubscribersErr(json.error ?? "Couldn't add subscriber.");
        return;
      }
      setAddEmail("");
      setAddFirstName("");
      await loadSubscribers();
    } catch (e) {
      setSubscribersErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubscribersBusy(false);
    }
  }

  async function removeSubscriber(email: string) {
    if (!confirm(`Unsubscribe ${email}?`)) return;
    setSubscribersErr(null);
    setSubscribersBusy(true);
    try {
      const res = await fetch("/api/account/newsletter/subscribers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setSubscribersErr(json.error ?? "Couldn't remove.");
        return;
      }
      await loadSubscribers();
    } catch (e) {
      setSubscribersErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubscribersBusy(false);
    }
  }

  const remaining = Math.max(
    0,
    cap - summary.sentThisMonth,
  );
  const atCap = remaining === 0;
  const noSubscribers = summary.subscriberCount === 0;

  function openComposer() {
    setError(null);
    setSuccess(null);
    setDraft(emptyDraft());
    dialogRef.current?.showModal();
  }

  function validate(): string | null {
    if (!draft.subject.trim()) return "Add a subject.";
    if (!draft.body.trim()) return "Add some body text.";
    if (draft.ctaLabel.trim() && !draft.ctaUrl.trim())
      return "Set a button link, or clear the button label.";
    if (draft.imageUrl.trim()) {
      try {
        new URL(draft.imageUrl);
      } catch {
        return "Image URL doesn't look valid.";
      }
    }
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
      const res = await fetch("/api/account/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          template: draft.template,
          subject: draft.subject.trim(),
          body: draft.body.trim(),
          imageUrl: draft.imageUrl.trim() || undefined,
          ctaLabel: draft.ctaLabel.trim() || undefined,
          ctaUrl: draft.ctaUrl.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        recipientCount?: number;
        error?: string;
        partialErrors?: string[];
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Send failed. Try again.");
        return;
      }
      dialogRef.current?.close();
      setSuccess(
        `Sent to ${json.recipientCount ?? 0} subscriber${(json.recipientCount ?? 0) === 1 ? "" : "s"}.${
          json.partialErrors?.length
            ? ` (Some chunks failed — check your inbox for the details.)`
            : ""
        }`,
      );
      setTimeout(() => setSuccess(null), 10000);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-2xl bg-white p-6 shadow-card md:p-7">
      <h2 className="font-serif text-xl font-semibold text-navy-900">
        📬 Newsletter
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <Stat label="Subscribers" value={summary.subscriberCount} />
        <Stat
          label="Sent this month"
          value={`${summary.sentThisMonth}/${cap}`}
        />
        <Stat
          label="Last sent"
          value={
            summary.lastSentAt
              ? formatRelativeDate(summary.lastSentAt)
              : "—"
          }
        />
      </dl>

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
          disabled={atCap || noSubscribers}
          className="rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
        >
          Compose newsletter
        </button>
        <button
          type="button"
          onClick={openSubscribers}
          className="rounded-full border-2 border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-900 hover:border-navy-400"
        >
          Manage subscribers
        </button>
        <span className="text-xs text-navy-500">
          {noSubscribers
            ? "Need subscribers first — your homepage signup widget will collect them, or add manually"
            : atCap
              ? "Monthly send used — resets on the 1st"
              : `${remaining} of ${cap} send remaining this month`}
        </span>
      </div>

      {summary.history.length > 0 && (
        <details className="mt-5 rounded-xl border border-navy-100 bg-cream-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-700 hover:bg-cream-100">
            Recent sends ({summary.history.length})
          </summary>
          <ul className="space-y-1 px-3 pb-3 pt-1 text-sm">
            {summary.history.slice(0, 5).map((h) => (
              <li
                key={h.id}
                className="flex items-baseline justify-between gap-3 border-t border-navy-100 pt-2 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-navy-900">{h.subject}</p>
                  <p className="text-[11px] text-navy-500">
                    {formatRelativeDate(h.sentAt)} · {h.recipientCount}{" "}
                    recipient{h.recipientCount === 1 ? "" : "s"} ·{" "}
                    <span
                      className={
                        h.status === "sent"
                          ? "text-green-700"
                          : h.status === "failed"
                            ? "text-ember-700"
                            : "text-navy-500"
                      }
                    >
                      {h.status}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto max-w-2xl rounded-2xl border-0 p-0 shadow-lift backdrop:bg-navy-900/50"
      >
        <div className="p-6 md:p-7">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Compose newsletter
          </h2>
          <p className="mt-1 text-sm text-navy-600">
            Sends to all {summary.subscriberCount} confirmed
            subscriber{summary.subscriberCount === 1 ? "" : "s"}. Counts
            as your monthly included send.
          </p>

          <div className="mt-4 space-y-4">
            {/* Template picker */}
            <div>
              <span className="block text-sm font-semibold text-navy-900">
                Template
              </span>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {TEMPLATES.map((t) => (
                  <label
                    key={t.id}
                    className={[
                      "block cursor-pointer rounded-lg border-2 p-3 text-sm",
                      draft.template === t.id
                        ? "border-navy-900 bg-navy-50"
                        : "border-navy-200 bg-white hover:border-navy-400",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={draft.template === t.id}
                      onChange={() =>
                        setDraft({ ...draft, template: t.id })
                      }
                      className="sr-only"
                    />
                    <p className="font-semibold text-navy-900">{t.label}</p>
                    <p className="mt-1 text-xs text-navy-600">{t.hint}</p>
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="block text-sm font-semibold text-navy-900">
                Subject line
              </span>
              <input
                type="text"
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
                maxLength={NEWSLETTER_SUBJECT_MAX}
                placeholder="e.g. June update — what's new this month"
                className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
              />
              <span className="mt-1 block text-[11px] text-navy-500">
                {draft.subject.length}/{NEWSLETTER_SUBJECT_MAX} — most
                inboxes truncate around 60 chars.
              </span>
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-navy-900">
                Body
              </span>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={8}
                maxLength={NEWSLETTER_BODY_MAX}
                placeholder="Write your newsletter. Separate paragraphs with a blank line. For monthly-update template, each paragraph becomes a separate news block."
                className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
              />
              <span className="mt-1 block text-[11px] text-navy-500">
                {draft.body.length}/{NEWSLETTER_BODY_MAX} — short and
                scannable wins. Long emails kill open rates.
              </span>
            </label>

            <div>
              <span className="block text-sm font-semibold text-navy-900">
                Image (optional)
              </span>
              <p className="mt-1 text-[11px] text-navy-500">
                Upload one image to appear at the top of your email
                (JPG / PNG / WebP, max 5MB), or paste a URL to a photo
                already hosted elsewhere.
              </p>
              {/* Hidden file input — opened by the "Upload image"
               *  button. We POST it to /api/account/upload-newsletter-image
               *  which puts to R2 + returns the public URL. The URL
               *  lands in draft.imageUrl exactly as if the customer
               *  had pasted it manually, so downstream code (preview,
               *  send) doesn't need to differentiate uploads from
               *  pasted URLs. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImageError(null);
                  setImageUploading(true);
                  try {
                    const form = new FormData();
                    form.append("token", token);
                    form.append("file", file);
                    const res = await fetch(
                      "/api/account/upload-newsletter-image",
                      { method: "POST", body: form },
                    );
                    const json = (await res.json().catch(() => ({}))) as {
                      success?: boolean;
                      url?: string;
                      error?: string;
                    };
                    if (!res.ok || !json.success || !json.url) {
                      setImageError(json.error ?? "Upload failed.");
                      return;
                    }
                    setDraft((d) => ({ ...d, imageUrl: json.url! }));
                  } catch (err) {
                    setImageError(
                      err instanceof Error ? err.message : String(err),
                    );
                  } finally {
                    setImageUploading(false);
                    // Reset the input so picking the same file twice
                    // still fires the change handler.
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }
                }}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageUploading}
                  className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 hover:border-navy-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {imageUploading ? "Uploading…" : "Upload image"}
                </button>
                {draft.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, imageUrl: "" })}
                    className="text-xs text-navy-500 underline hover:text-navy-900"
                  >
                    Remove image
                  </button>
                )}
              </div>
              <label className="mt-2 block">
                <span className="block text-[11px] font-semibold text-navy-700">
                  …or paste an image URL
                </span>
                <input
                  type="url"
                  value={draft.imageUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, imageUrl: e.target.value })
                  }
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              </label>
              {imageError && (
                <p
                  role="alert"
                  className="mt-2 rounded-md bg-ember-50 px-2 py-1 text-xs text-ember-700"
                >
                  {imageError}
                </p>
              )}
              {draft.imageUrl && !imageError && (
                <>
                  {/* Live preview — gives the customer immediate
                   *  visual feedback the image is the right one
                   *  before sending. Capped at h-32 so a tall photo
                   *  doesn't push the composer fields off-screen.
                   *  next/image isn't a good fit: the URL is
                   *  arbitrary (R2 OR a pasted third-party host the
                   *  customer typed in), so the remotePatterns
                   *  whitelist would have to allow * — which defeats
                   *  the point. Plain <img> with a fixed height
                   *  bound keeps this thumbnail tight. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={draft.imageUrl}
                    alt="Newsletter image preview"
                    className="mt-2 h-32 w-auto rounded-md border border-navy-100 object-cover"
                    onError={() =>
                      setImageError(
                        "That image URL didn't load. Check the link or upload directly.",
                      )
                    }
                  />
                </>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
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
                  maxLength={40}
                  placeholder="e.g. Book now"
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
                  onChange={(e) =>
                    setDraft({ ...draft, ctaUrl: e.target.value })
                  }
                  maxLength={500}
                  placeholder="https://yoursite.co.uk/contact"
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
                : `Send to ${summary.subscriberCount}`}
            </button>
          </div>
        </div>
      </dialog>

      {/* ---------- Subscribers management dialog ---------- */}
      <dialog
        ref={subscribersDialogRef}
        className="m-auto max-w-2xl rounded-2xl border-0 p-0 shadow-lift backdrop:bg-navy-900/50"
      >
        <div className="p-6 md:p-7">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold text-navy-900">
              Subscribers
            </h2>
            <a
              href={`/api/account/newsletter/subscribers?token=${encodeURIComponent(token)}&format=csv`}
              className="text-xs font-semibold text-navy-700 underline hover:text-navy-900"
              download
            >
              Download CSV
            </a>
          </div>
          <p className="mt-1 text-sm text-navy-600">
            {summary.subscriberCount} confirmed · {subscribers.length} total
            (including unconfirmed + unsubscribed)
          </p>

          {/* Manual add row */}
          <div className="mt-4 rounded-xl border-2 border-navy-100 bg-cream-50 p-3">
            <p className="text-xs font-semibold text-navy-900">
              Add a subscriber manually
            </p>
            <p className="mt-1 text-[11px] text-navy-600">
              Only add people who&apos;ve given you consent —
              they&apos;ll skip the email confirmation step.
            </p>
            <div className="mt-2 flex flex-wrap items-stretch gap-2">
              <input
                type="text"
                value={addFirstName}
                onChange={(e) => setAddFirstName(e.target.value)}
                placeholder="First name (optional)"
                maxLength={60}
                disabled={subscribersBusy}
                className="min-w-[140px] flex-1 rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm"
              />
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="email@example.com"
                maxLength={254}
                disabled={subscribersBusy}
                className="min-w-[200px] flex-[2] rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={addSubscriber}
                disabled={subscribersBusy}
                className="rounded-full bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
              >
                {subscribersBusy ? "…" : "Add"}
              </button>
            </div>
          </div>

          {subscribersErr && (
            <p
              className="mt-2 rounded-lg border border-ember-200 bg-ember-50 p-2 text-xs text-ember-800"
              role="alert"
            >
              {subscribersErr}
            </p>
          )}

          {/* List */}
          {!subscribersLoaded ? (
            <p className="mt-4 text-sm text-navy-600">Loading subscribers…</p>
          ) : subscribers.length === 0 ? (
            <p className="mt-4 text-sm text-navy-600">
              No subscribers yet. As people sign up via your site,
              they&apos;ll appear here.
            </p>
          ) : (
            <ul className="mt-4 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-navy-100 p-2">
              {subscribers.map((s) => (
                <li
                  key={s.email}
                  className="flex items-baseline justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-cream-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-navy-900">
                      {s.email}
                    </p>
                    <p className="text-[11px] text-navy-500">
                      {s.firstName ?? "—"} ·{" "}
                      <span
                        className={
                          s.status === "active"
                            ? "text-green-700"
                            : s.status === "unsubscribed"
                              ? "text-navy-400 line-through"
                              : "text-amber-700"
                        }
                      >
                        {s.status}
                      </span>
                    </p>
                  </div>
                  {s.status !== "unsubscribed" && (
                    <button
                      type="button"
                      onClick={() => removeSubscriber(s.email)}
                      disabled={subscribersBusy}
                      className="text-[11px] text-navy-500 hover:text-ember-700"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => subscribersDialogRef.current?.close()}
              className="rounded-lg border-2 border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 hover:border-navy-400"
            >
              Done
            </button>
          </div>
        </div>
      </dialog>
    </article>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-navy-100 bg-cream-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </p>
      <p className="mt-1 font-serif text-xl font-semibold text-navy-900">
        {value}
      </p>
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}
