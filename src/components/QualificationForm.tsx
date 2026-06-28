"use client";

// Phase 2 qualification form. Twelve fields per phase2Schema, grouped
// into visual sections so it doesn't look like a wall of inputs.
//
// On submit, POSTs to /api/qualify with { token, ...phase2Data }. The
// API runs the compatibility rules engine and decides:
//   - accept            → "Thanks, fixed quote on its way" message
//   - clarification     → "I'll need a bit more from you" message
//   - flag_for_review   → "Let me check with my notes, I'll reply" message
//   - soft_reject       → "Probably not the right fit" message
//
// The exact wording for each comes back in the API response.

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  phase2Schema,
  type Phase2Data,
  ACQUISITION_OPTIONS,
  ENQUIRY_VOLUME_OPTIONS,
  BOOKING_HANDLING_OPTIONS,
  GBP_STATUS_OPTIONS,
  MODULE_OPTIONS,
} from "@/lib/schemas";
import { site } from "@/lib/site";

// Module pricing (Playbook §3) — shown inline so the prospect can
// weigh each add-on against its cost without bouncing back to /pricing.
const MODULE_DETAILS: Record<
  (typeof MODULE_OPTIONS)[number],
  { setup: string; monthly: string; tagline: string }
> = {
  "Online Booking": {
    setup: "+£25 setup",
    monthly: "+£8/mo",
    tagline: "Customers pick a slot themselves via Cal.com.",
  },
  "Enquiry Form": {
    setup: "+£25 setup",
    monthly: "+£8/mo",
    tagline: "Get enquiries to your inbox without exposing your email.",
  },
  Newsletter: {
    setup: "+£65 setup",
    monthly: "+£12/mo",
    tagline: "Email your customers monthly. I send it for you.",
  },
  Offers: {
    setup: "+£25 setup",
    monthly: "+£8/mo",
    tagline:
      "Promo strip on your homepage you control from your dashboard.",
  },
  "Google Business Profile Setup/Audit": {
    setup: "£79 one-off",
    monthly: "+£5/mo",
    tagline:
      "We sort your Google listing AND your top reviews refresh on your site automatically.",
  },
  "Multi-location": {
    setup: "+£20 per extra location",
    monthly: "no extra monthly",
    tagline:
      "Extra contact / map / hours block per additional location. Tell me how many at intake.",
  },
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; outcome: string; message: string }
  | { kind: "error"; message: string };

