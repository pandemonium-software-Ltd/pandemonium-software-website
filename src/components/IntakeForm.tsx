"use client";

// Phase 3 intake wizard.
//
// Seven sections of phase3Schema rendered as a step-by-step wizard.
// Each "Next" click validates just the current section (RHF trigger),
// saves it to Notion via /api/intake (isFinal: false), and advances.
//
// Final step has "Submit & continue to payment" which:
//   - validates the FULL schema
//   - POSTs with isFinal: true → server calculates fees + writes them
//     back, sends Ben a Phase 3 notification, returns a redirect
//   - browser follows the redirect to /payment/[token]
//
// All sections share a single useForm so RHF can validate the whole
// merged document on final submit. Per-section saves use getValues()
// to pull just that section's data and POST it as a partial patch.

// RHF's `valueAsNumber: true` turns an empty input into NaN, which
// zod's .optional() rejects. Use this in `setValueAs` for any optional
// numeric field so empty / blank / non-numeric → undefined.
const optionalNumber = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
};

import { useMemo, useState } from "react";
import {
  useForm,
  useFieldArray,
  Controller,
  type Control,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  phase3Schema,
  type Phase3Data,
  type Phase3Partial,
  VIBE_OPTIONS,
} from "@/lib/schemas";
import VibePreview from "@/components/VibePreview";
import {
  recommendedVibeFor,
  VIBE_FEATURES,
  VIBE_BEST_FOR,
} from "@/lib/vibe-recommendations";
import {
  BASE_SETUP_GBP,
  BASE_MONTHLY_GBP,
  MODULE_BOOKING_SETUP_GBP,
  MODULE_BOOKING_MONTHLY_GBP,
  MODULE_ENQUIRY_SETUP_GBP,
  MODULE_ENQUIRY_MONTHLY_GBP,
  MODULE_NEWSLETTER_SETUP_GBP,
  MODULE_NEWSLETTER_MONTHLY_GBP,
  MODULE_OFFERS_SETUP_GBP,
  MODULE_OFFERS_MONTHLY_GBP,
  GBP_ADDON_ONE_OFF_GBP,
  GBP_ADDON_MONTHLY_GBP,
  calculateFees,
} from "@/lib/fees";
import { site } from "@/lib/site";

// ---------- Step definitions ----------

type StepKey =
  | "businessBasics"
  | "contactDetails"
  | "services"
  | "brand"
  | "modules"
  | "socialProof"
  | "legal";

const STEPS: { key: StepKey; title: string; short: string }[] = [
  { key: "businessBasics", title: "Business basics", short: "Basics" },
  { key: "contactDetails", title: "Contact details", short: "Contact" },
  { key: "services", title: "Your services", short: "Services" },
  { key: "brand", title: "Look and feel", short: "Brand" },
  { key: "modules", title: "Modules and pricing", short: "Modules" },
  { key: "socialProof", title: "Social proof", short: "Proof" },
  { key: "legal", title: "Legal and consent", short: "Legal" },
];

const WEEKDAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

const VIBE_DETAILS: Record<
  (typeof VIBE_OPTIONS)[number],
  { title: string; tagline: string }
> = {
  traditional: {
    title: "Traditional",
    tagline: "Classic, established, navy + cream. Reassures regulars.",
  },
  modern: {
    title: "Modern",
    tagline: "Clean lines, generous whitespace, lots of mobile.",
  },
  premium: {
    title: "Premium",
    tagline: "Dark backgrounds, refined accents. For high-ticket trades.",
  },
  friendly: {
    title: "Friendly",
    tagline: "Warm colours, rounded edges, approachable copy.",
  },
};

// ---------- Defaults ----------

type IntakeDefaults = {
  contactDetails?: {
    contactName?: string;
    publicEmail?: string;
    phoneDisplay?: string;
    phoneTel?: string;
  };
  businessBasics?: {
    tradingName?: string;
    legalName?: string;
  };
  modules?: {
    moduleBooking?: boolean;
    moduleEnquiry?: boolean;
    moduleNewsletter?: boolean;
    moduleOffers?: boolean;
    gbpAddon?: boolean;
  };
};

