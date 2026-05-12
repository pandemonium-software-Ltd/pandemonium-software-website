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

import { useState } from "react";
import { MAX_REVIEW_EDITS, type ReviewEdit } from "@/lib/onboarding";
import PreviewFrame from "@/components/PreviewFrame";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  token: string;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

export default function Step5Review({
  data,
  done,
  readOnly,
  token,
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
  const remaining = MAX_REVIEW_EDITS - edits.length;
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
        `You've used all ${MAX_REVIEW_EDITS} pre-launch edits.`,
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
      setEdits((prev) => [...prev, json.edit!]);
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
          to {MAX_REVIEW_EDITS} rounds of edits between the two.
        </p>
      </header>

      {/* ---------- A. Preview ---------- */}
      <section className="mt-7">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          A. Preview your site
        </h3>

        {phase === 1 && (
          <div className="mt-4 space-y-4">
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
          <EditCounter used={edits.length} max={MAX_REVIEW_EDITS} />
        </div>
        <p className="mt-2 text-sm text-navy-700">
          You get up to <strong>{MAX_REVIEW_EDITS} rounds</strong> of
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
          <div className="mt-6">
            <label className="block">
              <span className="block text-sm font-semibold text-navy-900">
                Edit {edits.length + 1} of {MAX_REVIEW_EDITS}
              </span>
              <textarea
                value={editDraft}
                disabled={submittingEdit}
                onChange={(e) => setEditDraft(e.target.value)}
                placeholder={
                  "On the homepage, in the services section, swap the kitchen photo for the new one I uploaded yesterday. Also, in the About paragraph, change \"5 years\" to \"7 years\" — I just hit 7."
                }
                rows={6}
                maxLength={2000}
                className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900"
              />
            </label>
            {editError && (
              <p className="mt-2 text-sm text-ember-700" role="alert">
                {editError}
              </p>
            )}
            {editSuccess && (
              <p className="mt-2 text-sm text-green-700" role="status">
                {editSuccess}
              </p>
            )}
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
        )}

        {!disabled && remaining === 0 && edits.length > 0 && (
          <div className="mt-6 rounded-xl border-2 border-navy-200 bg-cream-50 p-5 text-sm leading-relaxed text-navy-700">
            <p className="font-semibold text-navy-900">
              All {MAX_REVIEW_EDITS} edits used.
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

      {/* Cowork classification panel (when present) */}
      {ext.coworkClassification && (
        <div className="mt-3 rounded-lg border-l-2 border-amber-300 bg-white p-3 text-xs">
          <p className="font-semibold uppercase tracking-wider text-amber-900">
            What I (Cowork) did
            {ext.coworkConfidence !== undefined && (
              <span className="ml-2 font-mono text-[10px] text-amber-700">
                ({ext.coworkClassification},{" "}
                {(ext.coworkConfidence * 100).toFixed(0)}% confidence)
              </span>
            )}
          </p>
          {ext.coworkReasoning && (
            <p className="mt-1 text-amber-900">{ext.coworkReasoning}</p>
          )}
          {patches.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="font-semibold text-amber-900">
                {patches.length === 1 ? "Change applied:" : "Changes applied:"}
              </p>
              <ul className="ml-3 list-disc space-y-0.5 text-navy-800">
                {patches.map((p, i) => (
                  <li key={i}>
                    <span className="font-mono text-[11px]">{p.target}</span>
                    {": "}
                    <span className="break-all">{String(p.newValue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ext.coworkPatchAppliedAt && (
            <p className="mt-1.5 text-[10px] text-amber-700">
              Applied {formatRelative(ext.coworkPatchAppliedAt)}
            </p>
          )}
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