export default function QualificationForm({
  token,
  prospectName,
  prospectBusiness,
}: {
  token: string;
  prospectName: string;
  prospectBusiness: string | null;
}) {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Phase2Data>({
    resolver: zodResolver(phase2Schema),
    mode: "onTouched",
    defaultValues: {
      modulesInterest: [],
      acquisitionMonthlyCost: 0,
      brandColourUnsure: false,
    },
  });

  const colourUnsure = watch("brandColourUnsure");

  const onSubmit = handleSubmit(async (data) => {
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...data }),
      });
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; outcome?: string; message?: string; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        setState({
          kind: "error",
          message:
            body?.error ??
            "Something went wrong on my end. Please try again, or email me directly.",
        });
        return;
      }
      setState({
        kind: "success",
        outcome: body.outcome ?? "submitted",
        message:
          body.message ??
          "Thanks — got your answers. You'll hear back within 4 working hours.",
      });
    } catch {
      setState({
        kind: "error",
        message:
          "Couldn't reach the server. Check your connection and try again.",
      });
    }
  });

  // Mobile UX: scroll to top when success state takes over so the
  // user sees the confirmation immediately (without having to
  // scroll back up from where the submit button was).
  useEffect(() => {
    if (state.kind === "success") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state.kind]);

  if (state.kind === "success") {
    const isAccept = state.outcome === "accept";
    return (
      <div
        role="status"
        className="rounded-2xl border-2 border-navy-900 bg-cream-50 p-6 text-navy-900"
      >
        <h3 className="font-serif text-2xl font-semibold">
          Thanks, {firstName(prospectName)}.
        </h3>
        <p className="mt-3 text-[1rem] leading-relaxed text-navy-700">
          {state.message}
        </p>
        {isAccept && (
          <div className="mt-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              📬 The intake form link should be in your inbox now.
            </p>
            <p className="mt-2">
              If you can&apos;t find it in a minute or two, check your
              spam or junk folder — <code>modu-forge.co.uk</code> is a
              new sender domain so some inboxes are over-cautious at
              first. Marking it &quot;Not spam&quot; will help future
              emails reach you.
            </p>
          </div>
        )}
        <p className="mt-4 text-sm text-navy-600">
          Need me before the email lands?{" "}
          <a href={`mailto:${site.contactEmail}`} className="link">
            {site.contactEmail}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-10">
      {/* ---------- Section 1: How customers find you now ---------- */}
      <Section
        title="How customers find you now"
        intro="Helps me understand what your site needs to do — replace a paid platform, or just be your professional online home."
      >
        <SelectField
          id="acquisitionMethod"
          label="Where do most of your jobs come from at the moment?"
          required
          register={register("acquisitionMethod")}
          error={errors.acquisitionMethod?.message}
          options={ACQUISITION_OPTIONS}
          placeholder="Pick the closest match…"
        />
        <NumberField
          id="acquisitionMonthlyCost"
          label="How much do you spend on that per month?"
          hint="enter 0 if it's free / word of mouth"
          required
          register={register("acquisitionMonthlyCost", { valueAsNumber: true })}
          error={errors.acquisitionMonthlyCost?.message}
          min={0}
          max={100000}
          prefix="£"
        />
        <SelectField
          id="enquiryVolume"
          label="Roughly how many enquiries do you get per month?"
          required
          register={register("enquiryVolume")}
          error={errors.enquiryVolume?.message}
          options={ENQUIRY_VOLUME_OPTIONS}
          placeholder="Pick a range…"
        />
      </Section>

      {/* ---------- Section 2: Bookings and online presence ---------- */}
      <Section
        title="How you handle bookings and your online presence"
        intro="No right or wrong answers — I just need a picture of what's there now."
      >
        <SelectField
          id="bookingHandling"
          label="How do you currently handle bookings or job enquiries?"
          required
          register={register("bookingHandling")}
          error={errors.bookingHandling?.message}
          options={BOOKING_HANDLING_OPTIONS}
          placeholder="Pick the closest match…"
        />
        <SelectField
          id="gbpStatus"
          label="Do you have a Google Business Profile?"
          required
          register={register("gbpStatus")}
          error={errors.gbpStatus?.message}
          options={GBP_STATUS_OPTIONS}
          placeholder="Pick whichever fits best…"
        />
      </Section>

      {/* ---------- Section 3: Look and feel ---------- */}
      <Section
        title="Look and feel"
        intro="Optional — we'll pick sensible defaults if you'd rather we just get on with it."
      >
        <div>
          <label
            htmlFor="brandColour"
            className="mb-2 block text-sm font-semibold text-navy-900"
          >
            Brand colour preference{" "}
            <span className="font-normal text-navy-500">(optional)</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="brandColour"
              type="text"
              maxLength={20}
              placeholder="e.g. navy blue, #1d3a5f"
              disabled={colourUnsure}
              {...register("brandColour")}
              className={[
                "flex-1 rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 placeholder:text-navy-400 focus:border-navy-900 focus:outline-none disabled:bg-cream-100 disabled:text-navy-500",
                errors.brandColour ? "border-ember-500" : "border-navy-200",
              ].join(" ")}
            />
            <label className="inline-flex select-none items-center gap-2 text-sm text-navy-700">
              <input
                type="checkbox"
                {...register("brandColourUnsure")}
                className="h-4 w-4 rounded border-2 border-navy-300 text-navy-900 focus:ring-navy-900"
              />
              I&apos;m not sure
            </label>
          </div>
        </div>
      </Section>

      {/* ---------- Section 4: What you'd want ---------- */}
      <Section
        title="What you'd want from your site"
        intro="Tick whichever modules sound useful. Each can be added or removed later — nothing's locked in."
      >
        <div className="space-y-3">
          {MODULE_OPTIONS.map((opt) => {
            const detail = MODULE_DETAILS[opt];
            return (
              <label
                key={opt}
                className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-navy-200 bg-white p-4 transition-colors hover:border-navy-400"
              >
                <input
                  type="checkbox"
                  value={opt}
                  {...register("modulesInterest")}
                  className="mt-0.5 h-5 w-5 flex-none rounded border-2 border-navy-300 text-navy-900 focus:ring-navy-900"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-navy-900">{opt}</span>
                    <span className="text-sm text-navy-600">
                      {detail.setup}, {detail.monthly}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-navy-700">{detail.tagline}</p>
                </div>
              </label>
            );
          })}
        </div>

        <TextareaField
          id="specificFeatures"
          label="Anything specific you'd want on the site?"
          hint="optional — plain English is fine"
          register={register("specificFeatures")}
          error={errors.specificFeatures?.message}
          maxLength={2000}
          placeholder="e.g. a gallery of past jobs, a service-area map, a list of areas you cover…"
        />

        <TextareaField
          id="dealBreakers"
          label="Anything that would make this not work for you?"
          hint="optional — say so now and we'll save us both time"
          register={register("dealBreakers")}
          error={errors.dealBreakers?.message}
          maxLength={2000}
          placeholder="e.g. I need this in two weeks; I need to sell products online; I want a custom quote system…"
        />
      </Section>

      {/* ---------- Section 5: Timeline ---------- */}
      <Section title="Timeline">
        <div>
          <label
            htmlFor="goLiveDate"
            className="mb-2 block text-sm font-semibold text-navy-900"
          >
            When would you like to go live?{" "}
            <span aria-hidden="true" className="text-ember-600">
              *
            </span>
            <span className="block text-xs font-normal text-navy-500 mt-1">
              I need at least 14 days from your intake completion to build it
              properly. Pick a date that gives us that breathing room.
            </span>
          </label>
          <input
            id="goLiveDate"
            type="date"
            {...register("goLiveDate")}
            className={[
              "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 focus:border-navy-900 focus:outline-none md:max-w-xs",
              errors.goLiveDate ? "border-ember-500" : "border-navy-200",
            ].join(" ")}
          />
          {errors.goLiveDate?.message && (
            <p className="mt-2 text-sm text-ember-700">
              {errors.goLiveDate.message}
            </p>
          )}
        </div>
      </Section>

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
          {prospectBusiness
            ? `Submitting on behalf of ${prospectBusiness}.`
            : `Submitting as ${prospectName}.`}
        </p>
        <button
          type="submit"
          className="btn-primary"
          disabled={isSubmitting || state.kind === "submitting"}
        >
          {isSubmitting || state.kind === "submitting"
            ? "Sending…"
            : "Send my answers"}
        </button>
      </div>
    </form>
  );
}

