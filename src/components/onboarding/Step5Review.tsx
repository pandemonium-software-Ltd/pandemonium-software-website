"use client";

// Onboarding Hub — Step 5: Review & launch.
//
// Final pre-launch step. Three sub-sections:
//
//   A. Preview your site
//      - If Cowork has set previewUrl: iframe + open-in-new-tab link
//      - If not: a "preview being built" placeholder card
//
//   B. Request edits (max MAX_REVIEW_EDITS = 3)
//      - Counter: "X of 3 edits remaining" with visual pill row
//      - Scope guardrails callout: in-scope vs out-of-scope
//      - Structured-feedback template + 2 good examples
//      - Textarea + Submit (disabled if 0 remaining or not signed-off
//        path)
//      - History list of submitted edits with status pills
//
//   C. Go-live date + final sign-off
//      - HTML date picker (min: today)
//      - "I'm happy to launch on this date" checkbox
//      - Mark step done is gated by both
//
// The cap on edits is the scope-creep guardrail. New pages, new
// features and full redesigns are quoted separately under Terms §10.
// Submissions go to a dedicated /api/onboarding/review-edit POST
// endpoint that enforces the cap server-side too.

import { useState } from "react";
import { MAX_REVIEW_EDITS, type ReviewEdit } from "@/lib/onboarding";

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
  const initialEdits = (Array.isArray(data.edits) ? data.edits : []) as ReviewEdit[];
  const initialGoLive =
    typeof data.goLiveDate === "string" ? data.goLiveDate : "";
  const initialSignOff = data.finalSignOff === true;
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [edits, setEdits] = useState<ReviewEdit[]>(initialEdits);
  const [goLiveDate, setGoLiveDate] = useState(initialGoLive);
  const [signOff, setSignOff] = useState(initialSignOff);
  const [notes, setNotes] = useState(initialNotes);

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
          Last step. Have a proper look at your preview, request up to{" "}
          {MAX_REVIEW_EDITS} rounds of revisions if anything needs
          tweaking, then pick a launch date and sign off. Marking this
          step done is the trigger for me to push your site live on
          the date you chose.
        </p>
      </header>

      {/* ---------- A. Preview ---------- */}
      <section className="mt-7">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          A. Preview your site
        </h3>
        {initialPreviewUrl ? (
          <div className="mt-4">
            <p className="text-sm text-navy-700">
              Live preview at{" "}
              <a
                href={initialPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                {initialPreviewUrl}
              </a>
              . Look at it on your phone too — we get most of our
              traffic from mobile.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border-2 border-navy-100">
              <iframe
                src={initialPreviewUrl}
                title="Your site preview"
                className="block h-[600px] w-full bg-cream-50"
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-navy-200 bg-cream-50 p-6 text-sm leading-relaxed text-navy-700">
            <p className="font-semibold text-navy-900">
              Your preview is being built.
            </p>
            <p className="mt-2">
              I&apos;m putting together your site from everything you
              gave me in Steps 1 to 4. You&apos;ll get an email when
              the preview is ready (typically within 5 working days
              after you finished onboarding) — refresh this page and
              you&apos;ll see it embedded here, plus a link to open
              it on your phone. The Edits section below unlocks at
              the same time.
            </p>
          </div>
        )}
      </section>

      {/* ---------- B. Request edits ---------- */}
      <section className="mt-9">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-serif text-lg font-semibold text-navy-900">
            B. Request edits
          </h3>
          <EditCounter used={edits.length} max={MAX_REVIEW_EDITS} />
        </div>
        <p className="mt-2 text-sm text-navy-700">
          You get up to <strong>{MAX_REVIEW_EDITS} rounds</strong> of
          revisions before launch. After that, post-launch tweaks
          go through your monthly allowance (3 change requests
          included, one item per request) or get quoted separately
          if they&apos;re bigger. The cap keeps us both honest about
          scope.
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
              monthly allowance (3 change requests included, one
              item per request) or gets quoted separately if it&apos;s
              bigger. Email me from your{" "}
              <a href="#" className="link">
                Account dashboard
              </a>{" "}
              once you&apos;re live and we&apos;ll work through it.
            </p>
          </div>
        )}

        {/* History list */}
        {edits.length > 0 && (
          <div className="mt-7 border-t border-navy-100 pt-6">
            <h4 className="font-serif text-base font-semibold text-navy-900">
              Your edits so far
            </h4>
            <ul className="mt-3 space-y-3">
              {edits.map((e, i) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-navy-100 bg-cream-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-wider text-navy-500">
                      Edit {i + 1} ·{" "}
                      {formatRelative(e.submittedAt)}
                    </span>
                    <EditStatusPill status={e.status} />
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-navy-800">
                    {e.message}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- C. Go-live + sign-off ---------- */}
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
              tweaks (3 change requests/month included, one item per
              request).
            </p>
          </div>
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
                : "Sign off &amp; launch"}
            </button>
          </>
        )}
      </footer>
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
