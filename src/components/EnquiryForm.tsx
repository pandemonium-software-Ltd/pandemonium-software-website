"use client";

import { useState } from "react";
import { site } from "@/lib/site";

const TRADE_OPTIONS = [
  "Plumber",
  "Electrician",
  "Builder",
  "Gardener / Landscaper",
  "Roofer",
  "Painter / Decorator",
  "Joiner / Carpenter",
  "Heating engineer",
  "Locksmith",
  "Other",
];

type FormState = {
  name: string;
  email: string;
  business: string;
  trade: string;
  message: string;
};

const INITIAL: FormState = {
  name: "",
  email: "",
  business: "",
  trade: "",
  message: "",
};

export default function EnquiryForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [opened, setOpened] = useState(false);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const blur = (k: keyof FormState) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
  };

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.name.trim()) errors.name = "Please tell us your name.";
  if (!form.email.trim()) errors.email = "We need an email address to reply to.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "That doesn't look like an email address.";
  if (!form.message.trim() || form.message.trim().length < 10) errors.message = "A couple of sentences about what you're after, please.";

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, business: true, trade: true, message: true });
    if (!isValid) return;

    const subject = `Website enquiry from ${form.name.trim()}${form.business.trim() ? ` (${form.business.trim()})` : ""}`;
    const bodyLines = [
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      form.business.trim() ? `Business: ${form.business.trim()}` : null,
      form.trade.trim() ? `Trade: ${form.trade.trim()}` : null,
      "",
      "What I'm after:",
      form.message.trim(),
      "",
      "— Sent from pandemonium-software-website.vercel.app",
    ].filter(Boolean) as string[];

    const mailto = `mailto:${site.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
    window.location.href = mailto;
    setOpened(true);
  };

  const showError = (k: keyof FormState) => !!(touched[k] && errors[k]);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="name"
          label="Your name"
          required
          value={form.name}
          onChange={set("name")}
          onBlur={blur("name")}
          error={showError("name") ? errors.name : undefined}
          autoComplete="name"
          maxLength={100}
        />
        <Field
          id="email"
          type="email"
          label="Email address"
          required
          value={form.email}
          onChange={set("email")}
          onBlur={blur("email")}
          error={showError("email") ? errors.email : undefined}
          autoComplete="email"
          maxLength={254}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="business"
          label="Business name"
          value={form.business}
          onChange={set("business")}
          onBlur={blur("business")}
          autoComplete="organization"
          maxLength={100}
          hint="Optional"
        />
        <div>
          <label
            htmlFor="trade"
            className="mb-2 block text-sm font-semibold text-navy-900"
          >
            Trade <span className="font-normal text-navy-500">(optional)</span>
          </label>
          <select
            id="trade"
            value={form.trade}
            onChange={set("trade")}
            onBlur={blur("trade")}
            className="w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 focus:border-navy-900 focus:outline-none"
          >
            <option value="">Pick one…</option>
            {TRADE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="message"
          className="mb-2 block text-sm font-semibold text-navy-900"
        >
          Tell us a bit about what you&apos;re after{" "}
          <span aria-hidden="true" className="text-ember-600">
            *
          </span>
        </label>
        <textarea
          id="message"
          value={form.message}
          onChange={set("message")}
          onBlur={blur("message")}
          required
          rows={6}
          maxLength={2000}
          placeholder="A short description of your business and what you'd like on your website. Don't worry about getting it perfect — we'll fill in the blanks in a reply."
          className={[
            "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 placeholder:text-navy-400 focus:border-navy-900 focus:outline-none",
            showError("message") ? "border-ember-500" : "border-navy-200",
          ].join(" ")}
        />
        {showError("message") && (
          <p className="mt-2 text-sm text-ember-700">{errors.message}</p>
        )}
        <p className="mt-2 text-right text-xs text-navy-500">
          {form.message.length}/2000
        </p>
      </div>

      <div className="rounded-xl bg-cream-100 p-5 text-sm text-navy-700">
        <p>
          <strong className="text-navy-900">How this works:</strong> when you
          click &quot;Send enquiry&quot;, your email app will open with the
          message pre-filled so you can review and send it. Nothing leaves your
          computer until you hit send in your email app.
        </p>
      </div>

      <div className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-navy-600">
          Prefer plain email? Write to{" "}
          <a
            href={`mailto:${site.contactEmail}`}
            className="link"
          >
            {site.contactEmail}
          </a>
          .
        </p>
        <button
          type="submit"
          className="btn-primary"
          disabled={!isValid && Object.keys(touched).length > 0}
        >
          Send enquiry
        </button>
      </div>

      {opened && (
        <div
          role="status"
          className="rounded-xl border border-navy-900 bg-white p-5 text-navy-800"
        >
          <p className="font-semibold text-navy-900">Your email app should have opened.</p>
          <p className="mt-2 text-sm">
            Review the pre-filled message and hit send. If nothing
            happened, copy the details and email{" "}
            <a href={`mailto:${site.contactEmail}`} className="link">
              {site.contactEmail}
            </a>{" "}
            directly.
          </p>
        </div>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  type = "text",
  required,
  value,
  onChange,
  onBlur,
  error,
  autoComplete,
  maxLength,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  error?: string;
  autoComplete?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-navy-900"
      >
        {label}
        {required && (
          <>
            {" "}
            <span aria-hidden="true" className="text-ember-600">
              *
            </span>
          </>
        )}
        {!required && hint && (
          <span className="font-normal text-navy-500"> ({hint})</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required={required}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className={[
          "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 placeholder:text-navy-400 focus:border-navy-900 focus:outline-none",
          error ? "border-ember-500" : "border-navy-200",
        ].join(" ")}
      />
      {error && <p className="mt-2 text-sm text-ember-700">{error}</p>}
    </div>
  );
}
