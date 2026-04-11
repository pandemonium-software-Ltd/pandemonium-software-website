"use client";

import { useState } from "react";
import { site } from "@/lib/site";

const BUSINESS_TYPE_OPTIONS = [
  // Trades
  "Plumber",
  "Electrician",
  "Heating engineer",
  "Builder",
  "Roofer",
  "Gardener / Landscaper",
  "Painter / Decorator",
  "Joiner / Carpenter",
  "Tiler / Plasterer",
  "Handyman",
  "Locksmith",
  "Tree surgeon",
  // Other small businesses
  "Photographer",
  "Therapist",
  "Personal trainer / Yoga instructor",
  "Salon",
  "Accountant / Consultant",
  "Wedding supplier",
  "Pet services",
  "Tutor",
  "Cleaner",
  "Event planner",
  "Other",
];

const WEBSITE_SITUATION_OPTIONS = [
  "I don't have a website yet",
  "I have a basic website that needs replacing",
  "I have a decent website but want something better",
  "I have a website but I don't own it / can't update it",
];

type FormState = {
  name: string;
  email: string;
  phone: string;
  business: string;
  businessType: string;
  location: string;
  websiteSituation: string;
  message: string;
};

const INITIAL: FormState = {
  name: "",
  email: "",
  phone: "",
  business: "",
  businessType: "",
  location: "",
  websiteSituation: "",
  message: "",
};

export default function EnquiryForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [opened, setOpened] = useState(false);

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const blur = (k: keyof FormState) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
  };

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.name.trim()) errors.name = "Please tell us your name.";
  if (!form.email.trim()) {
    errors.email = "We need an email address to reply to.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "That doesn't look like an email address.";
  }
  if (!form.location.trim()) {
    errors.location = "We need a UK location — town or county is fine.";
  }
  if (!form.websiteSituation) {
    errors.websiteSituation = "Pick whichever option fits best.";
  }
  if (!form.message.trim() || form.message.trim().length < 10) {
    errors.message = "A couple of sentences about what you're after, please.";
  }

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      name: true,
      email: true,
      phone: true,
      business: true,
      businessType: true,
      location: true,
      websiteSituation: true,
      message: true,
    });
    if (!isValid) return;

    const subject = `Website enquiry from ${form.name.trim()}${form.business.trim() ? ` (${form.business.trim()})` : ""}`;
    const bodyLines = [
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      form.phone.trim() ? `Phone: ${form.phone.trim()}` : null,
      form.business.trim() ? `Business name: ${form.business.trim()}` : null,
      form.businessType.trim() ? `Business type: ${form.businessType.trim()}` : null,
      `Location: ${form.location.trim()}`,
      `Current website: ${form.websiteSituation}`,
      "",
      "What I'm after:",
      form.message.trim(),
      "",
      "— Sent from pandemonium-software-website.benpandher.workers.dev",
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
          id="phone"
          type="tel"
          label="Phone"
          hint="optional"
          value={form.phone}
          onChange={set("phone")}
          onBlur={blur("phone")}
          autoComplete="tel"
          maxLength={30}
        />
        <Field
          id="location"
          label="Where in the UK are you?"
          required
          placeholder="e.g. Oxford, or Cotswolds"
          value={form.location}
          onChange={set("location")}
          onBlur={blur("location")}
          error={showError("location") ? errors.location : undefined}
          autoComplete="address-level2"
          maxLength={100}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="business"
          label="Business name"
          hint="optional"
          value={form.business}
          onChange={set("business")}
          onBlur={blur("business")}
          autoComplete="organization"
          maxLength={100}
        />
        <SelectField
          id="businessType"
          label="Business type"
          hint="optional"
          value={form.businessType}
          onChange={set("businessType")}
          onBlur={blur("businessType")}
          placeholder="Pick one…"
          options={BUSINESS_TYPE_OPTIONS}
        />
      </div>

      <SelectField
        id="websiteSituation"
        label="Your current website"
        required
        value={form.websiteSituation}
        onChange={set("websiteSituation")}
        onBlur={blur("websiteSituation")}
        error={showError("websiteSituation") ? errors.websiteSituation : undefined}
        placeholder="Pick whichever fits best…"
        options={WEBSITE_SITUATION_OPTIONS}
      />

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
          message pre-filled so you can review and send it. Nothing leaves
          your computer until you hit send in your email app.
        </p>
      </div>

      <div className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-navy-600">
          Prefer plain email? Write to{" "}
          <a href={`mailto:${site.contactEmail}`} className="link">
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
          <p className="font-semibold text-navy-900">
            Your email app should have opened.
          </p>
          <p className="mt-2 text-sm">
            Review the pre-filled message and hit send. If nothing happened,
            copy the details and email{" "}
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
  placeholder,
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
  placeholder?: string;
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
        placeholder={placeholder}
        className={[
          "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 placeholder:text-navy-400 focus:border-navy-900 focus:outline-none",
          error ? "border-ember-500" : "border-navy-200",
        ].join(" ")}
      />
      {error && <p className="mt-2 text-sm text-ember-700">{error}</p>}
    </div>
  );
}

function SelectField({
  id,
  label,
  required,
  value,
  onChange,
  onBlur,
  error,
  options,
  placeholder = "Pick one…",
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onBlur: () => void;
  error?: string;
  options: readonly string[];
  placeholder?: string;
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
      <select
        id={id}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required={required}
        className={[
          "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 focus:border-navy-900 focus:outline-none",
          error ? "border-ember-500" : "border-navy-200",
        ].join(" ")}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-sm text-ember-700">{error}</p>}
    </div>
  );
}