function buildDefaultValues(
  saved: Phase3Partial,
  seed: IntakeDefaults,
): Partial<Phase3Data> {
  return {
    businessBasics: {
      legalName: saved.businessBasics?.legalName ?? seed.businessBasics?.legalName ?? "",
      tradingName: saved.businessBasics?.tradingName ?? seed.businessBasics?.tradingName ?? "",
      legalForm: saved.businessBasics?.legalForm ?? "Sole trader",
      companiesHouseNumber: saved.businessBasics?.companiesHouseNumber ?? "",
      vatNumber: saved.businessBasics?.vatNumber ?? "",
      yearEstablished: saved.businessBasics?.yearEstablished,
      elevatorPitch: saved.businessBasics?.elevatorPitch ?? "",
    },
    contactDetails: {
      contactName: saved.contactDetails?.contactName ?? seed.contactDetails?.contactName ?? "",
      phoneDisplay: saved.contactDetails?.phoneDisplay ?? seed.contactDetails?.phoneDisplay ?? "",
      phoneTel: saved.contactDetails?.phoneTel ?? seed.contactDetails?.phoneTel ?? "",
      publicEmail: saved.contactDetails?.publicEmail ?? seed.contactDetails?.publicEmail ?? "",
      address: saved.contactDetails?.address ?? "",
      serviceArea: saved.contactDetails?.serviceArea ?? "",
      openingHours:
        saved.contactDetails?.openingHours ??
        Object.fromEntries(
          WEEKDAYS.map((d) => [
            d.key,
            { open: d.key !== "sunday", from: "09:00", to: "17:00" },
          ]),
        ),
    },
    services: {
      services: saved.services?.services ?? [
        { name: "", description: "", featured: false },
      ],
      differentiator: saved.services?.differentiator ?? "",
    },
    brand: {
      primaryColour: saved.brand?.primaryColour ?? "#1d3a5f",
      secondaryColour: saved.brand?.secondaryColour,
      vibe: saved.brand?.vibe ?? "traditional",
      logoFileName: saved.brand?.logoFileName ?? "",
    },
    modules: {
      baseSelected: true,
      moduleBooking: saved.modules?.moduleBooking ?? seed.modules?.moduleBooking ?? false,
      moduleEnquiry: saved.modules?.moduleEnquiry ?? seed.modules?.moduleEnquiry ?? false,
      moduleNewsletter: saved.modules?.moduleNewsletter ?? seed.modules?.moduleNewsletter ?? false,
      moduleOffers: saved.modules?.moduleOffers ?? seed.modules?.moduleOffers ?? false,
      gbpAddon: saved.modules?.gbpAddon ?? seed.modules?.gbpAddon ?? false,
    },
    socialProof: {
      testimonials: saved.socialProof?.testimonials ?? [],
      associations: saved.socialProof?.associations ?? "",
      yearsExperience: saved.socialProof?.yearsExperience,
      awards: saved.socialProof?.awards ?? "",
    },
    // The legal block is intentionally cast: the schema types
    // isDataController + acceptsTerms as the literal `true`, but in
    // the form they start un-checked until the user actively ticks them.
    // RHF allows boolean here at runtime — the cast just silences TS.
    legal: {
      isDataController: (saved.legal?.isDataController ?? false) as true,
      acceptsTerms: (saved.legal?.acceptsTerms ?? false) as true,
      marketingConsent: saved.legal?.marketingConsent ?? false,
    },
  };
}

// ---------- Main component ----------

