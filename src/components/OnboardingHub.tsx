"use client";

// Onboarding Hub client shell. Stage 2B Phase H1.
//
// Renders a sidebar of applicable steps, the current step's component,
// and a shared status bar. State is local; persistence is via POST
// /api/onboarding. Each step subcomponent receives:
//
//   - token (for API calls)
//   - data slice (this step's saved fields)
//   - isDone (current done flag)
//   - savePartial(patch) → server save without flipping done
//   - markDone(patch) → server save AND flip done flag
//   - readOnly (true after the hub is complete)
//
// H1 only ships Step 1 (Cloudflare) fully wired. Steps 2-5 render a
// "coming soon" placeholder so the prospect sees the whole journey
// even though the contents will land in H2-H5.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  STEP_IDS,
  STEP_NUMBER,
  type OnboardingData,
  type StepDef,
  type StepId,
} from "@/lib/onboarding";
import Step1Cloudflare from "@/components/onboarding/Step1Cloudflare";
import Step2Domain from "@/components/onboarding/Step2Domain";
import Step3Modules from "@/components/onboarding/Step3Modules";
import Step4Content from "@/components/onboarding/Step4Content";
import Step4Assets from "@/components/onboarding/Step4Assets";
import Step5Review from "@/components/onboarding/Step5Review";
import type { ChangeEligibility } from "@/lib/billing/module-policy";
import type { ModuleChangeLogEntry } from "@/lib/notion-prospects";

