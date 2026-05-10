"use client";

// Onboarding Hub — Step "Site content" (display Step 4 of 6;
// Notion checkbox 6).
//
// Captures the WORDS that go on the customer's site:
//   A. Tagline + about us (multi-paragraph blurb)
//   B. "What makes us different" bullets (up to 8)
//   C. Per-service rich content (longDescription / features / pricingNotes)
//      — one card per service from Phase 3 intake
//   D. FAQ Q&A pairs (up to 10)
//
// Phase 3 captured the bare minimum needed to scope/price; this step
// captures the deeper content post-payment, when the customer is
// committed and willing to invest the time. Output is also raw
// material for Haiku copy assist (Stage 2C C5.5).
//
// All fields optional — customer can mark done with whatever they've
// got. Empty values fall back to defaults / Haiku-generated copy at
// site-build time.

import { useState } from "react";
import type { Phase3Seeds } from "@/app/onboarding/[token]/page";

// Mirrors src/lib/onboarding.ts step4ContentSchema. Keeping the
// component types close to the schema prevents drift; the API
// validates on save anyway.
type ServiceContent = {
  serviceName: string;
  /** Short description for service cards (1-2 sentences). NEW —
   *  seeded from Phase 3 services[].description on first edit. */
  description?: string;
  /** Optional starting price in pounds. NEW — seeded from Phase 3
   *  services[].startingPrice on first edit. */
  priceFrom?: number;
  longDescription?: string;
  features?: string[];
  pricingNotes?: string;
};

type FaqEntry = { question: string; answer: string };
type Testimonial = { name: string; location?: string; quote: string };
type TrustData = {
  yearsExperience?: number;
  associations?: string;
  awards?: string;
};
type BusinessDetails = {
  contactName?: string;
  phoneDisplay?: string;
  phoneTel?: string;
  publicEmail?: string;
  address?: string;
  serviceArea?: string;
  openingHours?: Record<
    string,
    { open: boolean; from?: string; to?: string }
  >;
};

type ContentData = {
  tagline?: string;
  aboutBlurb?: string;
  aboutBullets?: string[];
  services?: ServiceContent[];
  faq?: FaqEntry[];
  testimonials?: Testimonial[];
  trust?: TrustData;
  business?: BusinessDetails;
  notes?: string;
};

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  /** Service names from Phase 3 intake — used as the SEED for the
   *  service list when the content step has no saved services yet.
   *  Once the customer has touched the content step (renamed,
   *  deleted, or added a service), the canonical list lives in
   *  `data.services` and this prop is just history. */
  services: ReadonlyArray<{ name: string }>;
  /** Richer Phase 3 seeds — used to pre-fill blank sections of the
   *  Site Content step (services description+priceFrom, testimonials,
   *  trust signals, business details). Each section seeds ONLY when
   *  the customer's content-step value is blank for that section. */
  phase3Seeds: Phase3Seeds;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

/** Internal state row — adds a stable client-only id so React can
 *  track entries through renames + reorders. Stripped on save. */
type ServiceRow = ServiceContent & { _localId: string };
type TestimonialRow = Testimonial & { _localId: string };

const TAGLINE_MAX = 200;
const ABOUT_BLURB_MAX = 5000;
const BULLET_MAX = 300;
const ABOUT_BULLET_CAP = 8;
const SERVICE_DESC_MAX = 500;
const SERVICE_LONG_DESC_MAX = 2000;
const SERVICE_FEATURE_MAX = 200;
const SERVICE_FEATURE_CAP = 8;
const SERVICE_PRICING_MAX = 500;
const FAQ_QUESTION_MAX = 300;
const FAQ_ANSWER_MAX = 2000;
const FAQ_CAP = 10;
const TESTIMONIAL_NAME_MAX = 100;
const TESTIMONIAL_LOCATION_MAX = 100;
const TESTIMONIAL_QUOTE_MAX = 500;
const TESTIMONIAL_CAP = 5;
const ASSOCIATIONS_MAX = 500;
const AWARDS_MAX = 500;
const CONTACT_NAME_MAX = 100;
const PHONE_MAX = 30;
const EMAIL_MAX = 254;
const ADDRESS_MAX = 500;
const SERVICE_AREA_MAX = 500;
const NOTES_MAX = 2000;

/** Days of the week for the opening-hours editor — same order as
 *  Phase 3 intake so renders match. */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = (typeof DAYS)[number];

