// 5-stage journey indicator for the customer dashboard. Shows
// where the customer is in the ModuForge pipeline at a glance:
//
//   Enquiry → Qualification → Quote & Pay → Onboarding Hub → Live
//
// One source of truth per stage: the prospect's current
// `ProspectStatus`. Each stage resolves to one of three states:
//   - "done"     — past this stage, all good
//   - "active"   — currently here (animated dot)
//   - "upcoming" — not yet reached
//
// Status mapping (kept simple — no per-stage sub-statuses):
//
//   Phase 1 Complete / Email Sent              → Enquiry active
//   Phase 2 Complete / Soft Rejected /
//     Flagged for Review / Clarification Req   → Qualification active
//   Phase 2 Accepted                            → Quote active
//   Phase 3 In Progress                         → Quote active (ongoing)
//   Phase 3 Complete                            → Quote active (await pay)
//   Paid                                        → Onboarding Hub active
//   Onboarding Started                          → Onboarding Hub active
//   Onboarding Complete / Build Started         → Live active (building)
//   Live                                        → Live done
//   Cancelled                                   → final stage active w/ tone

import type { ProspectStatus } from "@/lib/notion-prospects";

type StageState = "done" | "active" | "upcoming";

type Stage = {
  key: "enquiry" | "qualify" | "quote" | "hub" | "live";
  label: string;
  /** 1-line caption shown under the label when this stage is the
   *  active one. Lets the tracker double as a "where you are right
   *  now" affordance without needing extra UI. */
  activeHint: string;
  /** Optional link target (depends on token / domain availability —
   *  resolved per-render in `resolveLink`). Stages that don't have
   *  a meaningful customer-side page (enquiry/qualification — those
   *  flows happen entirely via email) return null. */
  linkLabel?: string;
};

const STAGES: Stage[] = [
  {
    key: "enquiry",
    label: "Enquiry",
    activeHint: "Got your details — I'll reply soon with the qualification link.",
    linkLabel: "View what you submitted",
  },
  {
    key: "qualify",
    label: "Qualification",
    activeHint: "Checking compatibility — I'll come back with a yes / no / let's-chat.",
    linkLabel: "View what you submitted",
  },
  {
    key: "quote",
    label: "Quote & pay",
    activeHint: "Quote is on the way. Once you've paid the setup fee, your Onboarding Hub unlocks.",
    linkLabel: "Open intake",
  },
  {
    key: "hub",
    label: "Onboarding Hub",
    activeHint: "5 quick steps to set up your accounts + your site content.",
    linkLabel: "Open Hub",
  },
  {
    key: "live",
    label: "Live",
    activeHint: "Site live — keep your monthly change requests rolling in.",
    linkLabel: "Open your site",
  },
];

/** Resolve the href for a stage given current context. Returns null
 *  if the link isn't yet available (e.g. live without a domain).
 *
 *  Completed early stages link to /submissions where the customer
 *  can see (read-only) what they put in for that phase. Active /
 *  upcoming stages link forward to wherever the action lives:
 *    - quote (active) → /intake/[token] (editable)
 *    - quote (past) → /submissions#phase-3 (read-only)
 *    - hub → /onboarding/[token]
 *    - live → the actual site (when domain set) */
function resolveLink(
  stage: Stage,
  ctx: {
    token: string;
    domain: string;
    status: ProspectStatus;
    stageState: StageState;
  },
): string | null {
  const submissionsBase = `/account/${ctx.token}/submissions`;
  switch (stage.key) {
    case "enquiry":
      // Enquiry is "done" as soon as the dashboard is accessible at
      // all (we wouldn't be rendering this if Phase 1 hadn't been
      // submitted). Always link to the read-only view.
      return `${submissionsBase}#phase-1`;
    case "qualify":
      // Same — Phase 2 has been submitted iff this stage is past
      // or active. Either way the submissions view shows what they
      // wrote.
      if (ctx.stageState === "upcoming") return null;
      return `${submissionsBase}#phase-2`;
    case "quote":
      // Active stage → editable intake. Done stage → read-only
      // submissions section. Pre-active → nothing to link to.
      if (
        ctx.status === "Phase 2 Accepted" ||
        ctx.status === "Phase 3 In Progress"
      ) {
        return `/intake/${ctx.token}`;
      }
      if (ctx.stageState === "done") return `${submissionsBase}#phase-3`;
      return null;
    case "hub":
      // Hub itself is always accessible once unlocked. Even when
      // "done", we want them to be able to revisit and see the
      // locked steps (which they can do read-only via the Hub).
      return `/onboarding/${ctx.token}`;
    case "live":
      return ctx.domain ? `https://${ctx.domain}` : null;
    default:
      return null;
  }
}

/** Resolve the active stage from the prospect's status. */
function activeStageFor(
  status: ProspectStatus,
): Stage["key"] | "cancelled" {
  switch (status) {
    case "Phase 1 Complete":
    case "Phase 1 Email Sent":
      return "enquiry";
    case "Phase 2 Complete":
    case "Phase 2 Soft Rejected":
    case "Phase 2 Flagged for Review":
    case "Phase 2 Clarification Requested":
      return "qualify";
    case "Phase 2 Accepted":
    case "Phase 3 In Progress":
    case "Phase 3 Complete":
      return "quote";
    case "Paid":
    case "Onboarding Started":
      return "hub";
    case "Onboarding Complete":
    case "Build Started":
    case "Live":
      return "live";
    case "Cancelled":
      return "cancelled";
  }
}

