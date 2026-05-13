// Enquiry form — renders on /contact when the customer's Enquiry
// Form module is configured.
//
// Submission flow:
//   1. Visitor fills name + email + (optional) phone + message
//   2. POST to <apiOrigin>/api/public/enquiry with customerToken
//   3. Marketing site validates + sends the email via Resend to
//      the customer's recipientEmail. Reply-to is the visitor's
//      email so the customer hits reply and goes straight back to
//      the person who enquired.
//   4. Widget shows a success message; reset the form.
//
// Preview gating: same env + iframe detection as SubscribeWidget.
// Either signal puts the form into "preview only" mode so test
// submissions from a pre-commit live build or post-commit preview
// don't fire real emails to the customer.
//
// Brand-aware: uses `bg-brand-primary-500` for the CTA so it
// inherits the customer's chosen colour at build time.
//
// Anti-spam: a hidden honeypot input (`hp`) is included in the form
// — server checks it's empty and silently drops anything that
// fills it. Bots fill every input they see; legitimate users leave
// hidden inputs alone.

"use client";

import { useEffect, useState } from "react";

type Props = {
  customerToken: string;
  apiOrigin: string;
  /** Business name interpolated into the success copy ("Thanks —
   *  Lucas at BobBuilders will be in touch within a working day").
   *  Optional; falls back to "we" when absent. */
  businessName?: string;
  /** True when the customer-site Worker was uploaded as a preview
   *  version (PREVIEW_ACCESS_TOKEN env set). Server-determined,
   *  passed in from the page. The widget ALSO does a client-side
   *  iframe check below — either signal puts the form into
   *  non-functional "preview only" mode so a customer reviewing
   *  their own preview doesn't fire test enquiries to themselves. */
  isPreviewBuild?: boolean;
};

export default function EnquiryFormWidget({
  customerToken,
  apiOrigin,
  businessName,
  isPreviewBuild = false,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot — kept in state so we can include it in the POST body
  // verbatim if a bot fills it (server logs + silent-drops).
  const [hp, setHp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Client-side iframe detection — mirror of SubscribeWidget. SSR
  // defaults to false then useEffect corrects on the client. The
  // server's PREVIEW_ACCESS_TOKEN check (isPreviewBuild prop) is
  // the primary gate; iframe detection catches pre-commit live
  // builds embedded in the Hub.
  const [isInFrame, setIsInFrame] = useState(false);
  useEffect(() => {
    try {
      if (window.self !== window.top) setIsInFrame(true);
    } catch {
      setIsInFrame(true);
    }
  }, []);
  const isPreviewMode = isPreviewBuild || isInFrame;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPreviewMode) return; // Defence — disabled state shouldn't submit.
    setError(null);
    if (!name.trim()) {
      setError("Please tell us your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please add your email so we can reply.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Please write at least a sentence so we know how to help.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(
        `${apiOrigin.replace(/\/$/, "")}/api/public/enquiry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerToken,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
            message: message.trim(),
            hp,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(
          json.error ??
            "Couldn't send your message just now. Please try again, or use the phone / email above.",
        );
        return;
      }
      setSuccess(true);
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setHp("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't send your message just now. Try again later.",
      );
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-2xl border-2 border-green-200 bg-green-50 p-6 text-center"
      >
        <p className="font-serif text-xl font-semibold text-green-900">
          Got it — thanks{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}.
        </p>
        <p className="mt-2 text-sm text-green-800">
          {businessName
            ? `${businessName} will reply within a working day.`
            : "We'll reply within a working day."}{" "}
          Keep an eye on your inbox.
        </p>
      </div>
    );
  }

  // Shared input class so each field reads identically; readOnly
  // when in preview so a customer reviewing their own site can SEE
  // exactly what visitors will, just can't submit.
  const inputClass =
    "w-full rounded-lg border-2 border-navy-200 bg-white px-4 py-2.5 text-base text-navy-900 outline-none focus:border-navy-900 disabled:cursor-not-allowed disabled:opacity-60";
  const disabled = pending || isPreviewMode;

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Honeypot — hidden visually + from screen readers + from
       *  keyboard tab order. A bot that scrapes the DOM will still
       *  find + fill it; the server silently rejects. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden opacity-0"
      >
        <label>
          Don&apos;t fill this in
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Your name <span aria-hidden="true" className="text-ember-600">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required={!isPreviewMode}
            disabled={disabled}
            readOnly={isPreviewMode}
            maxLength={100}
            autoComplete={isPreviewMode ? "off" : "name"}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Email <span aria-hidden="true" className="text-ember-600">*</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={!isPreviewMode}
            disabled={disabled}
            readOnly={isPreviewMode}
            maxLength={254}
            autoComplete={isPreviewMode ? "off" : "email"}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-sm font-semibold text-navy-900">
          Phone (optional)
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={disabled}
          readOnly={isPreviewMode}
          maxLength={30}
          autoComplete={isPreviewMode ? "off" : "tel"}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <label className="block">
        <span className="block text-sm font-semibold text-navy-900">
          Message <span aria-hidden="true" className="text-ember-600">*</span>
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required={!isPreviewMode}
          disabled={disabled}
          readOnly={isPreviewMode}
          rows={5}
          maxLength={5000}
          className={`mt-1 resize-y ${inputClass}`}
          placeholder="What can we help you with? The more detail you can share — what you need, where, when — the more useful the reply."
        />
        <span className="mt-1 block text-[11px] text-navy-500">
          {message.length}/5000
        </span>
      </label>

      {isPreviewMode && (
        <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
          Preview only — submissions disabled. Goes live with your site.
        </p>
      )}

      {error && !isPreviewMode && (
        <p
          role="alert"
          className="rounded-md bg-ember-50 px-3 py-2 text-sm text-ember-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={disabled}
        title={
          isPreviewMode
            ? "Disabled in preview — live after launch"
            : undefined
        }
        className="rounded-full bg-brand-primary-500 px-7 py-3 text-base font-semibold text-brand-primary-text shadow-lift hover:bg-brand-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPreviewMode
          ? "Preview"
          : pending
            ? "Sending…"
            : "Send your message"}
      </button>
    </form>
  );
}
