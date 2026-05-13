"use client";

// DirectEditCard — post-launch "update a single field" composer.
//
// Why this exists: the legacy free-text change-request form sends
// the customer's prose to a Haiku classifier which proposes patches
// + may escalate. That works, but every submission burns LLM tokens
// + sometimes the model paraphrases the customer's words. For the
// common case where the customer knows EXACTLY which field they
// want to update + what the new value is, a structured form is
// faster, cheaper, and 100% verbatim.
//
// Flow:
//   1. Customer picks the field from a dropdown ("Tagline", "Phone
//      number", "About us blurb", "Address", "Years of experience"
//      etc. — only the 10 single-text-field targets the server
//      whitelists).
//   2. The relevant input renders below (textarea for long copy,
//      <input type=tel> for phone, etc.).
//   3. Submit → POST /api/account/change-request with
//      `kind: "direct-edit"` and a structured `directEdit` payload.
//      Server validates length / format, applies the patch
//      directly to Notion (no Haiku), dispatches a live build.
//   4. Success → success toast + dialog closes + soft refresh so
//      the new value is reflected on the dashboard.
//
// Cap: own 2/month budget separate from offers + free-text. Same
// reset cycle (1st of month UTC).

import { useRef, useState } from "react";
import {
  countActiveChangeRequestsByKind,
  MONTHLY_DIRECT_EDIT_LIMIT,
  type ChangeRequest,
} from "@/lib/notion-prospects";

type Props = {
  token: string;
  changeRequests: ChangeRequest[];
};

/** Whitelist mirrors DIRECT_EDIT_TARGETS in the change-request
 *  route. When you add a new server target there, add a row here
 *  with its label + input renderer + cap. */
type FieldKey =
  | "copy.tagline"
  | "copy.aboutBlurb"
  | "business.contactName"
  | "business.phoneDisplay"
  | "business.publicEmail"
  | "business.address"
  | "business.serviceArea"
  | "content.trust.associations"
  | "content.trust.awards"
  | "content.trust.yearsExperience";

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  blurb: string;
  inputKind: "text" | "textarea" | "tel" | "email" | "number";
  max?: number;
  placeholder?: string;
  /** Number of textarea rows. Only consulted when inputKind=textarea. */
  rows?: number;
}> = [
  {
    key: "copy.tagline",
    label: "Hero tagline",
    blurb:
      "The big one-liner under your business name on the homepage. Short, confident, no jargon.",
    inputKind: "text",
    max: 200,
    placeholder: "e.g. Trusted Oxford plumbing — same day where we can",
  },
  {
    key: "copy.aboutBlurb",
    label: "About us blurb",
    blurb:
      "A short paragraph or two for the About page. Tell visitors who you are, who you serve, and what makes you different.",
    inputKind: "textarea",
    max: 5000,
    rows: 8,
    placeholder:
      "We've been doing this since 2018. Honest, on-time, and happy to talk through any job before you commit.",
  },
  {
    key: "business.contactName",
    label: "Contact name",
    blurb: "Who replies to enquiries — shown on the Contact page.",
    inputKind: "text",
    max: 100,
    placeholder: "e.g. Lucas Bell",
  },
  {
    key: "business.phoneDisplay",
    label: "Phone number (display)",
    blurb:
      "The phone number visitors will see in your header and footer. Format it however you like — we keep your spacing.",
    inputKind: "tel",
    max: 30,
    placeholder: "07123 456 789",
  },
  {
    key: "business.publicEmail",
    label: "Public email address",
    blurb: "The email address visitors will see and reply to.",
    inputKind: "email",
    max: 254,
    placeholder: "you@yourdomain.co.uk",
  },
  {
    key: "business.address",
    label: "Address",
    blurb:
      "Postal address shown on your site + in the structured data search engines read. UK format.",
    inputKind: "textarea",
    max: 500,
    rows: 3,
    placeholder: "12 High Street, Oxford, OX1 4AB",
  },
  {
    key: "business.serviceArea",
    label: "Service area",
    blurb: "Where you work. Plain English — 'Oxford and surrounding villages' beats a list of postcodes.",
    inputKind: "text",
    max: 500,
    placeholder: "Oxfordshire — Oxford, Witney, Bicester",
  },
  {
    key: "content.trust.associations",
    label: "Associations / certifications",
    blurb:
      "Trade-body memberships or certifications shown on the About page (e.g. FMB, Gas Safe).",
    inputKind: "text",
    max: 500,
    placeholder: "FMB · Gas Safe Registered (no. 123456)",
  },
  {
    key: "content.trust.awards",
    label: "Awards",
    blurb: "Industry awards or recognition shown on the About page.",
    inputKind: "text",
    max: 500,
    placeholder: "Builder of the Year 2024 (Oxfordshire Trade Awards)",
  },
  {
    key: "content.trust.yearsExperience",
    label: "Years of experience",
    blurb:
      "A whole number, shown on the About page (e.g. '15 years experience').",
    inputKind: "number",
    placeholder: "15",
  },
];

