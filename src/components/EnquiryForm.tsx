"use client";

// Phase 1 enquiry form. Replaces the old mailto: implementation with a
// real server submission to /api/enquiry, which:
//   1. Validates with phase1Schema (zod)
//   2. Creates a Notion Prospects record (status "Phase 1 Complete")
//   3. Sends Ben an internal notification with the qualification link
//   4. Returns success → we show the confirmation card
//
// Field set is the seven Phase 1 fields from Playbook §7. No "tell us
// what you want" textarea — that's covered in Phase 2 qualification.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  phase1Schema,
  type Phase1Data,
  BUSINESS_TYPE_OPTIONS,
  WEBSITE_SITUATION_OPTIONS,
} from "@/lib/schemas";
import { site } from "@/lib/site";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function EnquiryForm() {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Phase1Data>({
    resolver: zodResolver(phase1Schema),
    mode: "onTouched",
  });

  const onSubmit = handleSubmit(async (data) => {
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setState({
          kind: "error",
          message:
            body?.error ??
            "Something went wrong on my end. Please try again, or email me directly.",
        });
        return;
      }
      setState({ kind: "success" });
    } catch {
      setState({
        kind: "error",
        message:
          "Couldn't reach the server. Check your connection and try again, or email me directly.",
      });
    }
  });

  if (state.kind === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border-2 border-navy-900 bg-cream-50 p-6 text-navy-900"
      >
        <h3 className="font-serif text-2xl font-semibold">Thanks — got it.</h3>
        <p className="mt-3 text-[1rem] leading-relaxed text-navy-700">
          I&apos;ve just emailed you a short qualification form — about
          10 minutes to fill in. Once you submit it, I&apos;ll review
          your answers personally and reply within 4 working hours
          (UK time) with a fixed quote and target go-live date.
        </p>
        <div className="mt-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            📬 Can&apos;t find the email in a minute or two?
          </p>
          <p className="mt-2">
            Check your spam or junk folder — <code>modu-forge.co.uk</code>{" "}
            is a brand-new sender domain, so some inboxes are extra
            cautious at first. If you find it there, marking it &quot;Not
            spam&quot; will help future emails from me reach you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Honeypot — hidden from real users, fills only for bots. The API
          route rejects submissions where this field is non-empty. */}
      <input
        type="text"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        {...register("company_website" as never)}
        style={{
          position: "absolute",
          left: "-10000px",
          width: 1,
          height: 1,
          opacity: 0,
        }}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="name"
          label="Your name"
          required
          register={register("name")}
          error={errors.name?.message}
          autoComplete="name"
          maxLength={100}
        />
        <Field
          id="email"
          type="email"
          label="Email address"
          required
          register={register("email")}
          error={errors.email?.message}
          autoComplete="email"
          maxLength={254}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="phone"
          type="tel"
          label="Phone"
          required
          register={register("phone")}
          error={errors.phone?.message}
          autoComplete="tel"
          maxLength={30}
          hint="in case email bounces"
        />
        <Field
          id="location"
          label="Where in the UK are you?"
          required
          placeholder="e.g. Oxford, or Cotswolds"
          register={register("location")}
          error={errors.location?.message}
          autoComplete="address-level2"
          maxLength={100}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="business"
          label="Business name"
          required
          register={register("business")}
          error={errors.business?.message}
          autoComplete="organization"
          maxLength={100}
        />
        <SelectField
          id="businessType"
          label="Business type"
          required
          register={register("businessType")}
          error={errors.businessType?.message}
          placeholder="Pick the closest match…"
          options={BUSINESS_TYPE_OPTIONS}
        />
      </div>

      <SelectField
        id="websiteSituation"
        label="Your current website"
        required
        register={register("websiteSituation")}
        error={errors.websiteSituation?.message}
        placeholder="Pick whichever fits best…"
        options={WEBSITE_SITUATION_OPTIONS}
      />

      <div className="rounded-xl bg-cream-100 p-5 text-sm text-navy-700">
        <p>
          <strong className="text-navy-900">What happens next:</strong> when
          you click &quot;Send enquiry&quot;, your details go to my private
          Notion workspace. An AI assistant reads them and drafts a reply
          against my playbook; I review and send it within 4 working hours.
          No sales call, no chase-ups.
        </p>
      </div>

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-xl border-2 border-ember-500 bg-white p-4 text-sm text-ember-700"
        >
          {state.message}
        </div>
      )}

      <div className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-navy-600">
          Prefer plain email?{" "}
          <a href={`mailto:${site.contactEmail}`} className="link">
            {site.contactEmail}
          </a>
        </p>
        <button
          type="submit"
          className="btn-primary"
          disabled={isSubmitting || state.kind === "submitting"}
        >
          {isSubmitting || state.kind === "submitting"
            ? "Sending…"
            : "Send enquiry"}
        </button>
      </div>
    </form>
  );
}

// ---------- Field components ----------

type FieldRegister = ReturnType<ReturnType<typeof useForm<Phase1Data>>["register"]>;

function Field({
  id,
  label,
  type = "text",
  required,
  register,
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
  register: FieldRegister;
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
        {hint && (
          <span className="font-normal text-navy-500"> ({hint})</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        {...register}
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
  register,
  error,
  options,
  placeholder = "Pick one…",
}: {
  id: string;
  label: string;
  required?: boolean;
  register: FieldRegister;
  error?: string;
  options: readonly string[];
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
      </label>
      <select
        id={id}
        defaultValue=""
        {...register}
        className={[
          "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 focus:border-navy-900 focus:outline-none",
          error ? "border-ember-500" : "border-navy-200",
        ].join(" ")}
      >
        <option value="" disabled>
          {placeholder}
        </option>
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
