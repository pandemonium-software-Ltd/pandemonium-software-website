"use client";

// Onboarding Hub — Step 5: Review & launch (two-stage).
//
// Two explicit submits at the end of onboarding:
//
//   Stage 1: "Request site preview" — only button visible initially.
//            Clicking it stamps `previewSubmittedAt` in Notion;
//            Cowork picks up the cue and builds the preview.
//
//   Stage 2: "Submit and commit site" — appears once previewSubmittedAt
//            is set. Disabled until previewUrl is also set (i.e. the
//            preview Cowork built is ready to view). Click locks in
//            the launch and starts the build.
//
// Three rendering phases driven by the two timestamps:
//
//   Phase 1 (no previewSubmittedAt):
//     - Section A: intro + the "Request site preview" button only
//     - Sections B + C: HIDDEN
//
//   Phase 2 (previewSubmittedAt set, no previewUrl):
//     - Section A: "Preview being built" placeholder
//     - Section B: edits section visible (3 max), submit functional
//     - Section C: visible but commit button DISABLED with
//       "preview pending" message
//
//   Phase 3 (previewUrl set):
//     - Section A: iframe + open-in-new-tab link
//     - Section B: edits section + 3-cap submit
//     - Section C: commit button ENABLED once go-live date + sign-off
//       checkbox are filled
//
// The cap on edits is the scope-creep guardrail. New pages, new
// features and full redesigns are quoted separately under Terms §10.
// Submissions go to a dedicated /api/onboarding/review-edit POST
// endpoint that enforces the cap server-side too.

import { useEffect, useRef, useState } from "react";
import { MAX_REVIEW_EDITS, type ReviewEdit } from "@/lib/onboarding";
import PreviewFrame from "@/components/PreviewFrame";

type ReviewSiteData = {
  phoneDisplay: string;
  phoneTel: string;
  publicEmail: string;
  address: string;
  serviceArea: string;
  openingHours: Record<string, { open: boolean; from?: string; to?: string }> | null;
  tagline: string;
  aboutBlurb: string;
  services: Array<{ name: string; description: string; longDescription: string; pricingNotes: string; priceFrom: number | null }>;
  faq: Array<{ question: string; answer: string }>;
  testimonials: Array<{ name: string; quote: string; rating: number | null }>;
  trust: { yearsExperience: number | null; associations: string; awards: string };
  locations: Array<{
    name: string;
    phoneDisplay: string;
    phoneTel: string;
    publicEmail: string;
    address: string;
    openingHours: Record<string, { open: boolean; from?: string; to?: string }> | null;
  }>;
};

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  token: string;
  allPriorStepsDone: boolean;
  reviewEditCap?: number;
  siteData?: ReviewSiteData;
  onReviewDataChange: (patch: Record<string, unknown>) => void;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