export default function DirectEditCard({ token, changeRequests }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [fieldKey, setFieldKey] = useState<FieldKey>("copy.tagline");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const usedThisMonth = countActiveChangeRequestsByKind(
    changeRequests,
    "direct-edit",
  );
  const remaining = Math.max(0, MONTHLY_DIRECT_EDIT_LIMIT - usedThisMonth);
  const atCap = remaining === 0;

  const field = FIELDS.find((f) => f.key === fieldKey)!;

  function openComposer() {
    setError(null);
    setSuccess(null);
    setValue("");
    setFieldKey("copy.tagline");
    dialogRef.current?.showModal();
  }

  async function submit() {
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please enter a new value.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/account/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          message: `Direct edit: ${field.label} → ${trimmed.slice(0, 100)}${trimmed.length > 100 ? "…" : ""}`,
          kind: "direct-edit",
          directEdit: {
            target: fieldKey,
            newValue: trimmed,
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
        setError(json.error ?? "Couldn't apply that change just now.");
        return;
      }
      dialogRef.current?.close();
      const remainingAfter = remaining - 1;
      setSuccess(
        json.autoApplied && !json.buildWarning
          ? `Done — your ${field.label.toLowerCase()} is updated. Live on your site in about 2 minutes. (${remainingAfter} of ${MONTHLY_DIRECT_EDIT_LIMIT} text edits remaining this month.)`
          : json.autoApplied && json.buildWarning
            ? `Saved — there's a hiccup with the build (${json.buildWarning}). We've been notified and will sort it. (${remainingAfter} of ${MONTHLY_DIRECT_EDIT_LIMIT} remaining.)`
            : `Submitted. (${remainingAfter} of ${MONTHLY_DIRECT_EDIT_LIMIT} text edits remaining this month.)`,
      );
      setTimeout(() => setSuccess(null), 12000);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-2xl border-2 border-navy-100 bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Text edit
          </p>
          <h3 className="mt-1 font-serif text-lg font-semibold text-navy-900">
            Update text on your site
          </h3>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
            atCap
              ? "bg-navy-100 text-navy-700"
              : "bg-green-100 text-green-800",
          ].join(" ")}
        >
          {usedThisMonth}/{MONTHLY_DIRECT_EDIT_LIMIT} used
        </span>
      </div>
      <p className="mt-3 text-sm text-navy-700">
        Quick single-field updates — tagline, address, phone, email,
        service area, years of experience and more. Saves to your site
        in about 2 minutes. {MONTHLY_DIRECT_EDIT_LIMIT} a month,
        included in your subscription.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openComposer}
          disabled={atCap}
          className="rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-cream-50 shadow-lift transition-all hover:-translate-y-px hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {atCap ? "Allowance used this month" : "Update a text field"}
        </button>
        {success && (
          <span
            role="status"
            className="rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-900"
          >
            {success}
          </span>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="m-0 w-full max-w-lg rounded-2xl bg-cream-50 p-0 shadow-lift backdrop:bg-navy-900/70 sm:m-auto"
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) void submit();
          }}
        >
          <div className="p-6 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold text-navy-900">
                Update a text field
              </h2>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="text-navy-500 hover:text-navy-900"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-navy-600">
              Pick the field you want to change, type the new value,
              save. Counts as 1 of your {MONTHLY_DIRECT_EDIT_LIMIT}{" "}
              monthly text edits. Live on your site within a couple of
              minutes.
            </p>

            <label className="mt-5 block">
              <span className="block text-sm font-semibold text-navy-900">
                Which field?
              </span>
              <select
                value={fieldKey}
                onChange={(e) => {
                  setFieldKey(e.target.value as FieldKey);
                  setValue("");
                }}
                className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
              >
                {FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-navy-500">
                {field.blurb}
              </span>
            </label>

            <label className="mt-4 block">
              <span className="block text-sm font-semibold text-navy-900">
                New value
              </span>
              {field.inputKind === "textarea" ? (
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={field.max}
                  rows={field.rows ?? 4}
                  placeholder={field.placeholder}
                  className="mt-1 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              ) : (
                <input
                  type={field.inputKind}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={field.max}
                  placeholder={field.placeholder}
                  inputMode={
                    field.inputKind === "number" ? "numeric" : undefined
                  }
                  className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900"
                />
              )}
              {field.max && (
                <span className="mt-1 block text-[11px] text-navy-500">
                  {value.length}/{field.max} characters
                </span>
              )}
            </label>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md bg-ember-50 px-3 py-2 text-sm text-ember-700"
              >
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="text-sm font-semibold text-navy-700 hover:text-navy-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !value.trim()}
                className="rounded-full bg-navy-900 px-5 py-2 text-sm font-semibold text-cream-50 shadow-lift transition-all hover:-translate-y-px hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save change"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </article>
  );
}