export default function IntakeForm({
  token,
  prospectName,
  businessType,
  savedPartial,
  seedDefaults,
}: {
  token: string;
  prospectName: string;
  /** Phase 1 businessType ("Plumber", "Solicitor"…) — used by the
   *  vibe picker to badge the recommended option for this customer.
   *  Optional because old prospects from before Phase 1 captured
   *  type cleanly may have it blank; the picker falls back to no
   *  badge in that case. */
  businessType?: string;
  savedPartial: Phase3Partial;
  seedDefaults: IntakeDefaults;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState<"idle" | "saving" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  const defaultValues = useMemo(
    () => buildDefaultValues(savedPartial, seedDefaults),
    [savedPartial, seedDefaults],
  );

  const methods = useForm<Phase3Data>({
    resolver: zodResolver(phase3Schema),
    mode: "onTouched",
    defaultValues: defaultValues as Phase3Data,
  });
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    watch,
    control,
    formState: { errors },
  } = methods;

  const currentStep = STEPS[stepIdx];

  async function saveSection(key: StepKey): Promise<boolean> {
    setBusy("saving");
    setError(null);
    try {
      const sectionData = getValues(key);
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, isFinal: false, [key]: sectionData }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          body?.error ?? "Couldn't save your progress. Try again in a moment.",
        );
        return false;
      }
      return true;
    } catch {
      setError(
        "Couldn't reach the server. Check your connection and try again.",
      );
      return false;
    } finally {
      setBusy("idle");
    }
  }

  async function next() {
    const valid = await trigger(currentStep.key);
    if (!valid) return;
    const saved = await saveSection(currentStep.key);
    if (!saved) return;
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function back() {
    setStepIdx((i) => Math.max(i - 1, 0));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function jumpTo(idx: number) {
    // Free navigation — any step is clickable. Section data stays in
    // RHF state across hops; it's only persisted to Notion when the
    // user clicks "Save and continue", so jumping around freely never
    // loses their typing for the current session.
    setStepIdx(idx);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const onFinalSubmit = handleSubmit(async (data) => {
    setBusy("submitting");
    setError(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, isFinal: true, ...data }),
      });
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; redirect?: string; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        setError(
          body?.error ??
            "Couldn't submit your intake. Please try again, or email me directly.",
        );
        return;
      }
      window.location.href = body.redirect ?? `/payment/${token}`;
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy("idle");
    }
  });

  const isLast = stepIdx === STEPS.length - 1;

  return (
    <form onSubmit={onFinalSubmit} noValidate className="space-y-8">
      <Stepper currentIdx={stepIdx} jumpTo={jumpTo} />

      <div className="card bg-white">
        <header className="mb-6 border-b border-navy-100 pb-4">
          <span className="eyebrow">
            Step {stepIdx + 1} of {STEPS.length}
          </span>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
            {currentStep.title}
          </h2>
        </header>

        {currentStep.key === "businessBasics" && (
          <BusinessBasicsSection register={register} errors={errors} />
        )}
        {currentStep.key === "contactDetails" && (
          <ContactDetailsSection register={register} errors={errors} />
        )}
        {currentStep.key === "services" && (
          <ServicesSection register={register} errors={errors} control={control} />
        )}
        {currentStep.key === "brand" && (
          <BrandSection
            register={register}
            errors={errors}
            control={control}
            businessType={businessType}
          />
        )}
        {currentStep.key === "modules" && (
          <ModulesSection register={register} errors={errors} watch={watch} />
        )}
        {currentStep.key === "socialProof" && (
          <SocialProofSection register={register} errors={errors} control={control} />
        )}
        {currentStep.key === "legal" && (
          <LegalSection register={register} errors={errors} prospectName={prospectName} />
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-ember-500 bg-white p-4 text-sm text-ember-700"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={back}
          disabled={stepIdx === 0 || busy !== "idle"}
          className="btn-secondary disabled:opacity-40"
        >
          ← Back
        </button>
        {!isLast ? (
          <button
            type="button"
            onClick={next}
            disabled={busy !== "idle"}
            className="btn-primary"
          >
            {busy === "saving" ? "Saving…" : "Save and continue →"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy !== "idle"}
            className="btn-primary"
          >
            {busy === "submitting"
              ? "Submitting…"
              : "Submit and continue to payment"}
          </button>
        )}
      </div>

      <p className="text-center text-sm text-navy-500">
        Your progress is saved each time you click Continue. Close the tab and
        come back any time.
      </p>
    </form>
  );
}

// ---------- Stepper ----------

function Stepper({
  currentIdx,
  jumpTo,
}: {
  currentIdx: number;
  jumpTo: (idx: number) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((s, idx) => {
        const isCurrent = idx === currentIdx;
        const isDone = idx < currentIdx;
        return (
          <li key={s.key} className="flex-1 min-w-[100px]">
            <button
              type="button"
              onClick={() => jumpTo(idx)}
              aria-current={isCurrent ? "step" : undefined}
              className={[
                "flex w-full cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-xs transition-colors",
                isCurrent
                  ? "border-navy-900 bg-navy-900 text-white"
                  : isDone
                    ? "border-navy-300 bg-white text-navy-700 hover:border-navy-500"
                    : "border-navy-100 bg-cream-50 text-navy-500 hover:border-navy-300 hover:text-navy-700",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-semibold",
                  isCurrent
                    ? "bg-ember-500 text-white"
                    : isDone
                      ? "bg-navy-200 text-navy-900"
                      : "bg-cream-200 text-navy-500",
                ].join(" ")}
              >
                {isDone ? "✓" : idx + 1}
              </span>
              <span className="truncate font-medium">{s.short}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Section: Business basics ----------

type SectionProps = {
  register: ReturnType<typeof useForm<Phase3Data>>["register"];
  errors: FieldErrors<Phase3Data>;
};

function BusinessBasicsSection({ register, errors }: SectionProps) {
  const e = errors.businessBasics;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="bb-legalName"
          label="Legal business name"
          required
          {...register("businessBasics.legalName")}
          error={e?.legalName?.message}
          maxLength={200}
          hint="as registered with HMRC or Companies House"
        />
        <Field
          id="bb-tradingName"
          label="Trading name"
          {...register("businessBasics.tradingName")}
          error={e?.tradingName?.message}
          maxLength={200}
          hint="optional — only if different to your legal name"
        />
      </div>

      <SelectField
        id="bb-legalForm"
        label="Legal form"
        required
        {...register("businessBasics.legalForm")}
        error={e?.legalForm?.message}
        options={["Sole trader", "Limited company", "Partnership", "Other"]}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="bb-companiesHouseNumber"
          label="Companies House number"
          {...register("businessBasics.companiesHouseNumber")}
          error={e?.companiesHouseNumber?.message}
          maxLength={20}
          hint="optional — only if you're a Limited company"
        />
        <Field
          id="bb-vatNumber"
          label="VAT number"
          {...register("businessBasics.vatNumber")}
          error={e?.vatNumber?.message}
          maxLength={20}
          hint="optional"
        />
      </div>

      <Field
        id="bb-yearEstablished"
        label="Year established"
        type="number"
        {...register("businessBasics.yearEstablished", {
          setValueAs: optionalNumber,
        })}
        error={e?.yearEstablished?.message}
        hint="optional"
      />

      <Textarea
        id="bb-elevatorPitch"
        label="Elevator pitch"
        required
        {...register("businessBasics.elevatorPitch")}
        error={e?.elevatorPitch?.message}
        maxLength={280}
        rows={3}
        hint="one or two sentences. What do you do, who for, where?"
        placeholder="e.g. I'm an Oxford-based gas-safe heating engineer. I install and service boilers for homes within 30 miles of the city."
      />
    </div>
  );
}

// ---------- Section: Contact details ----------

function ContactDetailsSection({ register, errors }: SectionProps) {
  const e = errors.contactDetails;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="cd-contactName"
          label="Main contact name"
          required
          {...register("contactDetails.contactName")}
          error={e?.contactName?.message}
          maxLength={100}
        />
        <Field
          id="cd-publicEmail"
          label="Email shown on the site"
          type="email"
          required
          {...register("contactDetails.publicEmail")}
          error={e?.publicEmail?.message}
          maxLength={254}
          hint="customers will email this"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="cd-phoneDisplay"
          label="Phone (display format)"
          required
          {...register("contactDetails.phoneDisplay")}
          error={e?.phoneDisplay?.message}
          maxLength={30}
          hint='e.g. "0773 456 7890"'
        />
        <Field
          id="cd-phoneTel"
          label="Phone (digits only, for tap-to-call)"
          required
          {...register("contactDetails.phoneTel")}
          error={e?.phoneTel?.message}
          maxLength={30}
          hint='e.g. "+447734567890"'
        />
      </div>

      <Textarea
        id="cd-address"
        label="Business address"
        required
        {...register("contactDetails.address")}
        error={e?.address?.message}
        maxLength={500}
        rows={2}
        hint="even if you don't take walk-ins, Google likes to see one"
      />

      <Textarea
        id="cd-serviceArea"
        label="Service area"
        required
        {...register("contactDetails.serviceArea")}
        error={e?.serviceArea?.message}
        maxLength={500}
        rows={2}
        placeholder="e.g. Oxford, Witney, Bicester, and 30 miles around"
      />

      <fieldset>
        <legend className="mb-3 block text-sm font-semibold text-navy-900">
          Opening hours
        </legend>
        <p className="mb-3 text-xs text-navy-500">
          Tick the days you&apos;re open and set hours. Untick days you&apos;re closed.
        </p>
        <div className="space-y-2">
          {WEEKDAYS.map((d) => (
            <div
              key={d.key}
              className="rounded-lg border border-navy-100 bg-cream-50/50 px-3 py-2.5 sm:grid sm:grid-cols-[100px_auto_1fr_1fr] sm:items-center sm:gap-3"
            >
              {/* Mobile: day + open checkbox on one row.
                  Desktop (sm:contents): each child joins the parent grid. */}
              <div className="flex items-center justify-between sm:contents">
                <span className="text-sm font-medium text-navy-900">
                  {d.label}
                </span>
                <label className="inline-flex items-center gap-2 text-sm text-navy-700">
                  <input
                    type="checkbox"
                    {...register(
                      `contactDetails.openingHours.${d.key}.open` as const,
                    )}
                    className="h-4 w-4 rounded border-2 border-navy-300 text-navy-900"
                  />
                  Open
                </label>
              </div>
              {/* Mobile: From/To labels next to full-width inputs, stacked.
                  iOS Safari's <input type="time"> ignores `w-full` when
                  two share a row — stacking guarantees the controls fit
                  the viewport regardless of intrinsic min-width.
                  Desktop (sm:contents): each input joins the parent grid. */}
              <div className="mt-2 flex flex-col gap-2 sm:mt-0 sm:contents">
                <div className="flex items-center gap-2 sm:contents">
                  <span
                    aria-hidden="true"
                    className="w-12 shrink-0 text-xs font-medium text-navy-500 sm:hidden"
                  >
                    From
                  </span>
                  <input
                    type="time"
                    aria-label={`${d.label} open from`}
                    {...register(
                      `contactDetails.openingHours.${d.key}.from` as const,
                    )}
                    className="min-w-0 flex-1 rounded-md border-2 border-navy-200 bg-white px-3 py-2 text-sm focus:border-navy-900 focus:outline-none sm:w-full sm:flex-none sm:py-1.5"
                  />
                </div>
                <div className="flex items-center gap-2 sm:contents">
                  <span
                    aria-hidden="true"
                    className="w-12 shrink-0 text-xs font-medium text-navy-500 sm:hidden"
                  >
                    To
                  </span>
                  <input
                    type="time"
                    aria-label={`${d.label} open until`}
                    {...register(
                      `contactDetails.openingHours.${d.key}.to` as const,
                    )}
                    className="min-w-0 flex-1 rounded-md border-2 border-navy-200 bg-white px-3 py-2 text-sm focus:border-navy-900 focus:outline-none sm:w-full sm:flex-none sm:py-1.5"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ---------- Section: Services ----------

function ServicesSection({
  register,
  errors,
  control,
}: SectionProps & { control: Control<Phase3Data> }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "services.services",
  });
  const e = errors.services;
  return (
    <div className="space-y-5">
      <Textarea
        id="sv-differentiator"
        label="What makes you different from the competition?"
        required
        {...register("services.differentiator")}
        error={e?.differentiator?.message}
        maxLength={1000}
        rows={3}
        placeholder="One or two sentences a customer would actually understand. e.g. 'Family-run since 2007 — most of our work comes from word of mouth.'"
      />

      <div>
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          Services you offer{" "}
          <span aria-hidden="true" className="text-ember-600">*</span>
        </h3>
        <p className="text-sm text-navy-500">
          At least 1, up to 10. The first 3 are featured most prominently;
          star any others you want highlighted too.
        </p>

        <div className="mt-4 space-y-4">
          {fields.map((f, idx) => (
            <div
              key={f.id}
              className="rounded-xl border-2 border-navy-200 bg-cream-50/50 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-navy-900">
                  Service #{idx + 1}
                </span>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    aria-label={`Remove service #${idx + 1}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-navy-200 bg-white text-base leading-none text-navy-600 transition-colors hover:border-ember-500 hover:text-ember-700"
                    title="Remove this service"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <Field
                  id={`sv-${idx}-name`}
                  label="Service name"
                  required
                  {...register(`services.services.${idx}.name`)}
                  error={e?.services?.[idx]?.name?.message}
                  maxLength={100}
                />
                <Textarea
                  id={`sv-${idx}-description`}
                  label="Short description"
                  required
                  {...register(`services.services.${idx}.description`)}
                  error={e?.services?.[idx]?.description?.message}
                  maxLength={500}
                  rows={2}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    id={`sv-${idx}-startingPrice`}
                    label='Starting price (£)'
                    type="number"
                    {...register(`services.services.${idx}.startingPrice`, {
                      setValueAs: optionalNumber,
                    })}
                    error={e?.services?.[idx]?.startingPrice?.message}
                    hint="optional"
                  />
                  <label className="mt-7 inline-flex select-none items-center gap-2 self-start text-sm text-navy-700">
                    <input
                      type="checkbox"
                      {...register(`services.services.${idx}.featured`)}
                      className="h-4 w-4 rounded border-2 border-navy-300 text-navy-900"
                    />
                    Feature this service prominently
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>

        {fields.length < 10 && (
          <button
            type="button"
            onClick={() =>
              append({ name: "", description: "", featured: false })
            }
            className="mt-4 btn-secondary"
          >
            + Add another service
          </button>
        )}
        {typeof e?.services?.message === "string" && (
          <p className="mt-2 text-sm text-ember-700">{e.services.message}</p>
        )}
      </div>
    </div>
  );
}

// ---------- Section: Brand ----------

function BrandSection({
  register,
  errors,
  control,
  businessType,
}: SectionProps & {
  control: Control<Phase3Data>;
  businessType?: string;
}) {
  const e = errors.brand;
  // Compute the vibe recommendation once. The picker below uses
  // this to stamp a "Recommended for {businessType}" badge on the
  // matching card. When businessType is missing or "Other", the
  // recommendation falls back to "modern" — we suppress the badge
  // in that case so customers don't see an unhelpful "Recommended
  // for Other" label.
  const recommendedVibe = recommendedVibeFor(businessType);
  const showRecommendation =
    !!businessType && businessType !== "Other";
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <Controller
          control={control}
          name="brand.primaryColour"
          render={({ field }) => (
            <ColourPicker
              id="br-primaryColour"
              label="Primary brand colour"
              required
              value={field.value ?? ""}
              onChange={field.onChange}
              error={e?.primaryColour?.message}
              hint="click the swatch to pick from a colour wheel"
            />
          )}
        />
        <Controller
          control={control}
          name="brand.secondaryColour"
          render={({ field }) => (
            <ColourPicker
              id="br-secondaryColour"
              label="Secondary colour"
              value={field.value ?? ""}
              onChange={field.onChange}
              error={e?.secondaryColour?.message}
              hint="optional"
            />
          )}
        />
      </div>

      <fieldset>
        <legend className="mb-3 block text-sm font-semibold text-navy-900">
          Site vibe{" "}
          <span aria-hidden="true" className="text-ember-600">*</span>
        </legend>
        <p className="mb-4 text-xs text-navy-500">
          Pick the one that fits your customers best — we&apos;ll work
          within this preset. Hover any preview to see its design
          features and which businesses it suits.
          {showRecommendation && (
            <>
              {" "}
              The card marked{" "}
              <span className="font-semibold text-green-700">
                Recommended
              </span>{" "}
              is the one that usually fits a {businessType} best — but
              you can pick any of the four.
            </>
          )}{" "}
          Previews use the same teal everywhere so you can compare the
          layouts head-to-head; your real site uses your brand colours.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {VIBE_OPTIONS.map((v) => {
            const detail = VIBE_DETAILS[v];
            const isRecommended =
              showRecommendation && v === recommendedVibe;
            return (
              <label
                key={v}
                className="group relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 border-navy-200 bg-white p-4 transition-colors hover:border-navy-400 has-[:checked]:border-brand-primary-500 has-[:checked]:bg-brand-primary-50"
              >
                {/* Preview + hover-reveal overlay + optional
                 *  recommendation badge. Same component the marketing
                 *  homepage uses — when you change it there, this
                 *  picker updates in lockstep. */}
                <div className="relative">
                  <VibePreview vibe={v} size="thumb" />
                  {/* Hover-reveal overlay (desktop) — features +
                   *  best-for content layered over the preview. Fades
                   *  in on group-hover OR group-focus-within so
                   *  keyboard users can reach it via tab. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-t from-navy-950/95 via-navy-950/85 to-navy-950/0 p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-cream-200">
                      Features
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-cream-50">
                      {VIBE_FEATURES[v].map((f, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span aria-hidden="true" className="text-brand-primary-300">
                            ·
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-cream-200">
                      Best for
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-cream-50">
                      {VIBE_BEST_FOR[v].map((b, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span aria-hidden="true" className="text-brand-primary-300">
                            ·
                          </span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Recommendation badge — only on the matching
                   *  vibe, only when we have a meaningful
                   *  businessType ("Other" suppressed). */}
                  {isRecommended && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-lift">
                      <span aria-hidden="true">★</span>
                      Recommended
                    </span>
                  )}
                </div>
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    value={v}
                    {...register("brand.vibe")}
                    className="mt-1 h-4 w-4 flex-none border-2 border-navy-300 text-navy-900"
                  />
                  <div>
                    <span className="font-semibold text-navy-900">
                      {detail.title}
                    </span>
                    <p className="mt-1 text-sm text-navy-700">
                      {detail.tagline}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {e?.vibe?.message && (
          <p className="mt-2 text-sm text-ember-700">{e.vibe.message}</p>
        )}
      </fieldset>

      <Field
        id="br-logoFileName"
        label="Logo file name"
        {...register("brand.logoFileName")}
        error={e?.logoFileName?.message}
        maxLength={200}
        hint="optional — actual logo upload happens in the Onboarding Hub after payment"
      />
    </div>
  );
}

// ---------- Section: Modules ----------

function ModulesSection({
  register,
  errors,
  watch,
}: SectionProps & { watch: ReturnType<typeof useForm<Phase3Data>>["watch"] }) {
  const e = errors.modules;
  const moduleBooking = watch("modules.moduleBooking");
  const moduleEnquiry = watch("modules.moduleEnquiry");
  const moduleNewsletter = watch("modules.moduleNewsletter");
  const moduleOffers = watch("modules.moduleOffers");
  const gbpAddon = watch("modules.gbpAddon");

  const fees = calculateFees({
    moduleBooking: !!moduleBooking,
    moduleEnquiry: !!moduleEnquiry,
    moduleNewsletter: !!moduleNewsletter,
    moduleOffers: !!moduleOffers,
    gbpAddon: !!gbpAddon,
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-navy-700">
        Tick whichever modules you want. Each can be added or removed later
        with 30 days&apos; notice. Live pricing updates as you tick.
      </p>

      <div className="space-y-3">
        <input type="hidden" value="true" {...register("modules.baseSelected")} />
        <ModuleRow
          label="Base website"
          tagline="Mobile-friendly site, your domain, hosting on your free Cloudflare account."
          setup={`£${BASE_SETUP_GBP}`}
          monthly={`£${BASE_MONTHLY_GBP}/mo`}
          locked
          checked
        />
        <ModuleRow
          label="Online Booking"
          tagline="Customers book a slot themselves via Cal.com."
          setup={`+£${MODULE_BOOKING_SETUP_GBP}`}
          monthly={`+£${MODULE_BOOKING_MONTHLY_GBP}/mo`}
          register={register("modules.moduleBooking")}
        />
        <ModuleRow
          label="Enquiry Form"
          tagline="Email enquiries hit your inbox without exposing your address."
          setup={`+£${MODULE_ENQUIRY_SETUP_GBP}`}
          monthly={`+£${MODULE_ENQUIRY_MONTHLY_GBP}/mo`}
          register={register("modules.moduleEnquiry")}
        />
        <ModuleRow
          label="Newsletter"
          tagline="Email your customers monthly. I send it for you."
          setup={`+£${MODULE_NEWSLETTER_SETUP_GBP}`}
          monthly={`+£${MODULE_NEWSLETTER_MONTHLY_GBP}/mo`}
          register={register("modules.moduleNewsletter")}
        />
        <ModuleRow
          label="Offers"
          tagline="A promo strip on your homepage you control from your dashboard — set a headline, dates and CTA. We'll moderate each before it goes live."
          setup={`+£${MODULE_OFFERS_SETUP_GBP}`}
          monthly={`+£${MODULE_OFFERS_MONTHLY_GBP}/mo`}
          register={register("modules.moduleOffers")}
        />
        <ModuleRow
          label="Google Business Profile + live reviews"
          tagline="One-off setup or audit, plus your top Google reviews refreshed on your site automatically (powered by the Google Places API)."
          setup={`£${GBP_ADDON_ONE_OFF_GBP}`}
          monthly={`+£${GBP_ADDON_MONTHLY_GBP}/mo`}
          register={register("modules.gbpAddon")}
        />
      </div>

      <div className="rounded-2xl border-2 border-navy-900 bg-cream-50 p-5">
        <p className="text-sm font-semibold uppercase tracking-wider text-navy-700">
          Your live total
        </p>
        <div className="mt-2 grid gap-1 text-navy-900 sm:grid-cols-2">
          <p className="font-serif text-2xl">
            <strong>£{fees.setup}</strong>{" "}
            <span className="text-base font-normal text-navy-700">setup</span>
          </p>
          <p className="font-serif text-2xl">
            <strong>£{fees.monthly}</strong>
            <span className="text-base font-normal text-navy-700">/month</span>
          </p>
        </div>
        <p className="mt-2 text-xs text-navy-600">
          Setup + first month charged together at payment. Cancel any time
          with 30 days&apos; notice.
        </p>
      </div>

      {(e?.moduleBooking?.message ||
        e?.moduleEnquiry?.message ||
        e?.moduleNewsletter?.message) && (
        <p className="text-sm text-ember-700">Pick at least the base.</p>
      )}
    </div>
  );
}

function ModuleRow({
  label,
  tagline,
  setup,
  monthly,
  register,
  locked,
  checked,
}: {
  label: string;
  tagline: string;
  setup: string;
  monthly: string;
  register?: ReturnType<ReturnType<typeof useForm<Phase3Data>>["register"]>;
  locked?: boolean;
  checked?: boolean;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-xl border-2 p-4 transition-colors",
        locked
          ? "cursor-not-allowed border-navy-100 bg-cream-50"
          : "cursor-pointer border-navy-200 bg-white hover:border-navy-400",
      ].join(" ")}
    >
      <input
        type="checkbox"
        {...(register ?? {})}
        disabled={locked}
        defaultChecked={checked}
        className="mt-0.5 h-5 w-5 flex-none rounded border-2 border-navy-300 text-navy-900 disabled:opacity-60"
      />
      <div className="flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-navy-900">{label}</span>
          <span className="text-sm text-navy-600">
            {setup}, {monthly}
          </span>
        </div>
        <p className="mt-1 text-sm text-navy-700">{tagline}</p>
        {locked && (
          <p className="mt-1 text-xs italic text-navy-500">
            Always included.
          </p>
        )}
      </div>
    </label>
  );
}

// ---------- Section: Social proof ----------

function SocialProofSection({
  register,
  errors,
  control,
}: SectionProps & { control: Control<Phase3Data> }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "socialProof.testimonials",
  });
  const e = errors.socialProof;
  return (
    <div className="space-y-5">
      <p className="text-sm text-navy-700">
        Whatever you&apos;ve got. Optional — but the more, the more your site
        sells you while you&apos;re working.
      </p>

      <div>
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          Customer testimonials
          <span className="ml-2 text-sm font-normal text-navy-500">
            (up to 3)
          </span>
        </h3>
        <div className="mt-4 space-y-4">
          {fields.map((f, idx) => (
            <div
              key={f.id}
              className="rounded-xl border-2 border-navy-200 bg-cream-50/50 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-navy-900">
                  Testimonial #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="text-sm text-ember-700 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    id={`sp-${idx}-name`}
                    label="Customer name"
                    {...register(`socialProof.testimonials.${idx}.name`)}
                    error={e?.testimonials?.[idx]?.name?.message}
                    maxLength={100}
                  />
                  <Field
                    id={`sp-${idx}-location`}
                    label="Location"
                    {...register(`socialProof.testimonials.${idx}.location`)}
                    error={e?.testimonials?.[idx]?.location?.message}
                    maxLength={100}
                    hint='e.g. "Oxford"'
                  />
                </div>
                <Textarea
                  id={`sp-${idx}-quote`}
                  label="Their words"
                  {...register(`socialProof.testimonials.${idx}.quote`)}
                  error={e?.testimonials?.[idx]?.quote?.message}
                  maxLength={500}
                  rows={3}
                />
              </div>
            </div>
          ))}
        </div>
        {fields.length < 3 && (
          <button
            type="button"
            onClick={() =>
              append({ name: "", location: "", quote: "" })
            }
            className="mt-4 btn-secondary"
          >
            + Add a testimonial
          </button>
        )}
      </div>

      <Textarea
        id="sp-associations"
        label="Trade associations or accreditations"
        {...register("socialProof.associations")}
        error={e?.associations?.message}
        maxLength={500}
        rows={2}
        hint="optional — e.g. Gas Safe, NICEIC, FMB"
      />

      <Field
        id="sp-yearsExperience"
        label="Years of experience"
        type="number"
        {...register("socialProof.yearsExperience", {
          setValueAs: optionalNumber,
        })}
        error={e?.yearsExperience?.message}
        hint="optional"
      />

      <Textarea
        id="sp-awards"
        label="Awards or recognition"
        {...register("socialProof.awards")}
        error={e?.awards?.message}
        maxLength={500}
        rows={2}
        hint="optional"
      />
    </div>
  );
}

// ---------- Section: Legal ----------

function LegalSection({
  register,
  errors,
  prospectName,
}: SectionProps & { prospectName: string }) {
  const e = errors.legal;
  return (
    <div className="space-y-6">
      <p className="text-sm text-navy-700">
        Two boxes we need {prospectName.split(/\s+/)[0] ?? "you"} to tick
        before we can build your site. Plain English; no fine print.
      </p>

      <CheckboxBlock
        id="lg-isDataController"
        label="I confirm I'm the data controller for my own site"
        body="That means GDPR-wise, you own your customers' data — we're just the developer. Standard for this kind of arrangement."
        register={register("legal.isDataController")}
        error={e?.isDataController?.message}
      />

      <CheckboxBlock
        id="lg-acceptsTerms"
        label="I accept the Terms of Service"
        body={
          <>
            You can read them in full at{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="link">
              {site.url}/terms
            </a>
            . Highlights: 30-day notice to cancel, you own everything,
            48-hour refund window on the setup fee.
          </>
        }
        register={register("legal.acceptsTerms")}
        error={e?.acceptsTerms?.message}
      />

      <CheckboxBlock
        id="lg-marketingConsent"
        label="It's OK to email me with occasional product updates"
        body="Optional. Means I can drop you a line when I add a new module or change pricing. Easy to unsubscribe any time. Off by default."
        register={register("legal.marketingConsent")}
      />
    </div>
  );
}

function CheckboxBlock({
  id,
  label,
  body,
  register,
  error,
}: {
  id: string;
  label: string;
  body: React.ReactNode;
  register: ReturnType<ReturnType<typeof useForm<Phase3Data>>["register"]>;
  error?: string;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-white p-4",
        error ? "border-ember-500" : "border-navy-200 hover:border-navy-400",
      ].join(" ")}
    >
      <input
        id={id}
        type="checkbox"
        {...register}
        className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 text-navy-900"
      />
      {/* min-w-0 lets the flex child shrink below its content's intrinsic
          width; overflow-wrap:anywhere ensures long URLs (like the /terms
          link in the body) break mid-word on narrow screens instead of
          pushing past the container edge. */}
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-navy-900">{label}</span>
        <p className="mt-1 text-sm text-navy-700 [overflow-wrap:anywhere]">
          {body}
        </p>
        {error && <p className="mt-2 text-sm text-ember-700">{error}</p>}
      </div>
    </label>
  );
}

// ---------- Generic field components ----------

type FieldRegisterReturn = ReturnType<
  ReturnType<typeof useForm<Phase3Data>>["register"]
>;

type BaseFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  maxLength?: number;
  placeholder?: string;
};

function Field({
  id,
  label,
  required,
  type = "text",
  hint,
  error,
  maxLength,
  placeholder,
  ...rest
}: BaseFieldProps & {
  type?: string;
} & FieldRegisterReturn) {
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
            <span aria-hidden="true" className="text-ember-600">*</span>
          </>
        )}
        {hint && (
          <span className="font-normal text-navy-500"> ({hint})</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        maxLength={maxLength}
        placeholder={placeholder}
        {...rest}
        className={[
          "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 placeholder:text-navy-400 focus:border-navy-900 focus:outline-none",
          error ? "border-ember-500" : "border-navy-200",
        ].join(" ")}
      />
      {error && <p className="mt-2 text-sm text-ember-700">{error}</p>}
    </div>
  );
}

function Textarea({
  id,
  label,
  required,
  hint,
  error,
  maxLength,
  placeholder,
  rows = 4,
  ...rest
}: BaseFieldProps & {
  rows?: number;
} & FieldRegisterReturn) {
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
            <span aria-hidden="true" className="text-ember-600">*</span>
          </>
        )}
        {hint && (
          <span className="font-normal text-navy-500"> ({hint})</span>
        )}
      </label>
      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        {...rest}
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
  hint,
  error,
  options,
  ...rest
}: BaseFieldProps & {
  options: readonly string[];
} & FieldRegisterReturn) {
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
            <span aria-hidden="true" className="text-ember-600">*</span>
          </>
        )}
        {hint && (
          <span className="font-normal text-navy-500"> ({hint})</span>
        )}
      </label>
      <select
        id={id}
        {...rest}
        className={[
          "w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-navy-900 focus:border-navy-900 focus:outline-none",
          error ? "border-ember-500" : "border-navy-200",
        ].join(" ")}
      >
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

// Colour picker component used via RHF Controller. Two synced inputs:
// a native <input type="color"> swatch (opens the OS colour wheel) and
// a hex text field for users who want to paste a brand-book value.
function ColourPicker({
  id,
  label,
  required,
  hint,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(value);
  // The colour input requires a valid hex; fall back to navy-900 so the
  // swatch always renders something while the text input is incomplete.
  const swatchValue = isValidHex ? value : "#1d3a5f";
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
            <span aria-hidden="true" className="text-ember-600">*</span>
          </>
        )}
        {hint && (
          <span className="font-normal text-navy-500"> ({hint})</span>
        )}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`${label} colour wheel`}
          value={swatchValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-14 flex-none cursor-pointer rounded-xl border-2 border-navy-200 bg-white p-0.5"
        />
        <input
          id={id}
          type="text"
          placeholder="#1d3a5f"
          maxLength={7}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={[
            "w-full rounded-xl border-2 bg-white px-4 py-3 font-mono text-base text-navy-900 placeholder:text-navy-400 focus:border-navy-900 focus:outline-none",
            error ? "border-ember-500" : "border-navy-200",
          ].join(" ")}
        />
      </div>
      {error && <p className="mt-2 text-sm text-ember-700">{error}</p>}
    </div>
  );
}
