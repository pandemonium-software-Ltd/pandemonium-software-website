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

import { useState } from "react";
import {
  STEP_NUMBER,
  type OnboardingData,
  type StepDef,
  type StepId,
} from "@/lib/onboarding";
import Step1Cloudflare from "@/components/onboarding/Step1Cloudflare";
import StepPlaceholder from "@/components/onboarding/StepPlaceholder";

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
  hubComplete: boolean;
  /** Ops email customers invite as a Cloudflare / Resend team member. */
  benEmail: string;
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
    hubComplete,
    benEmail,
  } = props;

  const [currentStepId, setCurrentStepId] = useState<StepId>(initialStepId);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [doneFlags, setDoneFlags] = useState<Record<StepId, boolean>>(
    props.doneFlags,
  );
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [hubDone, setHubDone] = useState<boolean>(hubComplete);

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
        setHubDone(true);
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
    return callApi(stepId, patch, true);
  }

  const greetingFirstName = (prospectName.split(/\s+/)[0] || "there").trim();

  return (
    <>
      <section className="bg-cream-100/60 pb-6 pt-12 md:pb-8 md:pt-16">
        <div className="container-content max-w-5xl">
          <span className="eyebrow">Onboarding Hub</span>
          <h1 className="heading-1 mt-2">
            Welcome, {greetingFirstName} — let&apos;s get you live.
          </h1>
          <p className="prose-body mt-4 max-w-2xl">
            A short guided checklist. Save your progress any time and come
            back later.
            {businessName ? ` Setting up ${businessName}.` : ""}
          </p>

          {hubDone && (
            <div
              role="status"
              className="mt-6 rounded-2xl border-2 border-green-600 bg-green-50 p-4 text-sm text-green-800"
            >
              <strong>All set.</strong> Your handover checklist is complete.
              I&apos;ll start your build and email you when the preview is
              ready.
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
                <StepRenderer
                  step={currentStep}
                  data={data}
                  doneFlags={doneFlags}
                  token={token}
                  benEmail={benEmail}
                  readOnly={hubDone}
                  savePartial={savePartial}
                  markDone={markDone}
                />
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
  benEmail,
  readOnly,
  savePartial,
  markDone,
}: {
  step: StepDef;
  data: OnboardingData;
  doneFlags: Record<StepId, boolean>;
  token: string;
  benEmail: string;
  readOnly: boolean;
  savePartial: (
    stepId: StepId,
    patch: Record<string, unknown>,
  ) => Promise<boolean>;
  markDone: (
    stepId: StepId,
    patch: Record<string, unknown>,
  ) => Promise<boolean>;
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
        <StepPlaceholder
          title={step.title}
          arrivingIn="next update"
          summary="Register or connect your domain, and (if you bought Newsletter or Enquiry) add the sender DNS records — all in one paste."
        />
      );
    case "tools":
      return (
        <StepPlaceholder
          title={step.title}
          arrivingIn="next update"
          summary="Set up your booking page (Cal.com) and / or your Google Business Profile."
        />
      );
    case "assets":
      return (
        <StepPlaceholder
          title={step.title}
          arrivingIn="next update"
          summary="Upload your logo and 5–10 photos. Drag-and-drop, with previews."
        />
      );
    case "review":
      return (
        <StepPlaceholder
          title={step.title}
          arrivingIn="next update"
          summary="Walk through a private preview, leave any change requests, pick a go-live date and sign off."
        />
      );
  }
  // Compiler exhaustiveness check.
  const _exhaustive: never = step.id;
  void _exhaustive;
  void STEP_NUMBER; // keep the import used
  return null;
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