export default function Step5Review({
  data,
  done,
  readOnly,
  token,
  allPriorStepsDone,
  reviewEditCap,
  siteData,
  onReviewDataChange,
  savePartial,
  markDone,
}: Props) {
  // Initial state from saved data.
  const initialPreviewUrl =
    typeof data.previewUrl === "string" ? data.previewUrl : "";
  const initialPreviewSubmittedAt =
    typeof data.previewSubmittedAt === "string"
      ? data.previewSubmittedAt
      : "";
  const initialEdits = (Array.isArray(data.edits) ? data.edits : []) as ReviewEdit[];
  const initialGoLive =
    typeof data.goLiveDate === "string" ? data.goLiveDate : "";
  const initialSignOff = data.finalSignOff === true;
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [previewSubmittedAt, setPreviewSubmittedAt] = useState(
    initialPreviewSubmittedAt,
  );
  const [edits, setEdits] = useState<ReviewEdit[]>(initialEdits);
  const [goLiveDate, setGoLiveDate] = useState(initialGoLive);
  const [signOff, setSignOff] = useState(initialSignOff);
  const [notes, setNotes] = useState(initialNotes);

  // Three-phase render based on the two timestamps.
  // Once the step is marked done, the existing read-only path takes
  // over (commit captured, hub locks).
  const phase: 1 | 2 | 3 =
    !previewSubmittedAt ? 1 : !initialPreviewUrl ? 2 : 3;
  const previewBeingBuilt = phase === 2;
  const showEditsAndCommit = phase === 2 || phase === 3;
  const commitEnabled = phase === 3;

  // Stage 1 → Stage 2: customer requests the preview build.
  const [requestingPreview, setRequestingPreview] = useState(false);
  async function handleRequestPreview() {
    setError(null);
    setRequestingPreview(true);
    const now = new Date().toISOString();
    const ok = await savePartial({ previewSubmittedAt: now });
    setRequestingPreview(false);
    if (ok) {
      setPreviewSubmittedAt(now);
      // Smooth scroll to top so the new "preview being built" state
      // is visible immediately.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else {
      setError("Couldn't request your preview just now. Try again.");
    }
  }

  // Edit submission UI state.
  const [editDraft, setEditDraft] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Step save / mark-done state.
  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);

  const disabled = readOnly;
  const activeEdits = edits.filter((e) => e.status !== "rejected");
  const cap = reviewEditCap ?? MAX_REVIEW_EDITS;
  const remaining = cap - activeEdits.length;
  const todayIso = new Date().toISOString().slice(0, 10);

  // ---------- Submit a revision ----------

  async function handleSubmitEdit() {
    setEditError(null);
    setEditSuccess(null);
    const trimmed = editDraft.trim();
    if (trimmed.length < 20) {
      setEditError("Tell me a bit more — at least a couple of sentences.");
      return;
    }
    if (remaining <= 0) {
      setEditError(
        `You've used all ${cap} pre-launch edits.`,
      );
      return;
    }
    setSubmittingEdit(true);
    try {
      const res = await fetch("/api/onboarding/review-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: trimmed }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        edit?: ReviewEdit;
        remaining?: number;
        error?: string;
      };
      if (!res.ok || !json.success || !json.edit) {
        setEditError(json.error ?? "Couldn't submit. Try again.");
        return;
      }
      const updatedEdits = [...edits, json.edit!];
      setEdits(updatedEdits);
      onReviewDataChange({ edits: updatedEdits });
      setEditDraft("");
      setEditSuccess(
        `Got it. ${json.remaining ?? remaining - 1} edit${(json.remaining ?? remaining - 1) === 1 ? "" : "s"} remaining.`,
      );
      setTimeout(() => setEditSuccess(null), 6000);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingEdit(false);
    }
  }

  // ---------- Save / mark-done / update ----------

  function buildPatch(): Record<string, unknown> {
    return {
      // We don't write previewUrl here — that's set by Cowork (or
      // the operator) via Notion directly.
      goLiveDate: goLiveDate.trim() || undefined,
      finalSignOff: signOff,
      notes: notes.trim(),
      // Edits are managed via the dedicated review-edit endpoint;
      // we don't overwrite them in this patch.
    };
  }

  function validateForDone(): string | null {
    if (!goLiveDate.trim())
      return "Please pick a target go-live date before signing off.";
    if (!signOff)
      return "Please tick the final sign-off so I know you're happy to go live.";
    return null;
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't save just now. Try again.");
  }

  async function handleMarkDone() {
    const err = validateForDone();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setPending("done");
    const ok = await markDone(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't mark done. Try again.");
  }

  async function handleUpdate() {
    const err = validateForDone();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setPending("update");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't update just now. Try again.");
  }

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Step 5
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Review &amp; launch
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          Two stages to launch:{" "}
          <strong>request your preview</strong>, then{" "}
          <strong>commit when you&apos;re happy</strong>. You get up
          to {cap} rounds of edits between the two.
        </p>
      </header>

      {/* ---------- A. Preview ---------- */}
      <section className="mt-7">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          A. Preview your site
        </h3>

        {phase === 1 && (
          <div className="mt-4 space-y-4">
            {allPriorStepsDone ? (
              <>
                <p className="text-sm text-navy-700">
                  Click the button below to ask me to build your site
                  preview. I&apos;ll take everything you gave me in
                  Steps 1-4 and assemble it into a working site you can
                  view + critique. Typically ready within 5 working days.
                </p>
                <button
                  type="button"
                  onClick={handleRequestPreview}
                  disabled={disabled || requestingPreview}
                  className="btn-primary"
                >
                  {requestingPreview
                    ? "Requesting…"
                    : "Request site preview"}
                </button>
                <p className="text-xs text-navy-500">
                  Once requested, the Edits section unlocks for revisions
                  and the final &ldquo;Submit and commit&rdquo; button
                  appears below.
                </p>
              </>
            ) : (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
                <p className="font-semibold">
                  Complete Steps 1–4 first
                </p>
                <p className="mt-2">
                  Before I can build your preview, all earlier steps need
                  to be marked done — Cloudflare account, domain,
                  tools setup, site content, and photos. Go back and
                  finish any steps you haven&apos;t completed yet.
                </p>
              </div>
            )}
          </div>
        )}

        {phase === 2 && (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-navy-200 bg-cream-50 p-6 text-sm leading-relaxed text-navy-700">
            <p className="font-semibold text-navy-900">
              Your preview is being built.
            </p>
            <p className="mt-2">
              Requested {formatRelative(previewSubmittedAt)}. I&apos;m
              putting together your site from everything you gave me
              in Steps 1-4 — typically ready within 5 working days.
              You&apos;ll get an email when it&apos;s live and the
              preview iframe will appear here on refresh.
            </p>
          </div>
        )}

        {phase === 3 && (
          <div className="mt-4">
            <p className="text-sm text-navy-700">
              Have a look at your preview below. Tap the full-screen
              button on the top-right to view it big — and revisit
              this step on your phone too (most traffic comes from
              mobile). The preview only loads inside this dashboard;
              there&apos;s no shareable link.
            </p>
            <div className="mt-3">
              <PreviewFrame
                src={initialPreviewUrl}
                height="600px"
                caption="Your site preview"
              />
            </div>
          </div>
        )}
      </section>

      {/* ---------- B. Request edits (only after preview requested) ---------- */}
      {showEditsAndCommit && (
      <section className="mt-9">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            B. Request edits
          </h3>
          <EditCounter used={activeEdits.length} max={cap} />
        </div>
        <p className="mt-2 text-sm text-navy-700">
          You get up to <strong>{cap} rounds</strong> of
          revisions before launch. After launch, you can ask for up
          to 2 changes a month from your dashboard (bundle a few
          related tweaks into one if you like). Bigger jobs I quote
          separately. The cap keeps us both honest about scope.
        </p>

        {/* Scope guardrails */}
        <ScopeGuardrails />

        {/* Structure your feedback */}
        <FeedbackTemplate />

        {/* Submit form (only if previewed and edits remaining) */}
        {!disabled && remaining > 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm font-semibold text-navy-900">
              Edit {activeEdits.length + 1} of {cap}
            </p>

            {/* Quick edit form (collapsible) */}
            {siteData && (
              <details className="group rounded-xl border-2 border-navy-200 bg-cream-50">
                <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold text-navy-900">
                  Quick edit (contact, services, FAQ, etc.)
                  <span className="ml-2 text-navy-400 transition-transform group-open:rotate-90">&#9654;</span>
                </summary>
                <div className="border-t border-navy-100 px-5 py-4">
                  <ReviewQuickEditForm
                    token={token}
                    siteData={siteData}
                    submitting={submittingEdit}
                    previewReady={!!initialPreviewUrl}
                    onSubmitted={(edit) => {
                      const updatedEdits = [...edits, edit];
                      setEdits(updatedEdits);
                      onReviewDataChange({ edits: updatedEdits });
                    }}
                    onError={setEditError}
                    onSuccess={(msg) => {
                      setEditSuccess(msg);
                      setTimeout(() => setEditSuccess(null), 6000);
                    }}
                    remaining={remaining}
                  />
                </div>
              </details>
            )}

            {/* Free text form (collapsible) */}
            <details className="group rounded-xl border-2 border-navy-200 bg-white" open={!siteData}>
              <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold text-navy-900">
                Free text edit
                <span className="ml-2 text-navy-400 transition-transform group-open:rotate-90">&#9654;</span>
              </summary>
              <div className="border-t border-navy-100 px-5 py-4">
                <textarea
                  value={editDraft}
                  disabled={submittingEdit}
                  onChange={(e) => setEditDraft(e.target.value)}
                  placeholder={
                    "On the homepage, in the services section, swap the kitchen photo for the new one I uploaded yesterday. Also, in the About paragraph, change \"5 years\" to \"7 years\" — I just hit 7."
                  }
                  rows={6}
                  maxLength={2000}
                  className="w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900"
                />
                <button
                  type="button"
                  onClick={handleSubmitEdit}
                  disabled={
                    submittingEdit ||
                    editDraft.trim().length < 20 ||
                    !initialPreviewUrl
                  }
                  className="btn-primary mt-3"
                  title={
                    !initialPreviewUrl
                      ? "Your preview isn't ready yet — once it is, you'll be able to submit edits here."
                      : undefined
                  }
                >
                  {submittingEdit ? "Submitting…" : "Submit this edit"}
                </button>
                {!initialPreviewUrl && (
                  <p className="mt-2 text-xs text-navy-500">
                    The submit button unlocks once your preview is ready.
                  </p>
                )}
              </div>
            </details>

          </div>
        )}

        {editError && (
          <p className="mt-4 text-sm text-ember-700" role="alert">
            {editError}
          </p>
        )}
        {editSuccess && (
          <p className="mt-4 text-sm text-green-700" role="status">
            {editSuccess}
          </p>
        )}

        {!disabled && remaining === 0 && edits.length > 0 && (
          <div className="mt-6 rounded-xl border-2 border-navy-200 bg-cream-50 p-5 text-sm leading-relaxed text-navy-700">
            <p className="font-semibold text-navy-900">
              All {cap} edits used.
            </p>
            <p className="mt-2">
              Anything else from here goes into your post-launch
              monthly allowance (2 changes a month included) or gets
              quoted separately if it&apos;s bigger. Email me from
              your{" "}
              <a href={`/account/${token}`} className="link">
                Account dashboard
              </a>{" "}
              once you&apos;re live and we&apos;ll work through it.
            </p>
          </div>
        )}

        {/* History list — gated to showEditsAndCommit because in
            phase 1 there CAN'T be any edits (the form is hidden).
            The richer panel below this section renders the same
            history independently so it stays visible after the
            hub locks. */}
        {edits.length > 0 && (
          <EditHistoryList edits={edits} />
        )}
      </section>
      )}

      {/* ---------- Edit history (full, always-visible when any
           edits exist) ---------- */}
      {!showEditsAndCommit && edits.length > 0 && (
        <section className="mt-9">
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            Your edit history
          </h3>
          <p className="mt-2 text-sm text-navy-700">
            Every revision you&apos;ve submitted so far.
          </p>
          <EditHistoryList edits={edits} />
        </section>
      )}

      {/* ---------- C. Go-live + sign-off (only after preview requested) ---------- */}
      {showEditsAndCommit && (
      <section className="mt-9">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          C. Pick a launch date &amp; sign off
        </h3>
        <p className="mt-2 text-sm text-navy-700">
          Choose any date from today onwards. I&apos;ll switch the
          DNS over and your site goes live on the morning of that
          date. UK working hours, before 11am.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              Target go-live date
            </span>
            <input
              type="date"
              value={goLiveDate}
              disabled={disabled}
              min={todayIso}
              onChange={(e) => setGoLiveDate(e.target.value)}
              className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
            />
            <span className="mt-1.5 block text-xs text-navy-500">
              Allow at least 5 working days from your last edit so I
              can apply it before launch.
            </span>
          </label>
        </div>

        <label className="mt-5 flex items-start gap-3">
          <input
            type="checkbox"
            checked={signOff}
            disabled={disabled}
            onChange={(e) => setSignOff(e.target.checked)}
            className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 accent-navy-900"
          />
          <span className="min-w-0 text-[0.95rem] leading-relaxed text-navy-700">
            <span className="font-semibold text-navy-900">
              I&apos;ve reviewed the preview and I&apos;m happy to
              launch on the date above.
            </span>
            <span className="mt-1 block text-xs text-navy-500">
              You can change your mind any time before launch — just
              email me. Once your site is live, the Account dashboard
              takes over.
            </span>
          </span>
        </label>

        <label className="mt-5 block">
          <span className="block text-sm font-semibold text-navy-900">
            Anything I should know before launch? (optional)
          </span>
          <textarea
            value={notes}
            disabled={disabled}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. please launch in the morning so I can share it on social later that day"
            rows={3}
            maxLength={2000}
            className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </label>

        {error && (
          <p className="mt-4 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
      </section>
      )}

      {/* ---------- Footer: Save / Submit & commit ----------
          Hidden in phase 1 (only the "Request site preview" button
          in Section A is visible at that point). The commit button
          stays visible in phase 2 but disabled with a clear reason. */}
      {showEditsAndCommit && (
      <footer className="mt-7 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-6">
        {done ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-sm text-green-700" role="status">
              <strong>Signed off.</strong> Going live on{" "}
              <strong>{formatDate(goLiveDate)}</strong>. I&apos;ve emailed
              you a confirmation with your account dashboard link.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/account/${token}`}
                className="btn-primary"
              >
                Open your account dashboard →
              </a>
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
            </div>
            <p className="text-xs text-navy-500">
              Your account dashboard is your home for everything from
              now on — site status, subscription details, and the
              &ldquo;Need a change?&rdquo; form for any post-launch
              tweaks (2 changes a month included; bundle a few
              related tweaks into one request if you like).
            </p>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
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
                disabled={
                  pending !== "none" || disabled || !commitEnabled
                }
                className="btn-primary"
                title={
                  !commitEnabled
                    ? "Locked until your preview is built and you've reviewed it."
                    : undefined
                }
              >
                {pending === "done"
                  ? "Committing…"
                  : "Submit and commit site"}
              </button>
            </div>
            {!commitEnabled && (
              <p className="text-xs text-navy-500">
                The commit button unlocks once your preview is built.
                I&apos;ll email you the moment it&apos;s ready.
              </p>
            )}
          </div>
        )}
      </footer>
      )}
    </article>
  );
}

// ---------- Edit counter (visual pill row) ----------

function EditCounter({ used, max }: { used: number; max: number }) {
  const remaining = max - used;
  const tone =
    remaining === 0
      ? "bg-navy-900 text-white"
      : remaining === 1
        ? "bg-ember-100 text-ember-800 ring-1 ring-ember-200"
        : "bg-cream-100 text-navy-800 ring-1 ring-navy-200";
  return (
    <span className="inline-flex items-center gap-2">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={[
            "inline-block h-2.5 w-2.5 rounded-full",
            i < used ? "bg-navy-900" : "bg-navy-200",
          ].join(" ")}
        />
      ))}
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}
      >
        {remaining} of {max} remaining
      </span>
    </span>
  );
}

// ---------- Scope guardrails callout ----------

function ScopeGuardrails() {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border-2 border-green-200 bg-green-50/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-800">
          ✓ In scope (counts toward your 3)
        </p>
        <ul className="mt-2 space-y-1 text-sm text-navy-800">
          <li>• Swap a photo for a different one</li>
          <li>• Tweak copy on an existing page</li>
          <li>• Update phone, address, opening hours</li>
          <li>• Adjust a service description or price</li>
          <li>• Replace a testimonial</li>
          <li>• Refine a colour or font weight</li>
        </ul>
      </div>
      <div className="rounded-xl border-2 border-ember-200 bg-ember-50/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ember-800">
          ✗ Out of scope (quoted separately)
        </p>
        <ul className="mt-2 space-y-1 text-sm text-navy-800">
          <li>• Add a brand-new page</li>
          <li>• Add a section that wasn&apos;t in the brief</li>
          <li>• Restructure the navigation</li>
          <li>• Switch to a different template / layout</li>
          <li>
            • Add a feature you didn&apos;t buy (e.g. blog,
            e-commerce)
          </li>
          <li>• Bulk rewrite (more than ~10% of total copy)</li>
        </ul>
      </div>
    </div>
  );
}

// ---------- Feedback template ----------

function FeedbackTemplate() {
  return (
    <div className="mt-5 rounded-2xl bg-cream-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
        How to structure your feedback
      </p>
      <p className="mt-2 text-sm leading-relaxed text-navy-800">
        For each change, tell me <strong>where</strong>,{" "}
        <strong>what</strong>, and (optionally){" "}
        <strong>why</strong>. Specific beats vague every time.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="font-semibold text-green-800">
            ✓ Specific (easy to action)
          </p>
          <p className="mt-1.5 text-navy-700">
            &ldquo;On the homepage, in the services section, the
            second tile (Bathroom Installation) — change the price
            from &lsquo;from £1,200&rsquo; to &lsquo;from
            £1,500&rsquo; because my materials cost just went
            up.&rdquo;
          </p>
        </div>
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="font-semibold text-ember-800">
            ✗ Vague (I&apos;ll have to come back with questions)
          </p>
          <p className="mt-1.5 text-navy-700">
            &ldquo;The services page doesn&apos;t feel right. Can you
            make it look better?&rdquo;
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-navy-500">
        Multiple small changes in one edit are fine — each numbered
        list submitted as a single edit counts as one round, not
        three. The &ldquo;3 rounds&rdquo; cap is on rounds of
        feedback, not on individual changes.
      </p>
    </div>
  );
}

// ---------- Edit history list (full detail) ----------

/**
 * Renders the full pre-launch edit history with:
 *   - submission timestamp + status pill
 *   - original message
 *   - Cowork's classification + reasoning (when present)
 *   - patches Cowork applied (when present)
 *   - admin reply (when present)
 *   - resolution timestamp (when resolved)
 *
 * Shown on Step 5 so customers can always see what happened to
 * each request — submitted, classified, applied, rejected. Stays
 * visible even after the hub locks (signed-off), so customers
 * keep their paper trail.
 */
function EditHistoryList({ edits }: { edits: ReviewEdit[] }) {
  return (
    <div className="mt-7 border-t border-navy-100 pt-6">
      <h4 className="font-serif text-base font-semibold text-navy-900">
        Your edits so far ({edits.length})
      </h4>
      <ul className="mt-3 space-y-3">
        {edits.map((e, i) => (
          <EditHistoryItem key={e.id} edit={e} index={i + 1} />
        ))}
      </ul>
    </div>
  );
}

function EditHistoryItem({
  edit,
  index,
}: {
  edit: ReviewEdit;
  index: number;
}) {
  // Narrow Cowork fields off the schema-typed ReviewEdit. They're
  // all optional — old edits won't have them. Tolerate either the
  // legacy single `coworkPatch` or the new `coworkPatches` array.
  const ext = edit as ReviewEdit & {
    coworkClassification?: "in_scope" | "out_of_scope" | "ambiguous";
    coworkConfidence?: number;
    coworkReasoning?: string;
    coworkPatches?: Array<{
      target: string;
      newValue?: unknown;
      previousValue?: unknown;
    }>;
    coworkPatch?: {
      target: string;
      newValue?: unknown;
      previousValue?: unknown;
    };
    coworkPatchAppliedAt?: string;
    adminReply?: string;
    resolvedAt?: string;
  };
  const patches =
    ext.coworkPatches && ext.coworkPatches.length > 0
      ? ext.coworkPatches
      : ext.coworkPatch
        ? [ext.coworkPatch]
        : [];

  return (
    <li className="rounded-xl border border-navy-100 bg-cream-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wider text-navy-500">
          Edit {index} · {formatRelative(edit.submittedAt)}
        </span>
        <EditStatusPill status={edit.status} />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-navy-800">
        {edit.message}
      </p>

      {/* Auto-applied changes panel (when present). Customer-facing —
       *  we deliberately do NOT surface the classifier's verdict
       *  ("ambiguous", "in_scope", confidence %, raw reasoning text).
       *  Those are internal signals; showing them to customers makes
       *  the experience feel like a machine grading their request.
       *  Customers see what their words turned into, nothing more. */}
      {patches.length > 0 && ext.coworkPatchAppliedAt && (
        <div className="mt-3 rounded-lg border-l-2 border-amber-300 bg-white p-3 text-xs">
          <p className="font-semibold uppercase tracking-wider text-amber-900">
            What we did
          </p>
          <ul className="mt-2 ml-3 list-disc space-y-0.5 text-navy-800">
            {patches.map((p, i) => (
              <li key={i}>
                <span className="font-semibold">{prettifyTarget(p.target)}</span>
                {": "}
                <span className="break-all">{String(p.newValue)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-amber-700">
            Applied {formatRelative(ext.coworkPatchAppliedAt)}
          </p>
        </div>
      )}

      {/* Admin reply (when present) */}
      {ext.adminReply && (
        <div className="mt-3 rounded-lg border-l-2 border-green-500 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
            Reply from ModuForge
            {ext.resolvedAt && (
              <>
                {" · "}
                {formatRelative(ext.resolvedAt)}
              </>
            )}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-navy-800">
            {ext.adminReply}
          </p>
        </div>
      )}
    </li>
  );
}

// ---------- Edit status pill ----------

function EditStatusPill({ status }: { status: ReviewEdit["status"] }) {
  const tone =
    status === "applied"
      ? "bg-green-100 text-green-800"
      : status === "rejected"
        ? "bg-navy-100 text-navy-700"
        : "bg-orange-100 text-orange-800";
  const label =
    status === "applied"
      ? "Applied"
      : status === "rejected"
        ? "Closed (out of scope)"
        : "In progress";
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}

// ---------- Date formatters ----------

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Translate an internal patch target like `copy.tagline` or
 * `content.services.priceFrom` into a plain-English label the
 * customer can recognise from their own form. Falls back to the
 * raw target string if a label isn't known — better to show
 * something than nothing.
 */
function prettifyTarget(target: string): string {
  const map: Record<string, string> = {
    "copy.tagline": "Tagline",
    "copy.aboutBlurb": "About blurb",
    "content.aboutBullets": "About bullets",
    "content.aboutBullets.add": "Added about bullet",
    "content.aboutBullets.remove": "Removed about bullet",
    "business.contactName": "Contact name",
    "business.phoneDisplay": "Phone number",
    "business.phoneTel": "Phone (dial)",
    "business.publicEmail": "Email address",
    "business.address": "Address",
    "business.serviceArea": "Service area",
    "business.openingHours": "Opening hours",
    "content.trust.yearsExperience": "Years experience",
    "content.trust.associations": "Associations",
    "content.trust.awards": "Awards",
    "content.services.description": "Service description",
    "content.services.longDescription": "Service long description",
    "content.services.pricingNotes": "Service pricing notes",
    "content.services.priceFrom": "Service starting price",
    "content.services.features": "Service features",
    "content.services.add": "Added service",
    "content.services.remove": "Removed service",
    "content.faq.question": "FAQ question",
    "content.faq.answer": "FAQ answer",
    "content.faq.add": "Added FAQ",
    "content.faq.remove": "Removed FAQ",
    "content.testimonials.quote": "Testimonial quote",
    "content.testimonials.location": "Testimonial location",
    "content.testimonials.rating": "Testimonial rating",
    "content.testimonials.add": "Added testimonial",
    "content.testimonials.remove": "Removed testimonial",
    "branding.brandColorPrimary": "Primary brand colour",
    "branding.brandColorSecondary": "Secondary brand colour",
    "content.offers.current": "Current offer",
  };
  return map[target] ?? target;
}

function formatRelative(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMin = Math.floor((now - then) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------- Quick edit form for structured field changes ----------

type QuickEditCategory = "contact" | "copy" | "service" | "faq" | "testimonial" | "trust" | "photo";
type QuickEditField =
  | "phone" | "email" | "address" | "serviceArea" | "openingHours"
  | "tagline" | "aboutBlurb"
  | "serviceDesc" | "serviceLongDesc" | "servicePricing" | "servicePrice"
  | "faqAnswer" | "faqQuestion"
  | "testimonialQuote" | "testimonialRating"
  | "trustYears" | "trustAssociations" | "trustAwards"
  | "photoLogo" | "photoHero" | "photoAbout" | "photoService" | "photoGallery" | "photoBackground";

const CATEGORIES: { value: QuickEditCategory; label: string }[] = [
  { value: "contact", label: "Contact & hours" },
  { value: "copy", label: "Tagline & about" },
  { value: "service", label: "Services" },
  { value: "faq", label: "FAQ" },
  { value: "testimonial", label: "Testimonials" },
  { value: "trust", label: "Trust signals" },
  { value: "photo", label: "Photos" },
];

const CONTACT_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
  { value: "serviceArea", label: "Service area" },
  { value: "openingHours", label: "Opening hours" },
];

const COPY_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "tagline", label: "Tagline" },
  { value: "aboutBlurb", label: "About blurb" },
];

const SERVICE_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "serviceDesc", label: "Short description" },
  { value: "serviceLongDesc", label: "Long description" },
  { value: "servicePricing", label: "Pricing notes" },
  { value: "servicePrice", label: "Price from" },
];

const FAQ_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "faqQuestion", label: "Question" },
  { value: "faqAnswer", label: "Answer" },
];

const TESTIMONIAL_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "testimonialQuote", label: "Quote" },
  { value: "testimonialRating", label: "Rating" },
];

const TRUST_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "trustYears", label: "Years experience" },
  { value: "trustAssociations", label: "Associations" },
  { value: "trustAwards", label: "Awards" },
];

const PHOTO_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "photoLogo", label: "Logo" },
  { value: "photoHero", label: "Hero image" },
  { value: "photoAbout", label: "About photo" },
  { value: "photoService", label: "Service photo" },
  { value: "photoGallery", label: "Gallery" },
  { value: "photoBackground", label: "Background" },
];

const PHOTO_SLOT_MAP: Record<string, string> = {
  photoLogo: "logo",
  photoHero: "hero",
  photoAbout: "about",
  photoService: "service",
  photoGallery: "gallery",
  photoBackground: "background",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-colors ${active ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-700 hover:border-navy-400"}`}
    >
      {label}
    </button>
  );
}

function ReviewQuickEditForm({
  token,
  siteData,
  submitting: externalSubmitting,
  previewReady,
  onSubmitted,
  onError,
  onSuccess,
  remaining,
}: {
  token: string;
  siteData: ReviewSiteData;
  submitting: boolean;
  previewReady: boolean;
  onSubmitted: (edit: ReviewEdit) => void;
  onError: (msg: string | null) => void;
  onSuccess: (msg: string) => void;
  remaining: number;
}) {
  const [category, setCategory] = useState<QuickEditCategory>("contact");
  const [field, setField] = useState<QuickEditField>("phone");
  const hasLocations = siteData.locations.length > 0;
  const [locationIdx, setLocationIdx] = useState(-1);
  const [itemIdx, setItemIdx] = useState(0);
  const [newValue, setNewValue] = useState("");
  const [pending, setPending] = useState(false);
  const [hours, setHours] = useState<Record<string, { open: boolean; from: string; to: string }>>(() =>
    Object.fromEntries(DAYS.map((d) => [d, { open: true, from: "09:00", to: "17:00" }])),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  function selectCategory(cat: QuickEditCategory) {
    setCategory(cat);
    setItemIdx(0);
    setNewValue("");
    setSelectedFile(null);
    setUploadedUrl(null);
    onError(null);
    if (cat === "contact") setField("phone");
    else if (cat === "copy") setField("tagline");
    else if (cat === "service") setField("serviceDesc");
    else if (cat === "faq") setField("faqAnswer");
    else if (cat === "testimonial") setField("testimonialQuote");
    else if (cat === "trust") setField("trustYears");
    else if (cat === "photo") setField("photoHero");
  }

  function selectField(f: QuickEditField) {
    setField(f);
    setNewValue("");
    setSelectedFile(null);
    setUploadedUrl(null);
    onError(null);
  }

  const currentSource = locationIdx < 0 ? siteData : siteData.locations[locationIdx];

  const currentVal = (() => {
    if (category === "contact" && currentSource) {
      if (field === "phone") return currentSource.phoneDisplay;
      if (field === "email") return currentSource.publicEmail;
      if (field === "address") return currentSource.address;
      if (field === "serviceArea") return "serviceArea" in currentSource ? (currentSource as ReviewSiteData).serviceArea : "";
    }
    if (category === "copy") {
      if (field === "tagline") return siteData.tagline;
      if (field === "aboutBlurb") return siteData.aboutBlurb;
    }
    if (category === "service") {
      const svc = siteData.services[itemIdx];
      if (!svc) return "";
      if (field === "serviceDesc") return svc.description;
      if (field === "serviceLongDesc") return svc.longDescription;
      if (field === "servicePricing") return svc.pricingNotes;
      if (field === "servicePrice") return svc.priceFrom != null ? String(svc.priceFrom) : "";
    }
    if (category === "faq") {
      const faqItem = siteData.faq[itemIdx];
      if (!faqItem) return "";
      if (field === "faqQuestion") return faqItem.question;
      if (field === "faqAnswer") return faqItem.answer;
    }
    if (category === "testimonial") {
      const t = siteData.testimonials[itemIdx];
      if (!t) return "";
      if (field === "testimonialQuote") return t.quote;
      if (field === "testimonialRating") return t.rating != null ? String(t.rating) : "";
    }
    if (category === "trust") {
      if (field === "trustYears") return siteData.trust.yearsExperience != null ? String(siteData.trust.yearsExperience) : "";
      if (field === "trustAssociations") return siteData.trust.associations;
      if (field === "trustAwards") return siteData.trust.awards;
    }
    return "";
  })();

  useEffect(() => {
    if (field === "openingHours" && currentSource?.openingHours) {
      const h: Record<string, { open: boolean; from: string; to: string }> = {};
      for (const d of DAYS) {
        const existing = currentSource.openingHours[d];
        h[d] = existing
          ? { open: existing.open, from: existing.from ?? "09:00", to: existing.to ?? "17:00" }
          : { open: false, from: "09:00", to: "17:00" };
      }
      setHours(h);
    }
  }, [field, locationIdx, currentSource]);

  function buildMessage(): string {
    const loc = locationIdx >= 0 && category === "contact" ? siteData.locations[locationIdx]?.name : null;
    const prefix = loc ? `For ${loc}: ` : "";

    if (field === "phone") return `${prefix}Change phone number to: ${newValue}`;
    if (field === "email") return `${prefix}Change email address to: ${newValue}`;
    if (field === "address") return `${prefix}Change address to: "${newValue}"`;
    if (field === "serviceArea") return `Change service area to: "${newValue}"`;
    if (field === "openingHours") {
      const parts = DAYS.map((d) => {
        const h = hours[d]!;
        return `${d}: ${h.open ? `${h.from}–${h.to}` : "Closed"}`;
      });
      return `${prefix}Change opening hours to:\n${parts.join("\n")}`;
    }
    if (field === "tagline") return `Change tagline to: "${newValue}"`;
    if (field === "aboutBlurb") return `Change about blurb to: "${newValue}"`;

    if (category === "service") {
      const svc = siteData.services[itemIdx];
      const svcName = svc?.name ?? "Unknown";
      if (field === "serviceDesc") return `For service "${svcName}": Change short description to: "${newValue}"`;
      if (field === "serviceLongDesc") return `For service "${svcName}": Change long description to: "${newValue}"`;
      if (field === "servicePricing") return `For service "${svcName}": Change pricing notes to: "${newValue}"`;
      if (field === "servicePrice") return `For service "${svcName}": Change price from to: ${newValue}`;
    }
    if (category === "faq") {
      const faqItem = siteData.faq[itemIdx];
      const q = faqItem?.question ?? "Unknown";
      if (field === "faqQuestion") return `For FAQ "${q}": Change question to: "${newValue}"`;
      if (field === "faqAnswer") return `For FAQ "${q}": Change answer to: "${newValue}"`;
    }
    if (category === "testimonial") {
      const t = siteData.testimonials[itemIdx];
      const tName = t?.name ?? "Unknown";
      if (field === "testimonialQuote") return `For testimonial by "${tName}": Change quote to: "${newValue}"`;
      if (field === "testimonialRating") return `For testimonial by "${tName}": Change rating to: ${newValue}`;
    }
    if (field === "trustYears") return `Change years of experience to: ${newValue}`;
    if (field === "trustAssociations") return `Change associations/memberships to: "${newValue}"`;
    if (field === "trustAwards") return `Change awards/accreditations to: "${newValue}"`;
    if (category === "photo" && uploadedUrl) {
      const slotLabel = PHOTO_FIELDS.find((f) => f.value === field)?.label ?? field;
      const svcNote = field === "photoService" && siteData.services[itemIdx]
        ? ` for service "${siteData.services[itemIdx]!.name}"`
        : "";
      return `Replace ${slotLabel}${svcNote} with uploaded image: ${uploadedUrl}`;
    }
    return newValue;
  }

  const needsTextarea = field === "aboutBlurb" || field === "serviceLongDesc" || field === "serviceDesc" || field === "testimonialQuote";
  const isPhotoField = category === "photo";
  const noValueNeeded = field === "openingHours" || isPhotoField;

  async function handleSubmit() {
    onError(null);
    if (isPhotoField) {
      if (!selectedFile && !uploadedUrl) {
        onError("Please select an image file.");
        return;
      }
    } else if (!noValueNeeded && newValue.trim().length === 0) {
      onError("Please enter a new value.");
      return;
    }
    if (remaining <= 0) {
      onError("No edits remaining.");
      return;
    }

    setPending(true);
    try {
      // Photo: upload to R2 first, then submit the message with the URL
      if (isPhotoField && selectedFile && !uploadedUrl) {
        setUploading(true);
        const form = new FormData();
        form.append("token", token);
        form.append("kind", PHOTO_SLOT_MAP[field] ?? "gallery");
        form.append("file", selectedFile);
        if (field === "photoService" && siteData.services[itemIdx]) {
          form.append("serviceName", siteData.services[itemIdx]!.name);
        }
        const upRes = await fetch("/api/onboarding/upload", {
          method: "POST",
          body: form,
        });
        const upJson = (await upRes.json()) as { success?: boolean; error?: string; asset?: { key: string } };
        setUploading(false);
        if (!upRes.ok || !upJson.success) {
          onError(upJson.error ?? "Upload failed. Try again.");
          return;
        }
        setUploadedUrl(upJson.asset?.key ?? "uploaded");
      }

      const msg = buildMessage();
      const res = await fetch("/api/onboarding/review-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: msg }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        edit?: ReviewEdit;
        remaining?: number;
        error?: string;
      };
      if (!res.ok || !json.success || !json.edit) {
        onError(json.error ?? "Couldn't submit. Try again.");
        return;
      }
      onSubmitted(json.edit);
      setNewValue("");
      setSelectedFile(null);
      setUploadedUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const r = json.remaining ?? remaining - 1;
      onSuccess(`Got it. ${r} edit${r === 1 ? "" : "s"} remaining.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
      setUploading(false);
    }
  }

  const busy = pending || externalSubmitting || uploading;

  const fieldPills = category === "contact" ? CONTACT_FIELDS
    : category === "copy" ? COPY_FIELDS
    : category === "service" ? SERVICE_FIELDS
    : category === "faq" ? FAQ_FIELDS
    : category === "testimonial" ? TESTIMONIAL_FIELDS
    : category === "photo" ? PHOTO_FIELDS
    : TRUST_FIELDS;

  const items = category === "service" ? siteData.services
    : category === "faq" ? siteData.faq
    : category === "testimonial" ? siteData.testimonials
    : null;

  const itemLabel = (idx: number) => {
    if (category === "service") return siteData.services[idx]?.name ?? `Service ${idx + 1}`;
    if (category === "faq") return siteData.faq[idx]?.question ? truncate(siteData.faq[idx]!.question, 30) : `FAQ ${idx + 1}`;
    if (category === "testimonial") return siteData.testimonials[idx]?.name ?? `Testimonial ${idx + 1}`;
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Category picker */}
      <div>
        <span className="block text-sm font-semibold text-navy-900">Category</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Pill key={c.value} label={c.label} active={category === c.value} onClick={() => selectCategory(c.value)} />
          ))}
        </div>
      </div>

      {/* Item picker (services, FAQ, testimonials) */}
      {items && items.length > 0 && (
        <div>
          <span className="block text-sm font-semibold text-navy-900">
            Which {category === "service" ? "service" : category === "faq" ? "FAQ" : "testimonial"}?
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {items.map((_, i) => (
              <Pill key={i} label={itemLabel(i)} active={itemIdx === i} onClick={() => { setItemIdx(i); setNewValue(""); }} />
            ))}
          </div>
        </div>
      )}
      {items && items.length === 0 && (
        <p className="text-sm text-navy-500">
          No {category === "service" ? "services" : category === "faq" ? "FAQs" : "testimonials"} found in your site content. Add them in Step 4 first.
        </p>
      )}

      {/* Field picker */}
      {(!items || items.length > 0) && (
        <div>
          <span className="block text-sm font-semibold text-navy-900">What to change</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {fieldPills.map((f) => (
              <Pill key={f.value} label={f.label} active={field === f.value} onClick={() => selectField(f.value)} />
            ))}
          </div>
        </div>
      )}

      {/* Location picker (contact category only) */}
      {category === "contact" && hasLocations && (
        <div>
          <span className="block text-sm font-semibold text-navy-900">Which location?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill label="Main / HQ" active={locationIdx === -1} onClick={() => setLocationIdx(-1)} />
            {siteData.locations.map((loc, i) => (
              <Pill key={loc.name} label={loc.name} active={locationIdx === i} onClick={() => setLocationIdx(i)} />
            ))}
          </div>
        </div>
      )}

      {/* Service picker for photo-service slot */}
      {category === "photo" && field === "photoService" && siteData.services.length > 0 && (
        <div>
          <span className="block text-sm font-semibold text-navy-900">Which service?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {siteData.services.map((s, i) => (
              <Pill key={i} label={s.name} active={itemIdx === i} onClick={() => { setItemIdx(i); setSelectedFile(null); setUploadedUrl(null); }} />
            ))}
          </div>
        </div>
      )}
      {category === "photo" && field === "photoService" && siteData.services.length === 0 && (
        <p className="text-sm text-navy-500">No services found. Add them in Step 4 first.</p>
      )}

      {/* Value input */}
      {(!items || items.length > 0) && (
        <>
          {isPhotoField ? (
            <div className="space-y-3">
              {field === "photoService" && siteData.services.length === 0 ? null : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSelectedFile(f);
                      setUploadedUrl(null);
                      onError(null);
                      if (f && f.size > 5 * 1024 * 1024) {
                        onError("Image too large — max 5 MB. Compress or resize it first.");
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }
                    }}
                    className="w-full text-sm text-navy-700 file:mr-3 file:rounded-full file:border-2 file:border-navy-200 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-navy-700 hover:file:border-navy-400"
                  />
                  {selectedFile && (
                    <p className="text-xs text-navy-500">
                      Selected: <span className="font-medium text-navy-700">{selectedFile.name}</span> ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                  {uploading && <p className="text-xs text-navy-500">Uploading…</p>}
                </>
              )}
            </div>
          ) : field === "openingHours" ? (
            <div className="space-y-2">
              {DAYS.map((d) => (
                <div key={d} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium text-navy-700">{d}</span>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={hours[d]?.open ?? false}
                      onChange={(e) => setHours((prev) => ({ ...prev, [d]: { ...prev[d]!, open: e.target.checked } }))}
                      className="h-4 w-4 rounded border-navy-300"
                    />
                    <span className="text-xs text-navy-600">Open</span>
                  </label>
                  {hours[d]?.open && (
                    <>
                      <input
                        type="time"
                        value={hours[d]?.from ?? "09:00"}
                        onChange={(e) => setHours((prev) => ({ ...prev, [d]: { ...prev[d]!, from: e.target.value } }))}
                        className="rounded-lg border border-navy-200 px-2 py-1 text-sm"
                      />
                      <span className="text-navy-400">to</span>
                      <input
                        type="time"
                        value={hours[d]?.to ?? "17:00"}
                        onChange={(e) => setHours((prev) => ({ ...prev, [d]: { ...prev[d]!, to: e.target.value } }))}
                        className="rounded-lg border border-navy-200 px-2 py-1 text-sm"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>
              {currentVal && (
                <p className="mb-2 text-xs text-navy-500">
                  Currently: <span className="font-medium text-navy-700">{needsTextarea ? truncate(currentVal, 120) : currentVal}</span>
                </p>
              )}
              {needsTextarea ? (
                <textarea
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  disabled={busy}
                  rows={4}
                  maxLength={2000}
                  placeholder="Enter new text…"
                  className="w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
                />
              ) : (
                <input
                  type={field === "email" ? "email" : field === "servicePrice" || field === "trustYears" || field === "testimonialRating" ? "number" : "text"}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  disabled={busy}
                  placeholder={
                    field === "phone" ? "07700 900 000"
                      : field === "email" ? "hello@example.com"
                      : field === "address" ? "123 High Street, Oxford, OX1 1AA"
                      : field === "servicePrice" ? "250"
                      : field === "trustYears" ? "10"
                      : field === "testimonialRating" ? "5"
                      : "Enter new value…"
                  }
                  min={field === "testimonialRating" ? 1 : undefined}
                  max={field === "testimonialRating" ? 5 : undefined}
                  maxLength={field === "phone" ? 30 : field === "email" ? 254 : 500}
                  className="w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
                />
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || (isPhotoField ? !selectedFile && !uploadedUrl : !noValueNeeded && newValue.trim().length === 0) || !previewReady}
            className="btn-primary"
            title={!previewReady ? "Your preview isn't ready yet — once it is, you'll be able to submit edits here." : undefined}
          >
            {uploading ? "Uploading…" : busy ? "Submitting…" : isPhotoField ? "Upload & submit" : "Submit change"}
          </button>
          {!previewReady && (
            <p className="text-xs text-navy-500">
              The submit button unlocks once your preview is ready.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
