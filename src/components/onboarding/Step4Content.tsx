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

// Mirrors src/lib/onboarding.ts step4ContentSchema. Keeping the
// component types close to the schema prevents drift; the API
// validates on save anyway.
type ServiceContent = {
  serviceName: string;
  longDescription?: string;
  features?: string[];
  pricingNotes?: string;
};

type FaqEntry = { question: string; answer: string };

type ContentData = {
  tagline?: string;
  aboutBlurb?: string;
  aboutBullets?: string[];
  services?: ServiceContent[];
  faq?: FaqEntry[];
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
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

/** Internal state row — adds a stable client-only id so React can
 *  track entries through renames + reorders. Stripped on save. */
type ServiceRow = ServiceContent & { _localId: string };

const TAGLINE_MAX = 200;
const ABOUT_BLURB_MAX = 5000;
const BULLET_MAX = 300;
const ABOUT_BULLET_CAP = 8;
const SERVICE_LONG_DESC_MAX = 2000;
const SERVICE_FEATURE_MAX = 200;
const SERVICE_FEATURE_CAP = 8;
const SERVICE_PRICING_MAX = 500;
const FAQ_QUESTION_MAX = 300;
const FAQ_ANSWER_MAX = 2000;
const FAQ_CAP = 10;
const NOTES_MAX = 2000;

export default function Step4Content({
  data,
  done,
  readOnly,
  services,
  savePartial,
  markDone,
}: Props) {
  // ---------- Initialise from saved data ----------
  // Defensive reads — `data` is the raw JSON slice and may be
  // partially populated. Fall through to safe empty values.
  const initial = data as ContentData;

  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [aboutBlurb, setAboutBlurb] = useState(initial.aboutBlurb ?? "");
  const [aboutBullets, setAboutBullets] = useState<string[]>(
    Array.isArray(initial.aboutBullets) ? initial.aboutBullets : [],
  );
  // Per-service content — ordered list with stable client-only ids
  // so renames + reorders work cleanly. Initialised in this order:
  //   1. If the content step has saved services, use them as-is
  //   2. Otherwise seed from the Phase 3 intake services prop
  //   3. If neither (no Phase 3 + no edits), start empty
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
    return services.map((s) => ({
      serviceName: s.name,
      _localId: crypto.randomUUID(),
    }));
  });
  const [faq, setFaq] = useState<FaqEntry[]>(
    Array.isArray(initial.faq) ? initial.faq : [],
  );
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
        const longDescription = s.longDescription?.trim() || undefined;
        const features = (s.features ?? [])
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        const pricingNotes = s.pricingNotes?.trim() || undefined;
        const entry: ServiceContent = { serviceName: name };
        if (longDescription) entry.longDescription = longDescription;
        if (features.length > 0) entry.features = features;
        if (pricingNotes) entry.pricingNotes = pricingNotes;
        return entry;
      })
      .filter((s): s is ServiceContent => s !== null);

    const cleanedFaq = faq
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter((f) => f.question.length > 0 && f.answer.length > 0);

    return {
      tagline: trimmedTagline || undefined,
      aboutBlurb: trimmedAbout || undefined,
      aboutBullets: cleanedBullets.length > 0 ? cleanedBullets : undefined,
      services: servicesArr.length > 0 ? servicesArr : undefined,
      faq: cleanedFaq.length > 0 ? cleanedFaq : undefined,
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
        helper="Each service gets its own card. Edit the name, delete a service, or add a new one — this list becomes the canonical services list on your site."
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
                longDescription={s.longDescription ?? ""}
                features={s.features ?? []}
                pricingNotes={s.pricingNotes ?? ""}
                disabled={disabled}
                onNameChange={(v) =>
                  patchService(s._localId, { serviceName: v })
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
      >
        <FaqEditor
          faq={faq}
          onChange={setFaq}
          disabled={disabled}
          cap={FAQ_CAP}
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
  children,
}: {
  letter: string;
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 rounded-2xl border border-navy-100 bg-cream-50 p-6">
      <header className="flex items-baseline gap-3">
        <span className="font-serif text-sm font-semibold text-ember-600">
          Section {letter}
        </span>
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          {title}
        </h3>
      </header>
      <p className="mt-1 text-sm text-navy-600">{helper}</p>
      <div className="mt-4">{children}</div>
    </section>
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
  longDescription,
  features,
  pricingNotes,
  disabled,
  onNameChange,
  onLongDescChange,
  onFeaturesChange,
  onPricingNotesChange,
  onDelete,
}: {
  serviceName: string;
  longDescription: string;
  features: string[];
  pricingNotes: string;
  disabled: boolean;
  onNameChange: (v: string) => void;
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

      <FieldLabel className="mt-4">
        Longer description (optional)
      </FieldLabel>
      <p className="text-xs text-navy-600">
        2-4 sentences expanding on the short description from
        intake. What&apos;s included, typical scope, what makes
        you good at it.
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