export default function Step4Content({
  data,
  done,
  readOnly,
  services,
  phase3Seeds,
  savePartial,
  markDone,
}: Props) {
  // ---------- Initialise from saved data ----------
  // Defensive reads — `data` is the raw JSON slice and may be
  // partially populated. Fall through to safe empty values.
  //
  // Seeding policy (per section): if the content-step value is
  // present (even an empty array — which means "the customer
  // explicitly cleared it"), use it. ONLY if the field is missing
  // entirely, fall back to Phase 3. This means seeding happens
  // exactly once — on first visit to the content step — after
  // which the customer's edits (including deletes) are preserved.
  const initial = data as ContentData;

  const [tagline, setTagline] = useState(initial.tagline ?? "");
  // About blurb: seeded from Phase 3 differentiator if blank — the
  // differentiator is the closest pre-existing free-text we have to
  // an "about us" copy starting point.
  const [aboutBlurb, setAboutBlurb] = useState(
    initial.aboutBlurb ?? phase3Seeds.differentiator ?? "",
  );
  const [aboutBullets, setAboutBullets] = useState<string[]>(
    Array.isArray(initial.aboutBullets) ? initial.aboutBullets : [],
  );
  // Per-service content — ordered list with stable client-only ids
  // so renames + reorders work cleanly. Initialised in this order:
  //   1. If the content step has saved services, use them as-is
  //   2. Otherwise seed from Phase 3 intake (rich seed: name +
  //      description + priceFrom carried forward)
  //   3. If neither, start empty
  // The customer can rename, delete, or add — the rendered list
  // becomes the canonical "services on the site" list at save time.
  const [serviceList, setServiceList] = useState<ServiceRow[]>(() => {
    if (Array.isArray(initial.services) && initial.services.length > 0) {
      return initial.services
        .filter((s): s is ServiceContent => !!s && typeof s.serviceName === "string")
        .map((s) => ({
          ...s,
          features: Array.isArray(s.features) ? s.features : undefined,
          _localId: crypto.randomUUID(),
        }));
    }
    // Seed from Phase 3 — name + description + priceFrom. If the
    // page-level phase3Services already includes additional names
    // (e.g. content step was populated then cleared), use those
    // names but with no Phase 3 metadata.
    if (phase3Seeds.services.length > 0) {
      return phase3Seeds.services.map((s) => ({
        serviceName: s.name,
        description: s.description,
        priceFrom: s.priceFrom,
        _localId: crypto.randomUUID(),
      }));
    }
    return services.map((s) => ({
      serviceName: s.name,
      _localId: crypto.randomUUID(),
    }));
  });
  const [faq, setFaq] = useState<FaqEntry[]>(
    Array.isArray(initial.faq) ? initial.faq : [],
  );
  const [testimonials, setTestimonials] = useState<TestimonialRow[]>(() => {
    // Same first-visit seeding policy as services.
    if (Array.isArray(initial.testimonials)) {
      return initial.testimonials
        .filter(
          (t): t is Testimonial =>
            !!t && typeof t.name === "string" && typeof t.quote === "string",
        )
        .map((t) => ({ ...t, _localId: crypto.randomUUID() }));
    }
    return phase3Seeds.testimonials.map((t) => ({
      ...t,
      _localId: crypto.randomUUID(),
    }));
  });
  const [trust, setTrust] = useState<TrustData>(() => {
    if (initial.trust && typeof initial.trust === "object") {
      return initial.trust;
    }
    return phase3Seeds.trust;
  });
  const [business, setBusiness] = useState<BusinessDetails>(() => {
    if (initial.business && typeof initial.business === "object") {
      return initial.business;
    }
    return phase3Seeds.business;
  });
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);

  const disabled = readOnly;

  // ---------- Build patch ----------
  // The patch only includes fields the customer has actually
  // populated. Empty arrays are OK (they explicitly clear) but
  // empty strings get stripped to undefined to match the schema.
  function buildPatch(): Record<string, unknown> {
    const trimmedTagline = tagline.trim();
    const trimmedAbout = aboutBlurb.trim();
    const cleanedBullets = aboutBullets
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    // Build services array from the customer's edited list. Drop
    // entries with empty names (incomplete adds the customer
    // didn't fill out). Strip the local-only _localId before persisting.
    const servicesArr: ServiceContent[] = serviceList
      .map((s): ServiceContent | null => {
        const name = s.serviceName.trim();
        if (!name) return null;
        const description = s.description?.trim() || undefined;
        const longDescription = s.longDescription?.trim() || undefined;
        const features = (s.features ?? [])
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        const pricingNotes = s.pricingNotes?.trim() || undefined;
        const priceFrom =
          typeof s.priceFrom === "number" && s.priceFrom >= 0
            ? Math.round(s.priceFrom)
            : undefined;
        const entry: ServiceContent = { serviceName: name };
        if (description) entry.description = description;
        if (priceFrom !== undefined) entry.priceFrom = priceFrom;
        if (longDescription) entry.longDescription = longDescription;
        if (features.length > 0) entry.features = features;
        if (pricingNotes) entry.pricingNotes = pricingNotes;
        return entry;
      })
      .filter((s): s is ServiceContent => s !== null);

    const cleanedFaq = faq
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter((f) => f.question.length > 0 && f.answer.length > 0);

    // Testimonials — drop entries with empty name or quote.
    const cleanedTestimonials: Testimonial[] = testimonials
      .map((t): Testimonial | null => {
        const name = t.name.trim();
        const quote = t.quote.trim();
        if (!name || !quote) return null;
        const location = t.location?.trim() || undefined;
        return { name, quote, ...(location ? { location } : {}) };
      })
      .filter((t): t is Testimonial => t !== null);

    // Trust — undefined any blank-string fields, drop the section
    // entirely if every field is empty.
    const trustClean: TrustData = {};
    if (typeof trust.yearsExperience === "number" && trust.yearsExperience >= 0) {
      trustClean.yearsExperience = Math.round(trust.yearsExperience);
    }
    const associations = trust.associations?.trim();
    if (associations) trustClean.associations = associations;
    const awards = trust.awards?.trim();
    if (awards) trustClean.awards = awards;
    const trustHasContent = Object.keys(trustClean).length > 0;

    // Business — same pattern: clean each field, drop empties,
    // omit the section entirely if no field is set.
    const businessClean: BusinessDetails = {};
    const contactName = business.contactName?.trim();
    if (contactName) businessClean.contactName = contactName;
    const phoneDisplay = business.phoneDisplay?.trim();
    if (phoneDisplay) businessClean.phoneDisplay = phoneDisplay;
    const phoneTel = business.phoneTel?.trim();
    if (phoneTel) businessClean.phoneTel = phoneTel;
    const publicEmail = business.publicEmail?.trim();
    if (publicEmail) businessClean.publicEmail = publicEmail;
    const address = business.address?.trim();
    if (address) businessClean.address = address;
    const serviceArea = business.serviceArea?.trim();
    if (serviceArea) businessClean.serviceArea = serviceArea;
    if (business.openingHours && Object.keys(business.openingHours).length > 0) {
      businessClean.openingHours = business.openingHours;
    }
    const businessHasContent = Object.keys(businessClean).length > 0;

    return {
      tagline: trimmedTagline || undefined,
      aboutBlurb: trimmedAbout || undefined,
      aboutBullets: cleanedBullets.length > 0 ? cleanedBullets : undefined,
      services: servicesArr.length > 0 ? servicesArr : undefined,
      faq: cleanedFaq.length > 0 ? cleanedFaq : undefined,
      testimonials:
        cleanedTestimonials.length > 0 ? cleanedTestimonials : undefined,
      trust: trustHasContent ? trustClean : undefined,
      business: businessHasContent ? businessClean : undefined,
      notes: notes.trim() || undefined,
    };
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't save just now. Try again.");
  }

  async function handleMarkDone() {
    setError(null);
    setPending("done");
    const ok = await markDone(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't mark done. Try again.");
  }

  async function handleUpdate() {
    setError(null);
    setPending("update");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't update just now. Try again.");
  }

  // ---------- Per-service mutators ----------
  // Stable id-keyed updates so renames + reorders don't lose state.

  function patchService(id: string, patch: Partial<ServiceContent>) {
    setServiceList((prev) =>
      prev.map((s) => (s._localId === id ? { ...s, ...patch } : s)),
    );
  }
  function setServiceFeatures(id: string, features: string[]) {
    patchService(id, { features });
  }
  function removeService(id: string) {
    setServiceList((prev) => prev.filter((s) => s._localId !== id));
  }
  function addService() {
    setServiceList((prev) => [
      ...prev,
      { serviceName: "", _localId: crypto.randomUUID() },
    ]);
  }

  // ---------- Render ----------

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Site content
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          The words on your site
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          You&apos;ve told me what business you&apos;re in and what
          modules you want — now the content. The richer this gets,
          the better your site reads. Anything you leave blank gets
          a sensible default; anything you fill in goes straight onto
          the page.
        </p>
      </header>

      {/* ---------- A. Tagline + About us ---------- */}
      <SectionCard
        letter="A"
        title="Tagline + about us"
        helper="The hero subtitle people see first, then a few short paragraphs about who you are and why customers should pick you."
        filled={!!(tagline.trim() || aboutBlurb.trim())}
      >
        <FieldLabel>Tagline (optional)</FieldLabel>
        <input
          type="text"
          value={tagline}
          disabled={disabled}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={TAGLINE_MAX}
          placeholder="e.g. Quality building work in Oxfordshire — extensions, renovations, loft conversions."
          className="mt-1 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <CharCount value={tagline} max={TAGLINE_MAX} />

        <FieldLabel className="mt-5">About us</FieldLabel>
        <p className="text-xs text-navy-600">
          One or more paragraphs (use blank lines to separate). Aim
          for warm and direct — what you do, how you started, what
          customers can expect.
        </p>
        <textarea
          value={aboutBlurb}
          disabled={disabled}
          onChange={(e) => setAboutBlurb(e.target.value)}
          maxLength={ABOUT_BLURB_MAX}
          rows={8}
          placeholder="e.g. We're a small Oxfordshire-based building firm run by Lucas. We've been turning houses into homes since 2018 — extensions, full renovations, loft conversions and everything in between..."
          className="mt-1 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <CharCount value={aboutBlurb} max={ABOUT_BLURB_MAX} />
      </SectionCard>

      {/* ---------- B. What makes you different (bullets) ---------- */}
      <SectionCard
        letter="B"
        title="What makes you different"
        helper="A handful of bullets — your unique angle. Up to 8. Keep them short and concrete."
        filled={aboutBullets.some((b) => b.trim().length > 0)}
      >
        <BulletEditor
          bullets={aboutBullets}
          onChange={setAboutBullets}
          disabled={disabled}
          cap={ABOUT_BULLET_CAP}
          maxLength={BULLET_MAX}
          placeholder="e.g. Fully insured + DBS-checked"
        />
      </SectionCard>

      {/* ---------- C. Service-by-service detail ---------- */}
      <SectionCard
        letter="C"
        title="Services"
        helper="Each service gets its own card. Edit the name, short description, starting price, longer description, features and pricing notes. Add or delete services freely — this list becomes the canonical services list on your site."
        filled={serviceList.some((s) => s.serviceName.trim().length > 0)}
      >
        {serviceList.length === 0 ? (
          <p className="rounded-lg border border-dashed border-navy-200 bg-white p-4 text-sm text-navy-500">
            No services yet. Click &ldquo;Add a service&rdquo; below
            to start. Phase 3 intake didn&apos;t pre-fill any
            services for you.
          </p>
        ) : (
          <div className="space-y-5">
            {serviceList.map((s) => (
              <ServiceContentCard
                key={s._localId}
                serviceName={s.serviceName}
                description={s.description ?? ""}
                priceFrom={s.priceFrom}
                longDescription={s.longDescription ?? ""}
                features={s.features ?? []}
                pricingNotes={s.pricingNotes ?? ""}
                disabled={disabled}
                onNameChange={(v) =>
                  patchService(s._localId, { serviceName: v })
                }
                onDescriptionChange={(v) =>
                  patchService(s._localId, { description: v })
                }
                onPriceFromChange={(v) =>
                  patchService(s._localId, { priceFrom: v })
                }
                onLongDescChange={(v) =>
                  patchService(s._localId, { longDescription: v })
                }
                onFeaturesChange={(v) =>
                  setServiceFeatures(s._localId, v)
                }
                onPricingNotesChange={(v) =>
                  patchService(s._localId, { pricingNotes: v })
                }
                onDelete={() => removeService(s._localId)}
              />
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={addService}
            disabled={disabled}
            className="rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm font-semibold text-navy-900 hover:border-navy-400 disabled:opacity-50"
          >
            + Add a service
          </button>
          <span className="text-xs text-navy-500">
            {serviceList.length} service
            {serviceList.length === 1 ? "" : "s"}
          </span>
        </div>
      </SectionCard>

      {/* ---------- D. FAQ ---------- */}
      <SectionCard
        letter="D"
        title="FAQ"
        helper="Up to 10 question-and-answer pairs. The questions you actually get asked. Great for SEO + customer trust."
        filled={faq.some(
          (f) => f.question.trim().length > 0 || f.answer.trim().length > 0,
        )}
      >
        <FaqEditor
          faq={faq}
          onChange={setFaq}
          disabled={disabled}
          cap={FAQ_CAP}
        />
      </SectionCard>

      {/* ---------- E. Testimonials ---------- */}
      <SectionCard
        letter="E"
        title="Testimonials"
        helper="Up to 5 quotes from happy customers. Each: name, location (optional), and the quote itself. Render on your home page + about page — huge trust boost."
        filled={testimonials.some(
          (t) => t.name.trim().length > 0 || t.quote.trim().length > 0,
        )}
      >
        <TestimonialEditor
          testimonials={testimonials}
          onChange={setTestimonials}
          disabled={disabled}
          cap={TESTIMONIAL_CAP}
        />
      </SectionCard>

      {/* ---------- F. Trust signals ---------- */}
      <SectionCard
        letter="F"
        title="Trust signals"
        helper="Years of experience, professional associations, and any awards. Render as a small strip near the top of your About page (e.g. 'Established 2010 • Member of FMB • Trustmark certified')."
        filled={
          typeof trust.yearsExperience === "number" ||
          !!trust.associations?.trim() ||
          !!trust.awards?.trim()
        }
      >
        <TrustEditor
          trust={trust}
          onChange={setTrust}
          disabled={disabled}
        />
      </SectionCard>

      {/* ---------- G. Business details ---------- */}
      <SectionCard
        letter="G"
        title="Business details"
        helper="Contact info, opening hours and service area — appears in the footer of every page, on the contact page, and in the structured data search engines read."
        filled={
          !!(
            business.contactName?.trim() ||
            business.phoneDisplay?.trim() ||
            business.publicEmail?.trim() ||
            business.address?.trim() ||
            business.serviceArea?.trim() ||
            (business.openingHours &&
              Object.keys(business.openingHours).length > 0)
          )
        }
      >
        <BusinessDetailsEditor
          business={business}
          onChange={setBusiness}
          disabled={disabled}
        />
      </SectionCard>

      {/* ---------- Notes + buttons ---------- */}
      <section className="mt-9">
        <FieldLabel>Anything else? (optional)</FieldLabel>
        <p className="text-xs text-navy-600">
          Anything I should know about tone, things to avoid, links
          to existing copy I should pull from, etc.
        </p>
        <textarea
          value={notes}
          disabled={disabled}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={NOTES_MAX}
          rows={3}
          placeholder="e.g. tone should be friendly and direct, no jargon. Pull case-study references from this Dropbox link..."
          className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <CharCount value={notes} max={NOTES_MAX} />

        {error && (
          <p className="mt-4 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
      </section>

      <footer className="mt-7 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-6">
        {done ? (
          <>
            <p className="text-sm text-green-700" role="status">
              <strong>Done.</strong> Edit above and click Update if you
              want to refine anything.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={handleUpdate}
                disabled={pending !== "none"}
                className="btn-secondary"
              >
                {pending === "update" ? "Updating…" : "Update saved data"}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending !== "none" || disabled}
              className="btn-secondary"
            >
              {pending === "save" ? "Saving…" : "Save progress"}
            </button>
            <button
              type="button"
              onClick={handleMarkDone}
              disabled={pending !== "none" || disabled}
              className="btn-primary"
            >
              {pending === "done"
                ? "Marking done…"
                : "Mark this step done"}
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

// ---------- Section card wrapper ----------
//
// Letter + title + helper, then children (the form for that section).
// Cream background + navy border so each section feels self-contained.

function SectionCard({
  letter,
  title,
  helper,
  filled,
  defaultOpen = true,
  children,
}: {
  letter: string;
  title: string;
  helper: string;
  /** Visual indicator on the summary chip showing whether this
   *  section has any content. Customer can scan the page to see
   *  what they've filled in vs what's still empty. */
  filled: boolean;
  /** Open by default? All sections default to open so customers
   *  can see everything at once. They can collapse anything they
   *  consider done. State is per-render (resets on page reload). */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group mt-5 rounded-2xl border border-navy-100 bg-cream-50 p-6 [&[open]>summary>.chevron]:rotate-90"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-baseline gap-3 [&::-webkit-details-marker]:hidden">
        <span className="chevron flex-none text-navy-500 transition-transform">
          ▸
        </span>
        <span className="font-serif text-sm font-semibold text-ember-600">
          Section {letter}
        </span>
        <h3 className="flex-1 font-serif text-lg font-semibold text-navy-900">
          {title}
        </h3>
        <span
          className={[
            "flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
            filled
              ? "bg-green-100 text-green-800"
              : "bg-navy-100/70 text-navy-500",
          ].join(" ")}
        >
          {filled ? "Filled in" : "Empty"}
        </span>
      </summary>
      <p className="mt-2 text-sm text-navy-600">{helper}</p>
      <div className="mt-4">{children}</div>
    </details>
  );
}

// ---------- Field label ----------

function FieldLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`block text-sm font-semibold text-navy-900 ${className}`}
    >
      {children}
    </label>
  );
}

// ---------- Character count helper ----------

function CharCount({ value, max }: { value: string; max: number }) {
  const remaining = max - value.length;
  const warn = remaining < max * 0.1;
  return (
    <p
      className={`mt-1 text-xs ${warn ? "text-ember-700" : "text-navy-500"}`}
      aria-live="polite"
    >
      {value.length} / {max}
    </p>
  );
}

// ---------- Bullet editor ----------
//
// Generic add/edit/remove for a list of single-line strings.
// Used for "what makes us different" bullets and for per-service
// features (slightly different cap + maxLength).

function BulletEditor({
  bullets,
  onChange,
  disabled,
  cap,
  maxLength,
  placeholder,
}: {
  bullets: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  cap: number;
  maxLength: number;
  placeholder: string;
}) {
  const atCap = bullets.length >= cap;

  function update(i: number, v: string) {
    const next = bullets.slice();
    next[i] = v;
    onChange(next);
  }
  function remove(i: number) {
    onChange(bullets.filter((_, idx) => idx !== i));
  }
  function add() {
    if (atCap) return;
    onChange([...bullets, ""]);
  }
  function moveUp(i: number) {
    if (i === 0) return;
    const next = bullets.slice();
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  }
  function moveDown(i: number) {
    if (i === bullets.length - 1) return;
    const next = bullets.slice();
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange(next);
  }

  return (
    <div>
      {bullets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-navy-200 bg-white p-4 text-sm text-navy-500">
          No bullets yet. Click &ldquo;Add a bullet&rdquo; to start.
        </p>
      ) : (
        <ul className="space-y-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <input
                type="text"
                value={b}
                disabled={disabled}
                onChange={(e) => update(i, e.target.value)}
                maxLength={maxLength}
                placeholder={placeholder}
                className="flex-1 rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
              />
              <ReorderButtons
                disabled={disabled}
                upDisabled={i === 0}
                downDisabled={i === bullets.length - 1}
                onUp={() => moveUp(i)}
                onDown={() => moveDown(i)}
              />
              <RowDeleteButton
                disabled={disabled}
                onClick={() => remove(i)}
                label={`Remove bullet ${i + 1}`}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={disabled || atCap}
          className="rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm font-semibold text-navy-900 hover:border-navy-400 disabled:opacity-50"
        >
          {atCap ? `At ${cap}-bullet limit` : "+ Add a bullet"}
        </button>
        <span className="text-xs text-navy-500">
          {bullets.length} / {cap}
        </span>
      </div>
    </div>
  );
}

// ---------- FAQ editor ----------
//
// Add/edit/remove for question-answer pairs.

function FaqEditor({
  faq,
  onChange,
  disabled,
  cap,
}: {
  faq: FaqEntry[];
  onChange: (next: FaqEntry[]) => void;
  disabled: boolean;
  cap: number;
}) {
  const atCap = faq.length >= cap;

  function patch(i: number, p: Partial<FaqEntry>) {
    const next = faq.slice();
    next[i] = { ...next[i], ...p };
    onChange(next);
  }
  function remove(i: number) {
    onChange(faq.filter((_, idx) => idx !== i));
  }
  function add() {
    if (atCap) return;
    onChange([...faq, { question: "", answer: "" }]);
  }
  function moveUp(i: number) {
    if (i === 0) return;
    const next = faq.slice();
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  }
  function moveDown(i: number) {
    if (i === faq.length - 1) return;
    const next = faq.slice();
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange(next);
  }

  return (
    <div>
      {faq.length === 0 ? (
        <p className="rounded-lg border border-dashed border-navy-200 bg-white p-4 text-sm text-navy-500">
          No FAQs yet. Click &ldquo;Add a question&rdquo; to start.
        </p>
      ) : (
        <ul className="space-y-4">
          {faq.map((f, i) => (
            <li
              key={i}
              className="rounded-xl border border-navy-100 bg-white p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                  Q{i + 1}
                </p>
                <div className="flex items-center gap-2">
                  <ReorderButtons
                    disabled={disabled}
                    upDisabled={i === 0}
                    downDisabled={i === faq.length - 1}
                    onUp={() => moveUp(i)}
                    onDown={() => moveDown(i)}
                  />
                  <RowDeleteButton
                    disabled={disabled}
                    onClick={() => remove(i)}
                    label={`Remove FAQ ${i + 1}`}
                  />
                </div>
              </div>
              <input
                type="text"
                value={f.question}
                disabled={disabled}
                onChange={(e) => patch(i, { question: e.target.value })}
                maxLength={FAQ_QUESTION_MAX}
                placeholder="e.g. How long does a typical loft conversion take?"
                className="mt-2 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm font-semibold text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
              />
              <textarea
                value={f.answer}
                disabled={disabled}
                onChange={(e) => patch(i, { answer: e.target.value })}
                maxLength={FAQ_ANSWER_MAX}
                rows={3}
                placeholder="e.g. Most are done in 6-10 weeks from first day on site, depending on planning approval and how complex your design is..."
                className="mt-2 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={disabled || atCap}
          className="rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm font-semibold text-navy-900 hover:border-navy-400 disabled:opacity-50"
        >
          {atCap ? `At ${cap}-FAQ limit` : "+ Add a question"}
        </button>
        <span className="text-xs text-navy-500">
          {faq.length} / {cap}
        </span>
      </div>
    </div>
  );
}

// ---------- Per-service content card ----------

const SERVICE_NAME_MAX = 200;

function ServiceContentCard({
  serviceName,
  description,
  priceFrom,
  longDescription,
  features,
  pricingNotes,
  disabled,
  onNameChange,
  onDescriptionChange,
  onPriceFromChange,
  onLongDescChange,
  onFeaturesChange,
  onPricingNotesChange,
  onDelete,
}: {
  serviceName: string;
  description: string;
  priceFrom: number | undefined;
  longDescription: string;
  features: string[];
  pricingNotes: string;
  disabled: boolean;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onPriceFromChange: (v: number | undefined) => void;
  onLongDescChange: (v: string) => void;
  onFeaturesChange: (v: string[]) => void;
  onPricingNotesChange: (v: string) => void;
  onDelete: () => void;
}) {
  function handleDelete() {
    if (
      window.confirm(
        `Remove this service${serviceName.trim() ? ` ("${serviceName.trim()}")` : ""}? Its description, features and pricing notes will be deleted too.`,
      )
    ) {
      onDelete();
    }
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <FieldLabel>Service name</FieldLabel>
          <input
            type="text"
            value={serviceName}
            disabled={disabled}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={SERVICE_NAME_MAX}
            placeholder="e.g. Loft conversions"
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 font-serif text-base font-semibold text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </div>
        <RowDeleteButton
          disabled={disabled}
          onClick={handleDelete}
          label={`Remove service${serviceName.trim() ? ` "${serviceName.trim()}"` : ""}`}
        />
      </div>

      {/* Short description + starting price — the canonical fields
          that drive the services card grid. Both seeded from Phase 3
          on first edit; canonical thereafter. */}
      <div className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr]">
        <div>
          <FieldLabel>Short description (optional)</FieldLabel>
          <p className="text-xs text-navy-600">
            1-2 sentences. The summary that appears on the services
            card grid.
          </p>
          <textarea
            value={description}
            disabled={disabled}
            onChange={(e) => onDescriptionChange(e.target.value)}
            maxLength={SERVICE_DESC_MAX}
            rows={2}
            placeholder="e.g. Convert your loft into usable living space — bedroom, office, or playroom. Full project from drawings to handover."
            className="mt-1 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
          <CharCount value={description} max={SERVICE_DESC_MAX} />
        </div>
        <div>
          <FieldLabel>Starting price (£) — optional</FieldLabel>
          <p className="text-xs text-navy-600">
            Renders as &ldquo;From £X&rdquo; on the card. Leave blank
            if you&apos;d rather not show one.
          </p>
          <input
            type="number"
            min={0}
            step={1}
            value={typeof priceFrom === "number" ? priceFrom : ""}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onPriceFromChange(undefined);
                return;
              }
              const num = Number(raw);
              onPriceFromChange(
                Number.isFinite(num) && num >= 0 ? num : undefined,
              );
            }}
            placeholder="e.g. 25000"
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </div>
      </div>

      <FieldLabel className="mt-4">
        Longer description (optional)
      </FieldLabel>
      <p className="text-xs text-navy-600">
        2-4 sentences for the dedicated services page. What&apos;s
        included, typical scope, what makes you good at it.
      </p>
      <textarea
        value={longDescription}
        disabled={disabled}
        onChange={(e) => onLongDescChange(e.target.value)}
        maxLength={SERVICE_LONG_DESC_MAX}
        rows={4}
        placeholder="e.g. Full design + build, planning included. We handle everything from initial drawings to final snagging — including engaging structural engineers, building control submission, and party-wall agreements where needed..."
        className="mt-1 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
      />
      <CharCount value={longDescription} max={SERVICE_LONG_DESC_MAX} />

      <FieldLabel className="mt-4">Key features (optional)</FieldLabel>
      <p className="text-xs text-navy-600">
        Up to 8 short bullets — what&apos;s included or noteworthy
        about how you do this service.
      </p>
      <div className="mt-2">
        <BulletEditor
          bullets={features}
          onChange={onFeaturesChange}
          disabled={disabled}
          cap={SERVICE_FEATURE_CAP}
          maxLength={SERVICE_FEATURE_MAX}
          placeholder="e.g. 10-year structural warranty"
        />
      </div>

      <FieldLabel className="mt-4">Pricing notes (optional)</FieldLabel>
      <p className="text-xs text-navy-600">
        Free-form pricing copy — if &ldquo;from £X&rdquo; needs
        more nuance, write it here. Otherwise leave blank and the
        intake price stands.
      </p>
      <textarea
        value={pricingNotes}
        disabled={disabled}
        onChange={(e) => onPricingNotesChange(e.target.value)}
        maxLength={SERVICE_PRICING_MAX}
        rows={2}
        placeholder="e.g. From £28,000 for a basic dormer; full hip-to-gable from £42,000 including planning."
        className="mt-1 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
      />
      <CharCount value={pricingNotes} max={SERVICE_PRICING_MAX} />
    </div>
  );
}

// ---------- Reorder buttons ----------

function ReorderButtons({
  disabled,
  upDisabled,
  downDisabled,
  onUp,
  onDown,
}: {
  disabled: boolean;
  upDisabled: boolean;
  downDisabled: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onUp}
        disabled={disabled || upDisabled}
        aria-label="Move up"
        className="flex h-5 w-6 items-center justify-center rounded-t border border-navy-200 bg-white text-navy-700 hover:bg-navy-50 disabled:opacity-30"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M5 2 L8 6 L2 6 Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={disabled || downDisabled}
        aria-label="Move down"
        className="flex h-5 w-6 items-center justify-center rounded-b border border-t-0 border-navy-200 bg-white text-navy-700 hover:bg-navy-50 disabled:opacity-30"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 4 L8 4 L5 8 Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  );
}

// ---------- Row delete button ----------

function RowDeleteButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-navy-200 bg-white text-navy-700 hover:border-ember-400 hover:text-ember-700 disabled:opacity-50"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 5l14 14M19 5L5 19"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

// ---------- Testimonial editor ----------
//
// Up to 5 customer testimonials. Each: required name, optional
// location, required quote. List uses the same stable-id pattern
// as services so reorders/deletes don't lose state. Add button
// disabled at cap.

function TestimonialEditor({
  testimonials,
  onChange,
  disabled,
  cap,
}: {
  testimonials: TestimonialRow[];
  onChange: (next: TestimonialRow[]) => void;
  disabled: boolean;
  cap: number;
}) {
  function patch(id: string, p: Partial<Testimonial>) {
    onChange(testimonials.map((t) => (t._localId === id ? { ...t, ...p } : t)));
  }
  function remove(id: string) {
    onChange(testimonials.filter((t) => t._localId !== id));
  }
  function add() {
    onChange([
      ...testimonials,
      { name: "", quote: "", _localId: crypto.randomUUID() },
    ]);
  }
  return (
    <div>
      {testimonials.length === 0 ? (
        <p className="rounded-lg border border-dashed border-navy-200 bg-white p-4 text-sm text-navy-500">
          No testimonials yet. Click &ldquo;Add a testimonial&rdquo;
          below to start. Even one or two real customer quotes makes
          your site noticeably more trustworthy.
        </p>
      ) : (
        <ul className="space-y-4">
          {testimonials.map((t) => (
            <li
              key={t._localId}
              className="rounded-xl border border-navy-100 bg-white p-5"
            >
              <div className="flex items-start gap-3">
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel>Customer name</FieldLabel>
                    <input
                      type="text"
                      value={t.name}
                      disabled={disabled}
                      onChange={(e) => patch(t._localId, { name: e.target.value })}
                      maxLength={TESTIMONIAL_NAME_MAX}
                      placeholder="e.g. Sarah Johnson"
                      className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
                    />
                  </div>
                  <div>
                    <FieldLabel>Location (optional)</FieldLabel>
                    <input
                      type="text"
                      value={t.location ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        patch(t._localId, { location: e.target.value })
                      }
                      maxLength={TESTIMONIAL_LOCATION_MAX}
                      placeholder="e.g. Headington, Oxford"
                      className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
                    />
                  </div>
                </div>
                <RowDeleteButton
                  disabled={disabled}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove this testimonial${t.name.trim() ? ` (from ${t.name.trim()})` : ""}?`,
                      )
                    ) {
                      remove(t._localId);
                    }
                  }}
                  label={`Remove testimonial${t.name.trim() ? ` from ${t.name.trim()}` : ""}`}
                />
              </div>
              <FieldLabel className="mt-3">Quote</FieldLabel>
              <textarea
                value={t.quote}
                disabled={disabled}
                onChange={(e) => patch(t._localId, { quote: e.target.value })}
                maxLength={TESTIMONIAL_QUOTE_MAX}
                rows={3}
                placeholder="e.g. Lucas and his team transformed our loft into the perfect home office. On time, on budget, and tidied up beautifully every day."
                className="mt-1 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
              />
              <CharCount value={t.quote} max={TESTIMONIAL_QUOTE_MAX} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={disabled || testimonials.length >= cap}
          className="rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-sm font-semibold text-navy-900 hover:border-navy-400 disabled:opacity-50"
        >
          + Add a testimonial
        </button>
        <span className="text-xs text-navy-500">
          {testimonials.length} / {cap} testimonial
          {testimonials.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

// ---------- Trust signals editor ----------
//
// Three flat fields, all optional. Renders as a tiny grid for
// scanning. Years experience is a number; the other two are short
// free-text.

function TrustEditor({
  trust,
  onChange,
  disabled,
}: {
  trust: TrustData;
  onChange: (next: TrustData) => void;
  disabled: boolean;
}) {
  function patch(p: Partial<TrustData>) {
    onChange({ ...trust, ...p });
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <FieldLabel>Years of experience (optional)</FieldLabel>
        <input
          type="number"
          min={0}
          max={200}
          step={1}
          value={
            typeof trust.yearsExperience === "number"
              ? trust.yearsExperience
              : ""
          }
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return patch({ yearsExperience: undefined });
            const num = Number(raw);
            patch({
              yearsExperience:
                Number.isFinite(num) && num >= 0 ? num : undefined,
            });
          }}
          placeholder="e.g. 15"
          className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <p className="mt-1 text-xs text-navy-500">
          Renders as &ldquo;Established YYYY&rdquo; or &ldquo;15
          years&rsquo; experience&rdquo;.
        </p>
      </div>
      <div className="md:col-span-2">
        <FieldLabel>Professional associations (optional)</FieldLabel>
        <input
          type="text"
          value={trust.associations ?? ""}
          disabled={disabled}
          onChange={(e) => patch({ associations: e.target.value })}
          maxLength={ASSOCIATIONS_MAX}
          placeholder="e.g. Member of FMB, NICEIC certified, Trustmark approved"
          className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <CharCount value={trust.associations ?? ""} max={ASSOCIATIONS_MAX} />
      </div>
      <div className="md:col-span-2">
        <FieldLabel>Awards or recognitions (optional)</FieldLabel>
        <input
          type="text"
          value={trust.awards ?? ""}
          disabled={disabled}
          onChange={(e) => patch({ awards: e.target.value })}
          maxLength={AWARDS_MAX}
          placeholder="e.g. Oxfordshire Builder of the Year 2024"
          className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <CharCount value={trust.awards ?? ""} max={AWARDS_MAX} />
      </div>
    </div>
  );
}

// ---------- Business details editor ----------
//
// Contact info + opening hours. Every field optional individually
// — adapter prefers any value here over Phase 3, falls through to
// Phase 3 / prospect record for missing fields. Lets customers
// update their contact info without emailing Ben.

function BusinessDetailsEditor({
  business,
  onChange,
  disabled,
}: {
  business: BusinessDetails;
  onChange: (next: BusinessDetails) => void;
  disabled: boolean;
}) {
  function patch(p: Partial<BusinessDetails>) {
    onChange({ ...business, ...p });
  }
  function patchHours(day: Day, p: Partial<{ open: boolean; from?: string; to?: string }>) {
    const current = business.openingHours ?? {};
    const dayCurrent = current[day] ?? { open: false };
    onChange({
      ...business,
      openingHours: {
        ...current,
        [day]: { ...dayCurrent, ...p },
      },
    });
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel>Main contact name (optional)</FieldLabel>
          <input
            type="text"
            value={business.contactName ?? ""}
            disabled={disabled}
            onChange={(e) => patch({ contactName: e.target.value })}
            maxLength={CONTACT_NAME_MAX}
            placeholder="e.g. Lucas Smith"
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </div>
        <div>
          <FieldLabel>Public email</FieldLabel>
          <input
            type="email"
            value={business.publicEmail ?? ""}
            disabled={disabled}
            onChange={(e) => patch({ publicEmail: e.target.value })}
            maxLength={EMAIL_MAX}
            placeholder="e.g. hello@bobbuilders.co.uk"
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </div>
        <div>
          <FieldLabel>Phone (display format)</FieldLabel>
          <input
            type="text"
            value={business.phoneDisplay ?? ""}
            disabled={disabled}
            onChange={(e) => patch({ phoneDisplay: e.target.value })}
            maxLength={PHONE_MAX}
            placeholder="e.g. 01865 123 456"
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </div>
        <div>
          <FieldLabel>Phone (digits only, for tap-to-call)</FieldLabel>
          <input
            type="tel"
            value={business.phoneTel ?? ""}
            disabled={disabled}
            onChange={(e) => patch({ phoneTel: e.target.value })}
            maxLength={PHONE_MAX}
            placeholder="e.g. 01865123456"
            className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Business address</FieldLabel>
        <textarea
          value={business.address ?? ""}
          disabled={disabled}
          onChange={(e) => patch({ address: e.target.value })}
          maxLength={ADDRESS_MAX}
          rows={2}
          placeholder="e.g. 12 High Street, Oxford OX1 4AB"
          className="mt-1 w-full resize-y rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
      </div>

      <div>
        <FieldLabel>Service area</FieldLabel>
        <input
          type="text"
          value={business.serviceArea ?? ""}
          disabled={disabled}
          onChange={(e) => patch({ serviceArea: e.target.value })}
          maxLength={SERVICE_AREA_MAX}
          placeholder="e.g. Oxford and within 20 miles"
          className="mt-1 w-full rounded-lg border-2 border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
      </div>

      <div>
        <FieldLabel>Opening hours</FieldLabel>
        <p className="text-xs text-navy-600">
          Tick the days you&apos;re open and set the times. Anything
          left unticked renders as &ldquo;Closed&rdquo;.
        </p>
        <div className="mt-3 space-y-2">
          {DAYS.map((day) => {
            const h = business.openingHours?.[day];
            const open = h?.open ?? false;
            return (
              <div
                key={day}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-navy-100 bg-white px-3 py-2"
              >
                <label className="flex w-20 flex-none items-center gap-2 text-sm font-semibold text-navy-900">
                  <input
                    type="checkbox"
                    checked={open}
                    disabled={disabled}
                    onChange={(e) =>
                      patchHours(day, { open: e.target.checked })
                    }
                    className="h-4 w-4 accent-navy-900"
                  />
                  {day}
                </label>
                {open ? (
                  <>
                    <input
                      type="time"
                      value={h?.from ?? ""}
                      disabled={disabled}
                      onChange={(e) => patchHours(day, { from: e.target.value })}
                      aria-label={`${day} open from`}
                      className="rounded-lg border-2 border-navy-200 bg-white px-2 py-1 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
                    />
                    <span className="text-xs text-navy-600">to</span>
                    <input
                      type="time"
                      value={h?.to ?? ""}
                      disabled={disabled}
                      onChange={(e) => patchHours(day, { to: e.target.value })}
                      aria-label={`${day} open until`}
                      className="rounded-lg border-2 border-navy-200 bg-white px-2 py-1 text-sm text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
                    />
                  </>
                ) : (
                  <span className="text-xs text-navy-500">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