/** Compute each stage's state given the active stage. */
function stateFor(
  stage: Stage["key"],
  active: ReturnType<typeof activeStageFor>,
  status: ProspectStatus,
): StageState {
  if (active === "cancelled") {
    // Cancelled accounts: walk back to the furthest stage they
    // reached using a heuristic (we don't track historical paths).
    // Show "live" as done iff they actually went live.
    if (stage === "live" && status !== "Cancelled") return "done";
    return "upcoming";
  }
  const order: Stage["key"][] = ["enquiry", "qualify", "quote", "hub", "live"];
  const stageIdx = order.indexOf(stage);
  const activeIdx = order.indexOf(active);
  if (stageIdx < activeIdx) return "done";
  if (stageIdx === activeIdx) {
    // Special-case: status "Live" → live is "done", not "active".
    if (stage === "live" && status === "Live") return "done";
    return "active";
  }
  return "upcoming";
}

export default function ProgressTracker({
  status,
  token,
  domain,
}: {
  status: ProspectStatus;
  token: string;
  /** Customer's domain (from Hub Step 2) — used to surface the
   *  "Open your site" link under the Live stage. Empty string when
   *  not captured yet. */
  domain: string;
}) {
  const active = activeStageFor(status);
  const isCancelled = active === "cancelled";

  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-5 shadow-card md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-navy-900">
          Your journey
        </h2>
        {isCancelled && (
          <span className="rounded-full bg-navy-100 px-2.5 py-0.5 text-[11px] font-semibold text-navy-700">
            Cancelled
          </span>
        )}
      </div>

      {/* Horizontal track on md+, stacked on mobile */}
      <ol className="mt-5 flex flex-col gap-3 md:flex-row md:items-start md:gap-0">
        {STAGES.map((stage, i) => {
          const state = stateFor(stage.key, active, status);
          const isActive = state === "active";
          const isDone = state === "done";
          const isLast = i === STAGES.length - 1;
          return (
            <li
              key={stage.key}
              className="relative flex flex-1 items-start gap-3 md:flex-col md:items-center md:gap-2 md:text-center"
            >
              {/* Connector line — desktop horizontal between dots,
                  mobile vertical (rendered on the right side, hidden
                  for the last item). */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={[
                    "hidden md:block absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[14px] h-0.5",
                    isDone ? "bg-green-400" : "bg-navy-100",
                  ].join(" ")}
                />
              )}

              {/* Step dot */}
              <span
                aria-hidden="true"
                className={[
                  "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  isDone
                    ? "border-green-400 bg-green-400 text-white"
                    : isActive
                      ? "border-ember-500 bg-white text-ember-700"
                      : "border-navy-200 bg-white text-navy-400",
                ].join(" ")}
              >
                {isDone ? (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8l3 3 7-7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-0 animate-ping rounded-full border-2 border-ember-400 opacity-50"
                  />
                )}
              </span>

              <div className="flex-1">
                <p
                  className={[
                    "text-sm font-semibold leading-tight",
                    isActive
                      ? "text-navy-900"
                      : isDone
                        ? "text-navy-700"
                        : "text-navy-500",
                  ].join(" ")}
                >
                  {stage.label}
                </p>
                {isActive && (
                  <p className="mt-1 text-xs leading-relaxed text-navy-600 md:px-1">
                    {stage.activeHint}
                  </p>
                )}
                {stage.linkLabel &&
                  (() => {
                    const href = resolveLink(stage, {
                      token,
                      domain,
                      status,
                      stageState: state,
                    });
                    if (!href) return null;
                    const external = href.startsWith("http");
                    // Greyed-out hint when the stage isn't reached
                    // yet — still rendered so the layout doesn't
                    // jump between active stages, but visibly
                    // disabled. Done stages get a subtle
                    // back-to-this-step link.
                    // For DONE early stages we want different copy
                    // — "View submission" rather than the active-stage
                    // hint — so customers know they're looking at
                    // a read-only review, not a fresh action.
                    const label =
                      state === "done" &&
                      (stage.key === "enquiry" ||
                        stage.key === "qualify" ||
                        stage.key === "quote")
                        ? "View submission"
                        : stage.linkLabel;
                    return (
                      <a
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        className={[
                          "mt-2 inline-flex items-center gap-1 text-xs font-medium",
                          state === "upcoming"
                            ? "pointer-events-none text-navy-300"
                            : state === "done"
                              ? "text-navy-500 underline decoration-dotted underline-offset-2 hover:text-navy-700"
                              : "text-ember-600 hover:text-ember-700",
                        ].join(" ")}
                        aria-disabled={state === "upcoming"}
                        tabIndex={state === "upcoming" ? -1 : undefined}
                      >
                        {label} {external ? "↗" : "→"}
                      </a>
                    );
                  })()}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
