// Newsletter subscribe widget — renders in the customer-site
// footer when the Newsletter module is configured.
//
// Submission flow:
//   1. Visitor types email + first name (optional)
//   2. POST to <apiOrigin>/api/public/subscribe with customerToken
//   3. Server creates an unconfirmed subscriber + sends a confirmation
//      email with a one-click confirm link
//   4. Visitor clicks the link → /confirm-subscription/[token]
//      on the marketing site → flips confirmed=true
//   5. Welcome email lands in their inbox
//
// The widget UI optimistically shows a "check your email" message
// after submission so the visitor knows what to do next.
//
// Brand-aware: uses the customer's primary colour for the CTA
// button via Tailwind's `bg-brand-primary-500` (set as a CSS
// variable in layout.tsx).

"use client";

import { useEffect, useState } from "react";

type Props = {
  customerToken: string;
  apiOrigin: string;
  headline: string;
  body: string;
  ctaLabel: string;
  /** Visual variant. "footer" is a slim row of inputs; "inline" is
   *  a more prominent card block used at the bottom of the homepage. */
  variant?: "footer" | "inline";
  /** True when the customer-site Worker was uploaded as a preview
   *  version (PREVIEW_ACCESS_TOKEN env set). Server-determined,
   *  passed in from Footer. The widget ALSO does a client-side
   *  iframe check below — either signal puts the widget into
   *  non-functional "preview only" mode so a customer reviewing
   *  their own preview doesn't pollute their subscriber list with
   *  test emails. */
  isPreviewBuild?: boolean;
};

export default function SubscribeWidget({
  customerToken,
  apiOrigin,
  headline,
  body,
  ctaLabel,
  variant = "footer",
  isPreviewBuild = false,
}: Props) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Client-side iframe detection — catches pre-commit live builds
  // viewed inside the Hub iframe (where PREVIEW_ACCESS_TOKEN isn't
  // set on the Worker but the customer is reviewing through the
  // wrapper page). Default true initially so SSR doesn't flash an
  // interactive widget for one frame; useEffect corrects to false
  // for genuine direct visitors.
  const [isInFrame, setIsInFrame] = useState(false);
  useEffect(() => {
    try {
      if (window.self !== window.top) setIsInFrame(true);
    } catch {
      // Cross-origin frame access throws — that's still framed.
      setIsInFrame(true);
    }
  }, []);
  const isPreviewMode = isPreviewBuild || isInFrame;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPreviewMode) return; // Defence — disabled state shouldn't submit
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(
        `${apiOrigin.replace(/\/$/, "")}/api/public/subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerToken,
            email: email.trim(),
            firstName: firstName.trim() || undefined,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Couldn't sign you up just now. Try again?");
        return;
      }
      setSuccess(
        "Check your inbox — I just sent you a confirmation link.",
      );
      setEmail("");
      setFirstName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (variant === "inline") {
    return (
      <section
        className="rounded-2xl border border-navy-100 bg-cream-50 p-7 md:p-9"
        aria-label="Subscribe to our newsletter"
      >
        <h2 className="font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          {headline}
        </h2>
        <p className="mt-2 max-w-2xl text-base text-navy-700">{body}</p>
        <Form
          email={email}
          firstName={firstName}
          pending={pending}
          ctaLabel={ctaLabel}
          isPreview={isPreviewMode}
          onEmailChange={setEmail}
          onFirstNameChange={setFirstName}
          onSubmit={submit}
        />
        {isPreviewMode && <PreviewLabel />}
        {!isPreviewMode && error && (
          <p className="mt-3 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
        {!isPreviewMode && success && (
          <p className="mt-3 text-sm font-semibold text-green-700" role="status">
            {success}
          </p>
        )}
      </section>
    );
  }

  // Footer variant — slim, single-row layout.
  return (
    <section
      className="border-t border-navy-100 bg-cream-50 py-7"
      aria-label="Subscribe to our newsletter"
    >
      <div className="container-content max-w-3xl">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-navy-900">
              {headline}
            </h2>
            <p className="mt-1 text-sm text-navy-700">{body}</p>
          </div>
        </div>
        <Form
          email={email}
          firstName={firstName}
          pending={pending}
          ctaLabel={ctaLabel}
          isPreview={isPreviewMode}
          onEmailChange={setEmail}
          onFirstNameChange={setFirstName}
          onSubmit={submit}
          compact
        />
        {isPreviewMode && <PreviewLabel compact />}
        {!isPreviewMode && error && (
          <p className="mt-2 text-xs text-ember-700" role="alert">
            {error}
          </p>
        )}
        {!isPreviewMode && success && (
          <p
            className="mt-2 text-xs font-semibold text-green-700"
            role="status"
          >
            {success}
          </p>
        )}
      </div>
    </section>
  );
}

/** Small label that renders in place of error/success in preview
 *  mode. Reassures the operator (customer reviewing their own
 *  build) that the widget WILL work once live, but is intentionally
 *  inert during review so test signups don't pollute the list. */
function PreviewLabel({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={
        compact
          ? "mt-2 text-[11px] font-semibold uppercase tracking-wider text-navy-500"
          : "mt-3 text-xs font-semibold uppercase tracking-wider text-navy-500"
      }
    >
      Preview only — signups disabled. Goes live with your site.
    </p>
  );
}

function Form({
  email,
  firstName,
  pending,
  ctaLabel,
  isPreview,
  onEmailChange,
  onFirstNameChange,
  onSubmit,
  compact = false,
}: {
  email: string;
  firstName: string;
  pending: boolean;
  ctaLabel: string;
  isPreview: boolean;
  onEmailChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  compact?: boolean;
}) {
  // Preview mode: same shape, greyed out, button shows "Preview".
  // Inputs are still rendered (not removed) so the operator sees
  // EXACTLY what visitors will see when live.
  const disabled = pending || isPreview;
  return (
    <form
      onSubmit={onSubmit}
      className={
        compact
          ? "mt-3 flex flex-wrap items-stretch gap-2"
          : "mt-5 flex flex-wrap items-stretch gap-3"
      }
    >
      <input
        type="text"
        placeholder="First name (optional)"
        value={firstName}
        onChange={(e) => onFirstNameChange(e.target.value)}
        maxLength={60}
        disabled={disabled}
        readOnly={isPreview}
        className={
          compact
            ? "min-w-[140px] flex-1 rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
            : "min-w-[180px] flex-1 rounded-lg border-2 border-navy-200 bg-white px-4 py-2.5 text-base text-navy-900 outline-none focus:border-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
        }
        autoComplete={isPreview ? "off" : "given-name"}
      />
      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        required={!isPreview}
        maxLength={254}
        disabled={disabled}
        readOnly={isPreview}
        className={
          compact
            ? "min-w-[180px] flex-[2] rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
            : "min-w-[220px] flex-[2] rounded-lg border-2 border-navy-200 bg-white px-4 py-2.5 text-base text-navy-900 outline-none focus:border-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
        }
        autoComplete={isPreview ? "off" : "email"}
      />
      <button
        type="submit"
        disabled={disabled}
        title={isPreview ? "Disabled in preview — live after launch" : undefined}
        className={
          compact
            ? "rounded-full bg-brand-primary-500 px-4 py-1.5 text-sm font-semibold text-brand-primary-text shadow-lift hover:bg-brand-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
            : "rounded-full bg-brand-primary-500 px-6 py-2.5 text-base font-semibold text-brand-primary-text shadow-lift hover:bg-brand-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isPreview ? "Preview" : pending ? "Sending…" : ctaLabel}
      </button>
    </form>
  );
}