// ---------- Helper components ----------

type FieldRegister = ReturnType<ReturnType<typeof useForm<Phase2Data>>["register"]>;

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-serif text-xl font-semibold text-navy-900 md:text-2xl">
        {title}
      </h2>
      {intro && (
        <p className="mt-2 text-sm text-navy-600">{intro}</p>
      )}
      <div className="mt-5 space-y-5">{children}</div>
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

function NumberField({
  id,
  label,
  hint,
  required,
  register,
  error,
  min,
  max,
  prefix,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  register: FieldRegister;
  error?: string;
  min?: number;
  max?: number;
  prefix?: string;
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
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-navy-500">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step="1"
          {...register}
          className={[
            "w-full rounded-xl border-2 bg-white py-3 text-base text-navy-900 focus:border-navy-900 focus:outline-none",
            prefix ? "pl-10 pr-4" : "px-4",
            error ? "border-ember-500" : "border-navy-200",
          ].join(" ")}
        />
      </div>
      {error && <p className="mt-2 text-sm text-ember-700">{error}</p>}
    </div>
  );
}

function TextareaField({
  id,
  label,
  hint,
  register,
  error,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  register: FieldRegister;
  error?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-navy-900"
      >
        {label}
        {hint && (
          <span className="font-normal text-navy-500"> ({hint})</span>
        )}
      </label>
      <textarea
        id={id}
        rows={4}
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

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}