export type OnboardingHubProps = {
  token: string;
  prospectName: string;
  businessName: string;
  modules: string[];
  foundingMember: boolean;
  steps: StepDef[];
  doneFlags: Record<StepId, boolean>;
  initialStepId: StepId;
  initialData: OnboardingData;
  /** True when the customer's prospect status is past the mutable
   *  range (Paid / Onboarding Started). Once locked, the Hub is a
   *  read-only archive — banner shown, all step inputs disabled,
   *  Save / Mark Done / Update buttons hidden. Customer is pointed
   *  at /account/[token] for any further changes. */
  hubLocked: boolean;
  /** Ops email customers invite as a Cloudflare / Resend team member. */
  benEmail: string;
  /** Public URL base for R2 brand-asset thumbnails. Empty string =
   *  thumbnails fall back to filename tiles in Step 4. */
  r2PublicUrlBase: string;
  /** Top-level prospect fields the hub shows beyond the per-step
   *  data slices. Threaded through to the relevant step component. */
  customerConfirmedNameserversAt?: string;
  /** Module-change eligibility — derived from canChangeModules() in
   *  the page. Step 3 uses this to render the re-selector button
   *  enabled / disabled with the right messaging. */
  moduleChangeEligibility: ChangeEligibility;
  /** Latest pending-stripe entry from the change log, if any.
   *  Drives the "your change is being processed" UI in Step 3. */
  pendingModuleChange: ModuleChangeLogEntry | null;
  /** Canonical service list for the Hub. Content-step services
   *  preferred (post-edit canonical); Phase 3 intake as the
   *  fallback seed. Threaded to BOTH Step 4 Content (as initial
   *  list) AND Step 5 Brand Assets (as photo-slot list). Empty
   *  if the customer hasn't done Phase 3 OR added services in
   *  Step 4 yet. The variable name is historical — see page.tsx
   *  for the derivation logic. */
  phase3Services: ReadonlyArray<{ name: string }>;
  /** Phase 3 intake seeds — used by Step 4 Site Content to
   *  pre-fill blank sections (services, testimonials, trust,
   *  business details) the FIRST time the customer touches them.
   *  Once a content-step value exists, it overrides the seed. */
  phase3Seeds: import("@/app/onboarding/[token]/page").Phase3Seeds;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export default function OnboardingHub(props: OnboardingHubProps) {
  const {
    token,
    prospectName,
    businessName,
    steps,
    initialStepId,
    initialData,
    hubLocked: initialHubLocked,
    benEmail,
    r2PublicUrlBase,
  } = props;

  const [currentStepId, setCurrentStepId] = useState<StepId>(initialStepId);

  // Honour `?step=<id>` query param so dashboard deep-links open
  // straight on the requested step. Wrapped in useEffect to avoid
  // hydration mismatch (useSearchParams returns null during SSR).
  // Falls back silently if the param is missing or invalid — the
  // server-side `initialStepId` still wins for direct hub visits.
  const searchParams = useSearchParams();
  useEffect(() => {
    const requested = searchParams?.get("step");
    if (
      requested &&
      (STEP_IDS as readonly string[]).includes(requested) &&
      requested !== currentStepId
    ) {
      // Only respect deep-link IF the requested step is in the
      // applicable set — non-applicable steps (e.g. "tools" without
      // a relevant module) shouldn't be deep-linkable.
      const isApplicable = props.steps.some(
        (s) => s.id === requested && s.applicable,
      );
      if (isApplicable) setCurrentStepId(requested as StepId);
    }
    // Only fire when the searchParams change; intentionally NOT
    // depending on currentStepId so manual nav doesn't re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [doneFlags, setDoneFlags] = useState<Record<StepId, boolean>>(
    props.doneFlags,
  );
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  // `locked` is the Hub-level read-only state. Initial value comes
  // from the server (true if status is past Onboarding Started).
  // Flipped true mid-session when an API call returns
  // hubComplete:true (the customer just signed off Step 5). Never
  // flipped back — once locked, only a status change in Notion
  // un-locks via a fresh page load.
  const [locked, setLocked] = useState<boolean>(initialHubLocked);

  const applicable = steps.filter((s) => s.applicable);
  const currentStep = steps.find((s) => s.id === currentStepId);

  // Shared API call. Returns true on success, false on error.
  async function callApi(
    stepId: StepId,
    patch: Record<string, unknown>,
    markDone: boolean,
  ): Promise<boolean> {
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, stepId, patch, markDone }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        hubComplete?: boolean;
      };
      if (!res.ok || !json.success) {
        setSaveState({
          kind: "error",
          message: json.error ?? "Save failed. Please try again.",
        });
        return false;
      }
      // Optimistic local merge.
      setData((prev) => ({
        ...prev,
        [stepId]: { ...((prev[stepId] ?? {}) as object), ...patch },
      }));
      if (markDone) {
        setDoneFlags((prev) => ({ ...prev, [stepId]: true }));
      }
      if (json.hubComplete) {
        setLocked(true);
      }
      setSaveState({ kind: "saved", at: Date.now() });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveState({ kind: "error", message: msg });
      return false;
    }
  }

  function savePartial(stepId: StepId, patch: Record<string, unknown>) {
    return callApi(stepId, patch, false);
  }
  function markDone(stepId: StepId, patch: Record<string, unknown>) {
    // After successful Mark Done, auto-advance to the next applicable
    // step in the linear order. Customer can still jump anywhere via
    // the side nav OR use the "Back" button on the next step. If
    // we're on the last step (review), stay put — they're done.
    return callApi(stepId, patch, true).then((success) => {
      if (success) {
        const currentIdx = applicable.findIndex((s) => s.id === stepId);
        if (currentIdx >= 0 && currentIdx < applicable.length - 1) {
          const nextStep = applicable[currentIdx + 1];
          setCurrentStepId(nextStep.id);
          if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
      }
      return success;
    });
  }

  function goToStep(stepId: StepId) {
    setCurrentStepId(stepId);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const greetingFirstName = (prospectName.split(/\s+/)[0] || "there").trim();

  return (
    <>
      <section className="bg-cream-100/60 pb-6 pt-12 md:pb-8 md:pt-16">
        <div className="container-content max-w-5xl">
          {/* Always-visible dashboard escape hatch. Customers
              navigate to the Hub via the dashboard's quick-link
              card — this gives them a one-click way back without
              relying on browser history. Placed BEFORE the eyebrow
              so it reads like a breadcrumb. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <a
              href={`/account/${token}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-500 transition-colors hover:text-navy-900"
            >
              <span aria-hidden="true">←</span>
              Back to your dashboard
            </a>
            <a
              href={`/account/${token}/submissions`}
              className="text-xs font-medium text-navy-500 underline decoration-dotted underline-offset-2 transition-colors hover:text-navy-900"
            >
              View what you&apos;ve submitted
            </a>
          </div>
          <span className="eyebrow">Onboarding Hub</span>
          <h1 className="heading-1 mt-2">
            Welcome, {greetingFirstName} — let&apos;s get you live.
          </h1>
          <p className="prose-body mt-4 max-w-2xl">
            A short guided checklist. Save your progress any time and come
            back later.
            {businessName ? ` Setting up ${businessName}.` : ""}
          </p>

          {locked && (
            <div
              role="status"
              className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-green-600 bg-green-50 p-5 text-sm text-green-800"
            >
              <div className="min-w-0">
                <strong>Hub locked.</strong> You&apos;ve signed off and
                everything below is read-only. For any change
                requests from now on, use the &ldquo;Need a
                change?&rdquo; form on your account dashboard.
              </div>
              <a
                href={`/account/${token}`}
                className="inline-flex flex-none items-center gap-1.5 rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700"
              >
                Open your account dashboard →
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="pb-24 pt-6">
        <div className="container-content max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
            {/* Step nav */}
            <nav
              aria-label="Onboarding steps"
              className="lg:sticky lg:top-24 lg:self-start"
            >
              <ol className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:gap-1.5">
                {applicable.map((step) => {
                  const done = doneFlags[step.id];
                  const isCurrent = step.id === currentStepId;
                  return (
                    <li key={step.id} className="flex-none lg:flex-auto">
                      <button
                        type="button"
                        onClick={() => setCurrentStepId(step.id)}
                        className={[
                          "flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors",
                          isCurrent
                            ? "border-navy-900 bg-white shadow-card"
                            : "border-transparent bg-white/60 hover:border-navy-200",
                        ].join(" ")}
                      >
                        <StepBadge
                          number={step.displayIndex}
                          total={step.displayTotal}
                          done={done}
                          current={isCurrent}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] uppercase tracking-wider text-navy-500">
                            Step {step.displayIndex} of {step.displayTotal}
                          </span>
                          <span className="block font-serif text-base font-semibold text-navy-900">
                            {step.title}
                          </span>
                          <span className="mt-0.5 hidden text-xs text-navy-600 lg:block">
                            {step.shortBlurb}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Active step */}
            <div className="min-w-0">
              <SaveStateBar state={saveState} />
              {currentStep && (
                <>
                  <StepNav
                    applicable={applicable}
                    currentStepId={currentStepId}
                    locked={locked}
                    goToStep={goToStep}
                  />
                  {/* Per-step lock banner — shown when the customer
                      has marked THIS step done but the hub overall
                      is still mutable. Hub-wide lock (post Step 5
                      submission) has its own messaging in the
                      individual step components, so we suppress
                      this banner in that case.
                      Exempt steps (no banner, no lock):
                        - "review" — pre-launch revisions inbox
                        - "assets" — brand assets stay editable so
                          customers can swap a logo/photo any time
                          and trigger a rebuild via a Step 5 edit. */}
                  {!locked &&
                    doneFlags[currentStepId] &&
                    currentStepId !== "review" &&
                    currentStepId !== "assets" && (
                    <div className="mb-5 rounded-2xl border-l-4 border-green-400 bg-green-50 p-4">
                      <p className="flex items-center gap-2 font-semibold text-green-900">
                        <span
                          aria-hidden="true"
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <path
                              d="M3 8l3 3 7-7"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        Step complete — locked
                      </p>
                      <p className="mt-1.5 text-sm text-green-900">
                        Your answers are saved and this step is now
                        read-only. Need to change something? Email me
                        at{" "}
                        <a
                          href={`mailto:${benEmail}?subject=${encodeURIComponent(
                            `Unlock onboarding step: ${currentStep.title}`,
                          )}`}
                          className="underline decoration-green-700 underline-offset-2 hover:text-green-700"
                        >
                          {benEmail}
                        </a>{" "}
                        and I&apos;ll unlock it so you can edit.
                      </p>
                    </div>
                  )}
                  <StepRenderer
                    step={currentStep}
                    data={data}
                    doneFlags={doneFlags}
                    token={token}
                    benEmail={benEmail}
                    r2PublicUrlBase={r2PublicUrlBase}
                    modules={props.modules}
                    foundingMember={props.foundingMember}
                    // Step is read-only when EITHER the hub is locked
                    // (post Step 5 submission) OR this individual
                    // step is marked done — UNLESS the step is one
                    // of the lock-exempt ones ("review" handles its
                    // own gating via /api/onboarding/review-edit;
                    // "assets" stays editable so customers can swap
                    // a logo/photo and trigger a rebuild via a
                    // Step 5 review-edit).
                    readOnly={
                      locked ||
                      (doneFlags[currentStepId] &&
                        currentStepId !== "review" &&
                        currentStepId !== "assets")
                    }
                    savePartial={savePartial}
                    markDone={markDone}
                    customerConfirmedNameserversAt={
                      props.customerConfirmedNameserversAt
                    }
                    moduleChangeEligibility={props.moduleChangeEligibility}
                    pendingModuleChange={props.pendingModuleChange}
                    phase3Services={props.phase3Services}
                    phase3Seeds={props.phase3Seeds}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ---------- Step renderer ----------

function StepRenderer({
  step,
  data,
  doneFlags,
  token,
  benEmail,
  r2PublicUrlBase,
  modules,
  foundingMember,
  readOnly,
  savePartial,
  markDone,
  customerConfirmedNameserversAt,
  moduleChangeEligibility,
  pendingModuleChange,
  phase3Services,
  phase3Seeds,
}: {
  step: StepDef;
  data: OnboardingData;
  doneFlags: Record<StepId, boolean>;
  token: string;
  benEmail: string;
  r2PublicUrlBase: string;
  modules: string[];
  foundingMember: boolean;
  readOnly: boolean;
  savePartial: (
    stepId: StepId,
    patch: Record<string, unknown>,
  ) => Promise<boolean>;
  markDone: (
    stepId: StepId,
    patch: Record<string, unknown>,
  ) => Promise<boolean>;
  customerConfirmedNameserversAt?: string;
  moduleChangeEligibility: ChangeEligibility;
  pendingModuleChange: ModuleChangeLogEntry | null;
  phase3Services: ReadonlyArray<{ name: string }>;
  phase3Seeds: import("@/app/onboarding/[token]/page").Phase3Seeds;
}) {
  const slice = (data[step.id] ?? {}) as Record<string, unknown>;
  const done = doneFlags[step.id];

  switch (step.id) {
    case "cloudflare":
      return (
        <Step1Cloudflare
          data={slice}
          done={done}
          readOnly={readOnly}
          benEmail={benEmail}
          savePartial={(patch) => savePartial("cloudflare", patch)}
          markDone={(patch) => markDone("cloudflare", patch)}
        />
      );
    case "domain":
      return (
        <Step2Domain
          data={slice}
          done={done}
          readOnly={readOnly}
          token={token}
          customerConfirmedNameserversAt={customerConfirmedNameserversAt}
          savePartial={(patch) => savePartial("domain", patch)}
          markDone={(patch) => markDone("domain", patch)}
        />
      );
    case "tools":
      return (
        <Step3Modules
          data={slice}
          done={done}
          readOnly={readOnly}
          benEmail={benEmail}
          modules={modules}
          foundingMember={foundingMember}
          token={token}
          moduleChangeEligibility={moduleChangeEligibility}
          pendingModuleChange={pendingModuleChange}
          savePartial={(patch) => savePartial("tools", patch)}
          markDone={(patch) => markDone("tools", patch)}
        />
      );
    case "content": {
      // Pull the customer's domain so the newsletter section can
      // render a live "From line" preview ("news@yourdomain"). The
      // domain slice is populated by Step 2 — empty string is fine
      // (the form shows a placeholder).
      const customerDomain =
        (data.domain as { domain?: string } | undefined)?.domain ?? "";
      return (
        <Step4Content
          data={slice}
          done={done}
          readOnly={readOnly}
          services={phase3Services}
          phase3Seeds={phase3Seeds}
          modules={modules}
          customerDomain={customerDomain}
          savePartial={(patch) => savePartial("content", patch)}
          markDone={(patch) => markDone("content", patch)}
        />
      );
    }
    case "assets": {
      // Canonical service list for the D. Service photos slot grid:
      // prefer the customer's Site Content edits (renames, deletes,
      // adds), fall back to Phase 3 intake. Mirrors the adapter's
      // merge logic in src/lib/site-generator/adapter.ts so the slot
      // names here match the names that ship to the live site.
      // Without this, renaming "Loft conversion" to "Loft conversions"
      // in Site Content leaves the upload slot stuck at the old name
      // — and any photo uploaded against it would not match a service.
      const contentServicesRaw = (data.content as { services?: unknown })
        ?.services;
      const contentServiceNames = Array.isArray(contentServicesRaw)
        ? contentServicesRaw
            .map((s) => {
              if (!s || typeof s !== "object") return null;
              const name = (s as { serviceName?: unknown }).serviceName;
              return typeof name === "string" && name.trim().length > 0
                ? { name: name.trim() }
                : null;
            })
            .filter((s): s is { name: string } => s !== null)
        : [];
      const canonicalServices =
        contentServiceNames.length > 0
          ? contentServiceNames
          : phase3Services;
      return (
        <Step4Assets
          data={slice}
          done={done}
          readOnly={readOnly}
          r2PublicUrlBase={r2PublicUrlBase}
          token={token}
          services={canonicalServices}
          savePartial={(patch) => savePartial("assets", patch)}
          markDone={(patch) => markDone("assets", patch)}
        />
      );
    }
    case "review":
      return (
        <Step5Review
          data={slice}
          done={done}
          readOnly={readOnly}
          token={token}
          savePartial={(patch) => savePartial("review", patch)}
          markDone={(patch) => markDone("review", patch)}
        />
      );
  }
  // Compiler exhaustiveness check.
  const _exhaustive: never = step.id;
  void _exhaustive;
  void STEP_NUMBER; // keep the import used
  return null;
}

// ---------- Step nav (Back / position / Skip-ahead) ----------
//
// Sits above the step content. Three roles:
//   - "← Back" link to the previous applicable step (hidden on first step)
//   - "Step X of N" position label
//   - "Skip ahead →" link to the next applicable step IF it's done already
//     (lets a customer who's bouncing around see they can move on); hidden
//     when current is the last applicable step or the next step isn't
//     unlocked yet (i.e. customer should mark current done first)
//
// Note: full free navigation lives in the side nav. This component
// is the linear-flow shortcut for customers reading top-to-bottom.

function StepNav({
  applicable,
  currentStepId,
  locked,
  goToStep,
}: {
  applicable: StepDef[];
  currentStepId: StepId;
  locked: boolean;
  goToStep: (stepId: StepId) => void;
}) {
  const currentIdx = applicable.findIndex((s) => s.id === currentStepId);
  if (currentIdx < 0) return null;
  const prev = currentIdx > 0 ? applicable[currentIdx - 1] : null;

  // Hide the whole nav when locked — there's no further work to do
  // and the locked banner is the right call-to-action then.
  if (locked) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 text-sm">
      <div>
        {prev && (
          <button
            type="button"
            onClick={() => goToStep(prev.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-navy-700 transition-colors hover:bg-navy-100 hover:text-navy-900"
          >
            <span aria-hidden="true">←</span>
            <span>Back to {prev.title}</span>
          </button>
        )}
      </div>
      <div className="text-xs uppercase tracking-wider text-navy-500">
        Step {currentIdx + 1} of {applicable.length}
      </div>
    </div>
  );
}

// ---------- Save status bar ----------

function SaveStateBar({ state }: { state: SaveState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "saving") {
    return (
      <p className="mb-4 text-sm text-navy-600" role="status">
        Saving…
      </p>
    );
  }
  if (state.kind === "saved") {
    return (
      <p className="mb-4 text-sm text-green-700" role="status">
        Saved.
      </p>
    );
  }
  return (
    <p className="mb-4 text-sm text-ember-700" role="alert">
      {state.message}
    </p>
  );
}

// ---------- Step badge (number / tick / current dot) ----------

function StepBadge({
  number,
  total: _total,
  done,
  current,
}: {
  number: number;
  total: number;
  done: boolean;
  current: boolean;
}) {
  void _total;
  return (
    <span
      aria-hidden="true"
      className={[
        "flex h-8 w-8 flex-none items-center justify-center rounded-full font-serif text-sm font-semibold",
        done
          ? "bg-green-600 text-white"
          : current
            ? "bg-navy-900 text-white"
            : "bg-white text-navy-700 ring-2 ring-navy-200",
      ].join(" ")}
    >
      {done ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path
            d="M5 12 L10 17 L19 7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        number
      )}
    </span>
  );
}
