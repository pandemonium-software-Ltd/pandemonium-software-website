"use client";

// Customer dashboard at /account/[token]. Read-mostly client
// component with one interactive piece: the change-request form
// (POST /api/account/change-request). Everything else is rendered
// from server-fetched Notion data passed as props.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  countActiveChangeRequestsByKind,
  MONTHLY_CHANGE_REQUEST_LIMIT,
  MONTHLY_OFFER_UPDATE_LIMIT,
  type ChangeRequest,
  type ModuleChangeLogEntry,
  type ProspectStatus,
} from "@/lib/notion-prospects";
import { NEWSLETTER_MONTHLY_SEND_LIMIT } from "@/lib/newsletter/limits";
import type { StepId } from "@/lib/onboarding";
import RAGStatus from "@/components/RAGStatus";
import ProgressTracker from "@/components/ProgressTracker";
import OfferCard from "@/components/OfferCard";
import NewsletterCard, {
  type NewsletterSummary,
} from "@/components/NewsletterCard";
import AnalyticsCard from "@/components/AnalyticsCard";
import DashboardTimeline, {
  type TimelineSection,
} from "@/components/DashboardTimeline";
import ModulesEditor, {
  type PendingChange,
} from "@/components/account/ModulesEditor";
import BillingPanel from "@/components/account/BillingPanel";
import {
  readToolsSlice,
  type ToolsSlice,
} from "@/lib/module-setup-status";
import { site } from "@/lib/site";
import {
  buildEditPatches,
  buildAddPatches,
  buildRemovePatches,
  type FormPatch,
} from "@/lib/change-requests/build-form-patches";

export type AccountDashboardProps = {
  token: string;
  name: string;
  business: string;
  status: ProspectStatus;
  /** Customer's domain if Step 2 captured one; empty string otherwise. */
  domain: string;
  modules: string[];
  setupFee: number;
  monthlyFee: number;
  /** Multi-location counter — drives the ModulesEditor's stepper
   *  + BillingPanel money breakdown. 0 for single-location
   *  customers; >0 for paid extra locations. */
  extraLocations: number;
  foundingMember: boolean;
  onboardingCompletedAt: string | null;
  goLiveDate: string | null;
  changeRequests: ChangeRequest[];
  /** Full module-change log straight from Notion. The dashboard
   *  derives the pending-changes list from this to drive the
   *  ModulesEditor and BillingPanel — entries with status
   *  pending-stripe show as "Pending add / remove / cancel". */
  moduleChangeLog: ModuleChangeLogEntry[];
  /** Onboarding tools slice — drives the "Set up" button next
   *  to active-but-not-yet-configured modules in ModulesEditor.
   *  Empty object when the customer has not captured any tool
   *  setup yet (newly added module post-launch). */
  tools?: ToolsSlice;
  /** Per-step done flags. Used to render green ticks + greyed-out
   *  rows in the dashboard's Hub nav card. */
  hubStepDone: Record<StepId, boolean>;
  /** Step ids that actually apply to this prospect (depends on
   *  their module selections). Steps not in this list are omitted
   *  from the dashboard nav entirely. */
  hubApplicableStepIds: StepId[];
  /** Current offer if the customer has the Offers module + has
   *  set one. Drives the "Your offers" card on the dashboard.
   *  Null when no offer set; absent when module not bought. */
  currentOffer?: {
    headline: string;
    body?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    startsAt: string;
    endsAt: string;
  } | null;
  /** Newsletter card data — subscriber count, recent history,
   *  monthly send count. Driven by content.newsletter.* on the
   *  prospect record. */
  newsletterSummary?: NewsletterSummary;
  /** Effective monthly caps for this customer this month — default
   *  cap PLUS any admin-granted bonus from
   *  onboardingData.adminGrants[YYYY-MM]. Server-side caller
   *  computes via effectiveMonthlyCap + getAdminGrant. Optional —
   *  legacy callers fall back to the hardcoded defaults so the UI
   *  keeps rendering even before the page-level wiring lands. */
  effectiveCaps?: {
    changeRequests?: number;
    offers?: number;
    newsletters?: number;
  };
  /** True when the customer's site is on a Cloudflare zone we
   *  can pull analytics for. Drives whether the AnalyticsCard
   *  tile renders — the API would just return empty data
   *  otherwise, no point showing the chrome. */
  hasAnalytics?: boolean;
  siteData?: {
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
};

// Stage groupings — used to gate which blocks render.
const PRE_PAY_STATUSES = new Set<ProspectStatus>([
  "Phase 2 Accepted",
  "Phase 3 In Progress",
  "Phase 3 Complete",
]);
const HUB_UNLOCKED_STATUSES = new Set<ProspectStatus>([
  "Paid",
  "Onboarding Started",
  "Onboarding Complete",
  "Build Started",
  "Live",
]);
const SITE_LIVE_STATUSES = new Set<ProspectStatus>(["Live"]);

// Friendly status labels + tones for the hero badge. Covers every
// post-Phase-1 status (page.tsx gates earlier statuses out).
const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  "Phase 2 Accepted": {
    label: "Quote in your inbox",
    tone: "bg-amber-100 text-amber-900",
  },
  "Phase 3 In Progress": {
    label: "Intake in progress",
    tone: "bg-amber-100 text-amber-900",
  },
  "Phase 3 Complete": {
    label: "Awaiting payment",
    tone: "bg-amber-100 text-amber-900",
  },
  Paid: {
    label: "Setup in progress",
    tone: "bg-blue-100 text-blue-800",
  },
  "Onboarding Started": {
    label: "Onboarding in progress",
    tone: "bg-purple-100 text-purple-800",
  },
  "Onboarding Complete": {
    label: "Build queued",
    tone: "bg-orange-100 text-orange-800",
  },
  "Build Started": {
    label: "Build in progress",
    tone: "bg-orange-100 text-orange-800",
  },
  Live: {
    label: "Live",
    tone: "bg-green-100 text-green-800",
  },
  Cancelled: {
    label: "Cancelled",
    tone: "bg-navy-100 text-navy-700",
  },
};

export default function AccountDashboard(props: AccountDashboardProps) {
  const {
    token,
    name,
    business,
    status,
    domain,
    modules,
    setupFee,
    monthlyFee,
    extraLocations,
    foundingMember,
    onboardingCompletedAt,
    goLiveDate,
    changeRequests,
    moduleChangeLog,
    tools,
    hubStepDone,
    hubApplicableStepIds,
    currentOffer,
    newsletterSummary,
    effectiveCaps,
    hasAnalytics,
    siteData,
  } = props;
  const hasOffersModule = modules.includes("Offers");
  const hasNewsletterModule = modules.includes("Newsletter");

  // Derive the customer-facing pending-changes list from the raw
  // module change log. Only `pending-stripe` entries surface to
  // the dashboard (applied / rejected / billing-failed already
  // settled). Shape narrowed to what ModulesEditor + BillingPanel
  // actually need so neither has to know about the full audit log.
  const pendingChanges: PendingChange[] = moduleChangeLog
    .filter(
      (e) =>
        e.status === "pending-stripe" &&
        (e.kind === "modules-post-launch" ||
          e.kind === "cancel-end-of-period" ||
          e.kind === "cancel-immediate-prorated" ||
          e.kind === "multilocation-change"),
    )
    .map((e) => {
      const fromSet = new Set(e.fromModules);
      const toSet = new Set(e.toModules);
      return {
        id: e.id,
        kind: e.kind as PendingChange["kind"],
        added: [...toSet].filter((m) => !fromSet.has(m)),
        removed: [...fromSet].filter((m) => !toSet.has(m)),
        effectiveDate: e.effectiveDate ?? e.submittedAt.slice(0, 10),
        setupDelta: e.setupDelta,
        monthlyDelta: e.monthlyDelta,
        // Only set for multilocation-change entries — drives the
        // stepper's "pending → N" badge in ModulesEditor.
        toExtraLocations: e.toExtraLocations,
      };
    });

  // Resolve each effective cap from props, falling back to the
  // hardcoded default if the caller hasn't supplied one yet. Each
  // child card that displays a cap reads from these locals so the
  // admin-granted bonus shows up consistently across the UI.
  const effectiveCrCap =
    effectiveCaps?.changeRequests ?? MONTHLY_CHANGE_REQUEST_LIMIT;
  const effectiveOfferCap =
    effectiveCaps?.offers ?? MONTHLY_OFFER_UPDATE_LIMIT;
  const effectiveNewsletterCap =
    effectiveCaps?.newsletters ?? NEWSLETTER_MONTHLY_SEND_LIMIT;

  const firstName = (name.split(/\s+/)[0] ?? name).trim();
  const statusBadge = STATUS_LABEL[status] ?? {
    label: status,
    tone: "bg-navy-100 text-navy-700",
  };
  const isLive = status === "Live";
  const isCancelled = status === "Cancelled";
  const isPrePay = PRE_PAY_STATUSES.has(status);
  const isHubUnlocked = HUB_UNLOCKED_STATUSES.has(status);
  const isSiteLive = SITE_LIVE_STATUSES.has(status);
  const siteUrl = domain ? `https://${domain}` : "";
  const daysSinceLaunch = onboardingCompletedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(onboardingCompletedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  // Prior change requests, newest first (already sorted server-side by
  // appendChangeRequest helper).
  const [requests, setRequests] = useState<ChangeRequest[]>(changeRequests);

  const refreshRequests = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/account/change-request?token=${encodeURIComponent(token)}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        success?: boolean;
        requests?: ChangeRequest[];
      };
      if (json.success && json.requests) {
        setRequests(json.requests);
      }
    } catch {
      // Silent — next visibility change will retry.
    }
  }, [token]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") refreshRequests();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshRequests]);

  return (
    <>
      <section className="bg-cream-100/60 pb-6 pt-12 md:pb-8 md:pt-16">
        <div className="container-content max-w-5xl">
          <span className="eyebrow">Your account</span>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h1 className="font-serif text-3xl font-semibold text-navy-900 md:text-4xl">
              Welcome back, {firstName}.
            </h1>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.tone}`}
            >
              {statusBadge.label}
            </span>
          </div>
          {business && (
            <p className="mt-2 text-[1.05rem] text-navy-700">
              {business}
            </p>
          )}
          {isCancelled && (
            <div className="mt-5 rounded-2xl border-l-4 border-navy-300 bg-cream-100 p-5 text-sm leading-relaxed text-navy-700">
              <p className="font-semibold text-navy-900">
                This account has been cancelled.
              </p>
              <p className="mt-2">
                Your site keeps running on your own Cloudflare account.
                Your accounts on Resend, Cal.com and Google Business
                Profile are unaffected. This dashboard is read-only — if
                you want to come back, email me and I&apos;ll re-onboard
                you at the standard setup fee.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="pb-24 pt-6">
        <div className="container-content max-w-6xl">
          {/* ---------- Progress tracker ---------- */}
          <div className="mb-6">
            <ProgressTracker status={status} token={token} domain={domain} />
          </div>

          {/* ---------- Stage-aware "what's next" ---------- */}
          {!isCancelled && (
            <div className="mb-6">
              <NextStepCard
                status={status}
                token={token}
                siteUrl={siteUrl}
                domain={domain}
                setupFee={setupFee}
                goLiveDate={goLiveDate}
              />
            </div>
          )}

          {/* ---------- Timeline rail + main content ----------
            * Desktop: sticky rail on the left margin scrolls the
            * page to whichever section the customer clicks. Mobile:
            * rail collapses to a floating "Jump to" button.
            * Sections list is built dynamically so it always
            * matches what actually rendered (e.g. Visitors only
            * appears when isSiteLive). */}
          {(() => {
            // Sections list in page (DOM) order — the rail's active
            // dot moves top-to-bottom as the customer scrolls.
            // Conditional pushes mirror the conditional render in
            // the body below, so the rail only lists what actually
            // mounted on the page.
            const sections: TimelineSection[] = [];
            if (isSiteLive && hasAnalytics)
              sections.push({ id: "section-visitors", label: "Analytics" });
            sections.push({ id: "section-site", label: "Your site" });
            if (isHubUnlocked && !isCancelled)
              sections.push({
                id: "section-hub",
                label: "Onboarding Hub",
              });
            if (isHubUnlocked && !isCancelled)
              sections.push({
                id: "section-modules",
                label: "Your modules",
              });
            if (isHubUnlocked && !isCancelled)
              sections.push({
                id: "section-billing",
                label: "Billing",
              });
            sections.push({
              id: "section-this-month",
              label: "This month",
            });
            sections.push({ id: "section-contact", label: "Get in touch" });
            if (!isCancelled && isSiteLive)
              sections.push({
                id: "section-changes",
                label: "Change requests",
              });
            return (
              <div className="lg:flex lg:items-start lg:gap-10">
                <DashboardTimeline sections={sections} />
                <div className="min-w-0 flex-1">
                  {renderSections()}
                </div>
              </div>
            );
          })()}
        </div>
      </section>
    </>
  );

  function renderSections() {
    return (
      <>
          {/* ---------- Visitors / analytics (full width) ----------
           *  Cloudflare edge-level totals + daily series +
           *  top pages / countries / referrers / status codes,
           *  populated nightly by the ops Worker's analytics-tick.
           *  Only rendered for live customers whose site is on a
           *  Cloudflare zone we can read (gated by hasAnalytics,
           *  computed server-side from prospect.cloudflareZoneId).
           *  Sits as a full-width, collapsible block above the
           *  2-column dashboard grid so the visual emphasis matches
           *  the data density. */}
          {isSiteLive && hasAnalytics && (
            <div className="mb-6">
              <AnalyticsCard
                token={token}
                domain={domain}
                id="section-visitors"
                hasNewsletter={hasNewsletterModule}
              />
            </div>
          )}

          {/* Each DashCard gets its own full-width row. The earlier
              2-column grid looked uneven when one section was
              collapsed (short) and its neighbour expanded (tall) —
              vertical stacking keeps the layout predictable while
              still letting cards collapse for tidiness. */}
          <div className="flex flex-col gap-6">
            {/* ---------- Your site ---------- */}
            <DashCard title="Your site" id="section-site">
              {siteUrl ? (
                <>
                  <p className="font-mono text-base text-navy-900">
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link"
                    >
                      {domain}
                    </a>
                  </p>
                  {isLive && daysSinceLaunch !== null && (
                    <p className="mt-2 text-sm text-navy-600">
                      Live for {daysSinceLaunch}{" "}
                      {daysSinceLaunch === 1 ? "day" : "days"}.
                    </p>
                  )}
                  {!isLive && (
                    <p className="mt-2 text-sm text-navy-600">
                      {status === "Build Started"
                        ? "Going live now — your final site is being built. We'll email you the moment it's reachable on your domain."
                        : status === "Onboarding Complete"
                          ? goLiveDate
                            ? `Signed off — nothing to do until your launch date. On the morning of ${formatDate(goLiveDate)} we'll build the final site and switch your domain over.`
                            : "Signed off — your launch is scheduled. We'll build the final site and switch your domain over on launch morning."
                          : "Setup in progress — finish your Onboarding Hub steps to unlock the build."}
                    </p>
                  )}
                  {goLiveDate && !isLive && (
                    <p className="mt-2 text-sm text-navy-600">
                      Target go-live:{" "}
                      <strong className="text-navy-900">
                        {formatDate(goLiveDate)}
                      </strong>
                    </p>
                  )}
                </>
              ) : isHubUnlocked ? (
                <p className="text-sm text-navy-700">
                  Your domain hasn&apos;t been captured yet.{" "}
                  <Link
                    href={`/onboarding/${token}`}
                    className="link"
                  >
                    Finish your onboarding
                  </Link>{" "}
                  to add it.
                </p>
              ) : (
                <p className="text-sm text-navy-700">
                  Your site URL appears here once your Onboarding Hub
                  unlocks (after you&apos;ve paid the setup fee).
                </p>
              )}
              {isHubUnlocked && (
                <Link
                  href={`/onboarding/${token}`}
                  className="mt-4 inline-block text-sm font-semibold text-ember-600 transition-colors hover:text-ember-700"
                >
                  Open your Onboarding Hub →
                </Link>
              )}
            </DashCard>

            {/* ---------- Onboarding Hub navigation ---------- */}
            {isHubUnlocked && !isCancelled && (
              <DashCard title="Onboarding Hub" id="section-hub">
                <p className="text-sm text-navy-700">
                  {(() => {
                    const total = HUB_STEPS.filter((s) =>
                      hubApplicableStepIds.includes(s.id as StepId),
                    ).length;
                    const done = HUB_STEPS.filter(
                      (s) =>
                        hubApplicableStepIds.includes(s.id as StepId) &&
                        hubStepDone[s.id as StepId],
                    ).length;
                    if (total === 0)
                      return "Open the Hub to start your setup steps.";
                    if (done === 0)
                      return `${total} steps to go. Each one saves as you finish it.`;
                    if (done === total)
                      return `All ${total} steps complete. Tap any to review (locked once done).`;
                    return `${done} of ${total} done — keep going.`;
                  })()}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {HUB_STEPS.filter((s) =>
                    hubApplicableStepIds.includes(s.id as StepId),
                  ).map((s) => {
                    const isDone = hubStepDone[s.id as StepId];
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/onboarding/${token}?step=${s.id}`}
                          className={[
                            "group flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                            isDone
                              ? "border-green-200 bg-green-50/60 hover:bg-green-50"
                              : "border-navy-100 bg-cream-50 hover:border-navy-300 hover:bg-white",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-2.5">
                            {isDone ? (
                              <span
                                aria-label="Done"
                                className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  aria-hidden="true"
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
                            ) : (
                              <span className="font-mono text-[10px] font-bold text-navy-500">
                                {s.num}
                              </span>
                            )}
                            <span
                              className={[
                                "font-medium",
                                isDone
                                  ? "text-navy-600 line-through decoration-navy-300 decoration-1"
                                  : "text-navy-900",
                              ].join(" ")}
                            >
                              {s.label}
                            </span>
                            {isDone && (
                              <span className="ml-1 inline-block rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-green-800">
                                {/* Assets stays editable post-done so
                                    customers can swap a logo/photo
                                    and trigger a rebuild — show
                                    "saved" rather than "locked" so
                                    it's clear they can still change
                                    it. Same for review (which has
                                    its own revision flow). */}
                                {s.id === "assets" || s.id === "review"
                                  ? "saved"
                                  : "locked"}
                              </span>
                            )}
                          </span>
                          <span
                            aria-hidden="true"
                            className={[
                              "transition-transform group-hover:translate-x-0.5",
                              isDone
                                ? "text-navy-400 group-hover:text-navy-600"
                                : "text-navy-400 group-hover:text-navy-700",
                            ].join(" ")}
                          >
                            →
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </DashCard>
            )}

            {/* ---------- Your modules ---------------------------
             *  Single tile that combines: what the customer bought,
             *  what self-serve tools each module unlocks, the active
             *  composers (Newsletter / Offers) once their site is
             *  live, and the CTA to add or remove modules.
             *
             *  Composers (NewsletterCard / OfferCard) are
             *  structured pre-baked-patch flows — no Haiku in the
             *  loop. General text edits use the change-request
             *  block lower on the page; they're not modules. */}
            {isHubUnlocked && !isCancelled && (
              <DashCard title="Your modules" id="section-modules">
                {/* Add / remove modules — same component the
                 *  Billing section uses, but cancel-account is
                 *  intentionally cordoned off to Billing only.
                 *  Drops the old "use the Hub link" guidance — the
                 *  whole flow is here now. */}
                <ModulesEditor
                  token={token}
                  currentModules={modules}
                  pendingChanges={pendingChanges}
                  foundingMember={foundingMember}
                  currentMonthly={monthlyFee}
                  paidSetup={setupFee}
                  extraLocations={extraLocations}
                  tools={tools}
                />
                <p className="mt-4 text-xs text-navy-500">
                  Changes apply from your next billing date — no
                  partial-month charges. To cancel your account,
                  use the Billing section below.
                </p>

                {/* Self-serve composers — only render the divider +
                 *  block when the customer bought one of the
                 *  structured-composer modules. Three states:
                 *    1. Live with module        → render the composer card
                 *    2. Pre-launch with module  → bullet teaser
                 *    3. Cancelled / no module   → nothing
                 */}
                {(hasNewsletterModule || hasOffersModule) && (
                  <div className="mt-6 border-t border-navy-100 pt-5">
                    <p className="text-sm font-semibold text-navy-900">
                      {isSiteLive
                        ? "Self-serve tools"
                        : "Self-serve tools — at launch"}
                    </p>
                    <p className="mt-1 text-xs text-navy-600">
                      {isSiteLive
                        ? "Each has its own monthly allowance — they don't share a budget."
                        : "Unlocks automatically the morning your site goes live. Each has its own monthly allowance — they don't share a budget."}
                    </p>

                    {isSiteLive ? (
                      // Live composers — full interactive cards.
                      // Pass through the effective caps so the
                      // composer pills show the right "X of Y" total
                      // (default + admin grant).
                      <div className="mt-4 grid gap-4">
                        {hasNewsletterModule && newsletterSummary && (
                          <NewsletterCard
                            token={token}
                            summary={newsletterSummary}
                            cap={effectiveNewsletterCap}
                          />
                        )}
                        {hasOffersModule && (
                          <OfferCard
                            token={token}
                            current={currentOffer ?? null}
                            changeRequests={changeRequests}
                            cap={effectiveOfferCap}
                          />
                        )}
                      </div>
                    ) : (
                      // Pre-launch teaser — bullet list of what's coming.
                      <ul className="mt-3 space-y-2 text-sm">
                        {hasNewsletterModule && (
                          <li className="flex items-start gap-2">
                            <span
                              aria-hidden="true"
                              className="text-brand-primary-600"
                            >
                              •
                            </span>
                            <span>
                              <strong className="text-navy-900">
                                Newsletter sends
                              </strong>{" "}
                              — send {effectiveNewsletterCap}{" "}
                              emails a month to your subscribers,
                              including an image upload.
                            </span>
                          </li>
                        )}
                        {hasOffersModule && (
                          <li className="flex items-start gap-2">
                            <span
                              aria-hidden="true"
                              className="text-brand-primary-600"
                            >
                              •
                            </span>
                            <span>
                              <strong className="text-navy-900">
                                Offer updates
                              </strong>{" "}
                              — schedule {effectiveOfferCap}{" "}
                              promotional strips a month on your
                              homepage with a headline, dates and CTA.
                            </span>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </DashCard>
            )}

            {/* ---------- Billing (self-serve modules + cancel) ---------- */}
            {isHubUnlocked && !isCancelled && (
              <DashCard title="Billing" id="section-billing">
                <BillingPanel
                  token={token}
                  setupFee={setupFee}
                  monthlyFee={monthlyFee}
                  foundingMember={foundingMember}
                  currentModules={modules}
                  pendingChanges={pendingChanges}
                  extraLocations={extraLocations}
                  tools={tools}
                />
              </DashCard>
            )}

            {/* ---------- This month ----------
             *  Per-kind usage. Each module has its own 2/month budget
             *  (or 1/month for legacy free-text change-requests under
             *  the old shared cap). Resets together on the 1st UTC. */}
            <DashCard title="This month" id="section-this-month">
              <p className="text-sm text-navy-700">
                Each module has its own monthly allowance. Resets on
                the 1st. Out-of-scope items quoted separately
                don&apos;t count.
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {hasNewsletterModule && newsletterSummary && (
                  <UsageRow
                    label="Newsletter sends"
                    used={newsletterSummary.sentThisMonth}
                    cap={effectiveNewsletterCap}
                  />
                )}
                {hasOffersModule && (
                  <UsageRow
                    label="Offer updates"
                    used={countActiveChangeRequestsByKind(
                      requests,
                      "offer-update",
                    )}
                    cap={effectiveOfferCap}
                  />
                )}
                <UsageRow
                  label="Change requests"
                  used={countActiveChangeRequestsByKind(
                    requests,
                    "free-text",
                  )}
                  cap={effectiveCrCap}
                />
              </dl>
            </DashCard>

            {/* ---------- Get in touch ---------- */}
            <DashCard title="Get in touch" id="section-contact">
              <p className="text-sm text-navy-700">
                Quickest way to reach me about anything that doesn&apos;t
                fit a change request.
              </p>
              <a
                href={`mailto:${site.contactEmail}`}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-700"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M3 7 L12 13 L21 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                {site.contactEmail}
              </a>
              <p className="mt-4 text-xs text-navy-500">
                Need to cancel? Use the Billing section above —
                you can pick end-of-month or immediate with a
                prorated refund.
              </p>
            </DashCard>
          </div>

          {/* ---------- Change requests (full width) ----------
              Only relevant once the site is live AND the customer
              has an actual site to request changes to. Pre-launch
              edits use Hub Step 5 instead. */}
          {!isCancelled && isSiteLive && (
            <div className="mt-8">
              <ChangeRequestsBlock
                token={token}
                requests={requests}
                cap={effectiveCrCap}
                id="section-changes"
                siteData={siteData}
                onSubmitted={(req) => setRequests((prev) => [req, ...prev])}
                onRetracted={(id) =>
                  setRequests((prev) =>
                    prev.map((r) =>
                      r.id === id
                        ? { ...r, status: "retracted", resolvedAt: new Date().toISOString() }
                        : r,
                    ),
                  )
                }
              />
            </div>
          )}
      </>
    );
  }
}

// ---------- Card primitive ----------

function DashCard({
  title,
  children,
  defaultOpen = false,
  id,
}: {
  title: string;
  children: React.ReactNode;
  /** Whether the section starts expanded. Defaults to false — the
   *  dashboard now opens as a compact accordion driven by the
   *  left-rail timeline. The customer expands what they want via
   *  the rail (or the chevron) and sections stay open after that. */
  defaultOpen?: boolean;
  /** Anchor id — set when this card is a target of the left-rail
   *  timeline nav. Lets the rail's smooth-scroll find the card and
   *  the IntersectionObserver flag it as the active section. */
  id?: string;
}) {
  // Native <details> + <summary> for collapsibility — browser
  // handles state, keyboard ENTER/SPACE, screen reader announce
  // ("disclosure widget, expanded / collapsed"), no React state
  // needed. The `group` + `group-open:` pair makes the chevron
  // rotate without per-instance state. Default-marker is hidden
  // so the heading + custom chevron are the only visible disclosure
  // affordance.
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-24 rounded-2xl bg-white p-6 shadow-card md:p-7 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold text-navy-900">
          {title}
        </h2>
        <ChevronToggle />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/** Chevron used by collapsible cards. Rotates 180° when the
 *  parent <details> is open via the `group-open:` selector — no
 *  per-instance state, no client JS. */
function ChevronToggle() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5 flex-none text-navy-500 transition-transform duration-200 group-open:rotate-180"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A single "X/Y used" row for the "This month" usage card. `muted`
 * styling backgrounds rows that the customer rarely hits (legacy
 * free-text change-requests) so the structured modules visually
 * dominate.
 */
function UsageRow({
  label,
  used,
  cap,
  muted = false,
}: {
  label: string;
  used: number;
  cap: number;
  muted?: boolean;
}) {
  const atCap = used >= cap;
  return (
    <div
      className={[
        "flex items-center justify-between gap-3 rounded-lg px-3 py-2",
        muted ? "bg-cream-100/60" : "bg-cream-50",
      ].join(" ")}
    >
      <dt className={muted ? "text-navy-600" : "text-navy-800"}>{label}</dt>
      <dd>
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
            atCap
              ? "bg-navy-200 text-navy-700"
              : "bg-green-100 text-green-800",
          ].join(" ")}
        >
          {used}/{cap}
        </span>
      </dd>
    </div>
  );
}

// ---------- Hub step nav metadata ----------
//
// Steps mirror what /onboarding/[token] renders. `id` matches the
// internal StepId — the Hub reads `?step=<id>` and opens that one.
// Display order mirrors the Hub's display order so labels stay in
// sync.
const HUB_STEPS: Array<{ num: string; id: string; label: string }> = [
  { num: "01", id: "cloudflare", label: "Cloudflare account" },
  { num: "02", id: "domain", label: "Domain & DNS" },
  { num: "03", id: "tools", label: "Modules + tools" },
  { num: "04", id: "content", label: "Site content" },
  { num: "05", id: "assets", label: "Brand assets" },
  { num: "06", id: "review", label: "Review & launch" },
];

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-green-600"
    >
      <path
        d="M3 8l3 3 7-7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------- Stage-aware "what's next" card ----------
//
// Different prominent CTA for each pre-launch / launch state, so
// the customer always knows the single most useful action they
// can take from the dashboard. Designed to be visually distinct
// (full-width, accent border) so it doesn't get lost among the
// regular cards below.

function NextStepCard({
  status,
  token,
  siteUrl,
  domain,
  setupFee,
  goLiveDate,
}: {
  status: ProspectStatus;
  token: string;
  siteUrl: string;
  domain: string;
  setupFee: number;
  /** ISO date string for the launch when known. Used by the
   *  "Onboarding Complete" branch so the customer sees the exact
   *  date their site is scheduled to go live. */
  goLiveDate: string | null;
}) {
  // Each entry: title + body + CTA (label, href). When CTA is null,
  // there's no actionable next step (e.g. "I'm building your site").
  type NextStep = {
    title: string;
    body: string;
    cta?: { label: string; href: string; external?: boolean };
  };

  let step: NextStep | null = null;
  switch (status) {
    case "Phase 2 Accepted":
      step = {
        title: "Your quote's in your inbox",
        body: `We're a fit. Check your email for the quote (£${setupFee} setup + monthly). Once you're happy, hit the "Start onboarding intake" link in that email to fill in the details we need to set up your accounts.`,
        cta: { label: "Re-send quote email", href: `mailto:${site.contactEmail}?subject=Resend%20my%20quote` },
      };
      break;
    case "Phase 3 In Progress":
      step = {
        title: "Finish your intake",
        body: "You started the intake form — pick up where you left off. Most people finish it in 5-10 minutes; you can save and resume.",
        cta: { label: "Continue intake →", href: `/intake/${token}` },
      };
      break;
    case "Phase 3 Complete":
      step = {
        title: "Awaiting payment",
        body: `Intake's done — we just need the £${setupFee} setup fee to unlock your Onboarding Hub. The payment link's in your last email; reply if you can't find it and we'll re-send.`,
        cta: { label: "Email about payment", href: `mailto:${site.contactEmail}?subject=Payment%20for%20setup` },
      };
      break;
    case "Paid":
    case "Onboarding Started":
      step = {
        title: "Open your Onboarding Hub",
        body: "5 quick steps to wire up your Cloudflare account, your domain, your tools (Cal.com, Resend) and your site content. Each step saves as you go.",
        cta: { label: "Open Onboarding Hub →", href: `/onboarding/${token}` },
      };
      break;
    case "Onboarding Complete":
      step = {
        title: goLiveDate
          ? `Launch scheduled — ${formatDate(goLiveDate)}`
          : "Launch scheduled",
        body: goLiveDate
          ? `You're signed off. Nothing to do until ${formatDate(goLiveDate)} — that morning we'll build the final site, switch your domain over, and email you when it's reachable. Until then your preview stays available in the Hub.`
          : "You're signed off. We'll build the final site and switch your domain over on your scheduled launch morning. Until then your preview stays available in the Hub.",
      };
      break;
    case "Build Started":
      step = {
        title: "Going live now",
        body: "Today's the day. The final site is being built and your domain is being switched over. We'll email you the moment it's reachable — typically a couple of minutes.",
      };
      break;
    case "Live":
      step = {
        title: "Your site is live 🎉",
        body: domain
          ? `${domain} is up and running. Use the change-request form below for any tweaks.`
          : "Your site is live. Use the change-request form below for any tweaks.",
        cta: siteUrl
          ? { label: "Open your site ↗", href: siteUrl, external: true }
          : undefined,
      };
      break;
  }

  if (!step) return null;

  return (
    <div className="rounded-2xl border-l-4 border-ember-500 bg-white p-6 shadow-card md:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ember-700">
        Next step
      </p>
      <h2 className="mt-1.5 font-serif text-xl font-semibold text-navy-900 md:text-2xl">
        {step.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-navy-700 md:text-base">
        {step.body}
      </p>
      {step.cta && (
        <a
          href={step.cta.href}
          target={step.cta.external ? "_blank" : undefined}
          rel={step.cta.external ? "noopener noreferrer" : undefined}
          className="btn-primary mt-4"
        >
          {step.cta.label}
        </a>
      )}
    </div>
  );
}

// ---------- Change requests ----------

type SiteDataProp = NonNullable<AccountDashboardProps["siteData"]>;

type QuickEditCategory = "contact" | "copy" | "service" | "faq" | "testimonial" | "trust" | "photo";
type QuickEditField =
  | "phone" | "email" | "address" | "serviceArea" | "openingHours"
  | "tagline" | "aboutBlurb"
  | "serviceDesc" | "serviceLongDesc" | "servicePricing" | "servicePrice"
  | "faqAnswer" | "faqQuestion"
  | "testimonialQuote" | "testimonialRating"
  | "trustYears" | "trustAssociations" | "trustAwards"
  | "photoLogo" | "photoHero" | "photoAbout" | "photoService" | "photoGallery" | "photoBackground";

const QE_CATEGORIES: { value: QuickEditCategory; label: string }[] = [
  { value: "contact", label: "Contact & hours" },
  { value: "copy", label: "Tagline & about" },
  { value: "service", label: "Services" },
  { value: "faq", label: "FAQ" },
  { value: "testimonial", label: "Testimonials" },
  { value: "trust", label: "Trust signals" },
  { value: "photo", label: "Photos" },
];

const QE_CONTACT_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
  { value: "serviceArea", label: "Service area" },
  { value: "openingHours", label: "Opening hours" },
];
const QE_COPY_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "tagline", label: "Tagline" },
  { value: "aboutBlurb", label: "About blurb" },
];
const QE_SERVICE_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "serviceDesc", label: "Short description" },
  { value: "serviceLongDesc", label: "Long description" },
  { value: "servicePricing", label: "Pricing notes" },
  { value: "servicePrice", label: "Price from" },
];
const QE_FAQ_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "faqQuestion", label: "Question" },
  { value: "faqAnswer", label: "Answer" },
];
const QE_TESTIMONIAL_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "testimonialQuote", label: "Quote" },
  { value: "testimonialRating", label: "Rating" },
];
const QE_TRUST_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "trustYears", label: "Years experience" },
  { value: "trustAssociations", label: "Associations" },
  { value: "trustAwards", label: "Awards" },
];
const QE_PHOTO_FIELDS: { value: QuickEditField; label: string }[] = [
  { value: "photoLogo", label: "Logo" },
  { value: "photoHero", label: "Hero image" },
  { value: "photoAbout", label: "About photo" },
  { value: "photoService", label: "Service photo" },
  { value: "photoGallery", label: "Gallery" },
  { value: "photoBackground", label: "Background" },
];
const QE_PHOTO_SLOT_MAP: Record<string, string> = {
  photoLogo: "logo", photoHero: "hero", photoAbout: "about",
  photoService: "service", photoGallery: "gallery", photoBackground: "background",
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

function truncateStr(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function QuickEditForm({
  token,
  siteData,
  pending,
  setPending,
  setError,
  setSuccess,
  onSubmitted,
  remaining,
}: {
  token: string;
  siteData: SiteDataProp;
  pending: boolean;
  setPending: (v: boolean) => void;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  onSubmitted: (req: ChangeRequest) => void;
  remaining: number;
}) {
  const [category, setCategory] = useState<QuickEditCategory>("contact");
  const [field, setField] = useState<QuickEditField>("phone");
  const [action, setAction] = useState<"edit" | "add" | "remove">("edit");
  const hasLocations = siteData.locations.length > 0;
  const [locationIdx, setLocationIdx] = useState(-1);
  const [itemIdx, setItemIdx] = useState(0);
  const [newValue, setNewValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hours, setHours] = useState<Record<string, { open: boolean; from: string; to: string }>>(() =>
    Object.fromEntries(DAYS.map((d) => [d, { open: true, from: "09:00", to: "17:00" }])),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Multi-field state for "Add new" forms
  const [addService, setAddService] = useState({ name: "", description: "", pricingNotes: "", priceFrom: "" });
  const [addFaq, setAddFaq] = useState({ question: "", answer: "" });
  const [addTestimonial, setAddTestimonial] = useState({ name: "", quote: "", rating: "" });

  const isListCategory = category === "service" || category === "faq" || category === "testimonial";

  function selectCategory(cat: QuickEditCategory) {
    setCategory(cat);
    setItemIdx(0);
    setNewValue("");
    setSelectedFile(null);
    setAction("edit");
    setError(null);
    setAddService({ name: "", description: "", pricingNotes: "", priceFrom: "" });
    setAddFaq({ question: "", answer: "" });
    setAddTestimonial({ name: "", quote: "", rating: "" });
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
    setError(null);
  }

  function selectAction(a: "edit" | "add" | "remove") {
    setAction(a);
    setNewValue("");
    setError(null);
    setAddService({ name: "", description: "", pricingNotes: "", priceFrom: "" });
    setAddFaq({ question: "", answer: "" });
    setAddTestimonial({ name: "", quote: "", rating: "" });
  }

  const currentSource = locationIdx < 0 ? siteData : siteData.locations[locationIdx];

  const currentVal = (() => {
    if (action !== "edit") return "";
    if (category === "contact" && currentSource) {
      if (field === "phone") return currentSource.phoneDisplay;
      if (field === "email") return currentSource.publicEmail;
      if (field === "address") return currentSource.address;
      if (field === "serviceArea") return "serviceArea" in currentSource ? (currentSource as SiteDataProp).serviceArea : "";
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

  function buildMessage(uploadUrl?: string): string {
    // --- Add new ---
    if (action === "add") {
      if (category === "service") {
        const parts = [`Add new service: "${addService.name}"`];
        if (addService.description) parts.push(`Description: "${addService.description}"`);
        if (addService.pricingNotes) parts.push(`Pricing notes: "${addService.pricingNotes}"`);
        if (addService.priceFrom) parts.push(`Price from: ${addService.priceFrom}`);
        return parts.join("\n");
      }
      if (category === "faq") return `Add new FAQ:\nQuestion: "${addFaq.question}"\nAnswer: "${addFaq.answer}"`;
      if (category === "testimonial") {
        const parts = [`Add new testimonial by "${addTestimonial.name}"`];
        parts.push(`Quote: "${addTestimonial.quote}"`);
        if (addTestimonial.rating) parts.push(`Rating: ${addTestimonial.rating}`);
        return parts.join("\n");
      }
    }

    // --- Remove ---
    if (action === "remove") {
      if (category === "service") {
        const svc = siteData.services[itemIdx];
        return `Remove service: "${svc?.name ?? "Unknown"}"`;
      }
      if (category === "faq") {
        const faq = siteData.faq[itemIdx];
        return `Remove FAQ: "${faq?.question ?? "Unknown"}"`;
      }
      if (category === "testimonial") {
        const t = siteData.testimonials[itemIdx];
        return `Remove testimonial by "${t?.name ?? "Unknown"}"`;
      }
    }

    // --- Edit (existing logic) ---
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
    if (category === "photo" && uploadUrl) {
      const slotLabel = QE_PHOTO_FIELDS.find((f) => f.value === field)?.label ?? field;
      const svcNote = field === "photoService" && siteData.services[itemIdx]
        ? ` for service "${siteData.services[itemIdx]!.name}"`
        : "";
      return `Replace ${slotLabel}${svcNote} with uploaded image: ${uploadUrl}`;
    }
    return newValue;
  }

  function validateSubmit(): string | null {
    if (remaining <= 0) return "No requests remaining this month.";
    if (action === "add") {
      if (category === "service" && !addService.name.trim()) return "Please enter a service name.";
      if (category === "faq" && (!addFaq.question.trim() || !addFaq.answer.trim())) return "Please fill in both the question and answer.";
      if (category === "testimonial" && (!addTestimonial.name.trim() || !addTestimonial.quote.trim())) return "Please enter a name and quote.";
      return null;
    }
    if (action === "remove") return null;
    // Edit validation
    if (isPhotoField && !selectedFile) return "Please select an image file.";
    if (!noValueNeeded && newValue.trim().length === 0) return "Please enter a new value.";
    return null;
  }

  const needsTextarea = field === "aboutBlurb" || field === "serviceLongDesc" || field === "serviceDesc" || field === "testimonialQuote";
  const isPhotoField = category === "photo";
  const noValueNeeded = field === "openingHours" || isPhotoField;

  function buildPatches(): FormPatch[] | null {
    if (action === "add") {
      return buildAddPatches({
        category,
        service: category === "service" ? addService : undefined,
        faq: category === "faq" ? addFaq : undefined,
        testimonial: category === "testimonial" ? { name: addTestimonial.name, quote: addTestimonial.quote, rating: addTestimonial.rating || undefined } : undefined,
      });
    }
    if (action === "remove") {
      const svc = category === "service" ? siteData.services[itemIdx] : null;
      const faq = category === "faq" ? siteData.faq[itemIdx] : null;
      const t = category === "testimonial" ? siteData.testimonials[itemIdx] : null;
      return buildRemovePatches({
        category,
        serviceName: svc?.name,
        faqQuestion: faq?.question,
        testimonialName: t?.name,
      });
    }
    if (isPhotoField) return [];
    const svc = category === "service" ? siteData.services[itemIdx] : null;
    const faqItem = category === "faq" ? siteData.faq[itemIdx] : null;
    const t = category === "testimonial" ? siteData.testimonials[itemIdx] : null;
    const loc = locationIdx >= 0 && category === "contact" ? siteData.locations[locationIdx] : null;
    return buildEditPatches({
      field,
      newValue,
      category,
      serviceName: svc?.name,
      faqQuestion: faqItem?.question,
      testimonialName: t?.name,
      locationName: loc?.name,
      hours: field === "openingHours" ? hours : undefined,
    });
  }

  async function handleQuickSubmit() {
    setError(null);
    setSuccess(null);
    const err = validateSubmit();
    if (err) { setError(err); return; }

    setPending(true);
    try {
      let uploadUrl: string | undefined;
      if (action === "edit" && isPhotoField && selectedFile) {
        setUploading(true);
        const form = new FormData();
        form.append("token", token);
        form.append("file", selectedFile);
        const upRes = await fetch("/api/account/upload-photo", {
          method: "POST",
          body: form,
        });
        const upJson = (await upRes.json()) as { success?: boolean; error?: string; url?: string };
        setUploading(false);
        if (!upRes.ok || !upJson.success || !upJson.url) {
          setError(upJson.error ?? "Upload failed. Try again.");
          return;
        }
        uploadUrl = upJson.url;
      }

      const msg = buildMessage(uploadUrl);
      const patches = buildPatches();
      const isStructured = patches !== null;
      const res = await fetch("/api/account/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          message: msg,
          ...(isStructured ? {
            kind: "direct-edit" as const,
            patches: patches.length > 0 ? patches : undefined,
            rebuildOnly: patches.length === 0 ? true : undefined,
          } : {}),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        request?: ChangeRequest;
        remaining?: number;
        error?: string;
      };
      if (!res.ok || !json.success || !json.request) {
        setError(json.error ?? "Couldn't submit. Try again.");
        return;
      }
      onSubmitted(json.request);
      setNewValue("");
      setSelectedFile(null);
      setAddService({ name: "", description: "", pricingNotes: "", priceFrom: "" });
      setAddFaq({ question: "", answer: "" });
      setAddTestimonial({ name: "", quote: "", rating: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      const r = json.remaining ?? remaining - 1;
      setSuccess(`Got it — ${r} request${r === 1 ? "" : "s"} remaining this month.`);
      setTimeout(() => setSuccess(null), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
      setUploading(false);
    }
  }

  const busy = pending || uploading;
  const fieldPills = category === "contact" ? QE_CONTACT_FIELDS
    : category === "copy" ? QE_COPY_FIELDS
    : category === "service" ? QE_SERVICE_FIELDS
    : category === "faq" ? QE_FAQ_FIELDS
    : category === "testimonial" ? QE_TESTIMONIAL_FIELDS
    : category === "photo" ? QE_PHOTO_FIELDS
    : QE_TRUST_FIELDS;

  const items = category === "service" ? siteData.services
    : category === "faq" ? siteData.faq
    : category === "testimonial" ? siteData.testimonials
    : null;

  const itemLabel = (idx: number) => {
    if (category === "service") return siteData.services[idx]?.name ?? `Service ${idx + 1}`;
    if (category === "faq") return siteData.faq[idx]?.question ? truncateStr(siteData.faq[idx]!.question, 30) : `FAQ ${idx + 1}`;
    if (category === "testimonial") return siteData.testimonials[idx]?.name ?? `Testimonial ${idx + 1}`;
    return "";
  };

  const inputCls = "w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50";
  const textareaCls = `${inputCls} resize-y`;

  return (
    <div className="mt-4 space-y-4">
      {/* Category picker */}
      <div>
        <span className="block text-sm font-semibold text-navy-900">Category</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {QE_CATEGORIES.map((c) => (
            <Pill key={c.value} label={c.label} active={category === c.value} onClick={() => selectCategory(c.value)} />
          ))}
        </div>
      </div>

      {/* Action picker for list categories */}
      {isListCategory && (
        <div>
          <span className="block text-sm font-semibold text-navy-900">What would you like to do?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill label="Edit existing" active={action === "edit"} onClick={() => selectAction("edit")} />
            <Pill label="+ Add new" active={action === "add"} onClick={() => selectAction("add")} />
            {items && items.length > 0 && (
              <Pill label="Remove" active={action === "remove"} onClick={() => selectAction("remove")} />
            )}
          </div>
        </div>
      )}

      {/* ---- ADD NEW forms ---- */}
      {action === "add" && category === "service" && (
        <div className="space-y-3 rounded-xl border-2 border-green-200 bg-green-50/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-800">New service</p>
          <input value={addService.name} onChange={(e) => setAddService((p) => ({ ...p, name: e.target.value }))} disabled={busy} placeholder="Service name (required)" maxLength={200} className={inputCls} />
          <textarea value={addService.description} onChange={(e) => setAddService((p) => ({ ...p, description: e.target.value }))} disabled={busy} placeholder="Short description (optional)" rows={3} maxLength={2000} className={textareaCls} />
          <input value={addService.pricingNotes} onChange={(e) => setAddService((p) => ({ ...p, pricingNotes: e.target.value }))} disabled={busy} placeholder="Pricing notes, e.g. 'From £500' (optional)" maxLength={500} className={inputCls} />
          <input type="number" value={addService.priceFrom} onChange={(e) => setAddService((p) => ({ ...p, priceFrom: e.target.value }))} disabled={busy} placeholder="Price from, e.g. 500 (optional)" className={inputCls} />
          <button type="button" onClick={handleQuickSubmit} disabled={busy || !addService.name.trim()} className="btn-primary">
            {busy ? "Submitting…" : "Submit new service"}
          </button>
        </div>
      )}

      {action === "add" && category === "faq" && (
        <div className="space-y-3 rounded-xl border-2 border-green-200 bg-green-50/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-800">New FAQ</p>
          <input value={addFaq.question} onChange={(e) => setAddFaq((p) => ({ ...p, question: e.target.value }))} disabled={busy} placeholder="Question (required)" maxLength={500} className={inputCls} />
          <textarea value={addFaq.answer} onChange={(e) => setAddFaq((p) => ({ ...p, answer: e.target.value }))} disabled={busy} placeholder="Answer (required)" rows={4} maxLength={2000} className={textareaCls} />
          <button type="button" onClick={handleQuickSubmit} disabled={busy || !addFaq.question.trim() || !addFaq.answer.trim()} className="btn-primary">
            {busy ? "Submitting…" : "Submit new FAQ"}
          </button>
        </div>
      )}

      {action === "add" && category === "testimonial" && (
        <div className="space-y-3 rounded-xl border-2 border-green-200 bg-green-50/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-800">New testimonial</p>
          <input value={addTestimonial.name} onChange={(e) => setAddTestimonial((p) => ({ ...p, name: e.target.value }))} disabled={busy} placeholder="Customer name (required)" maxLength={200} className={inputCls} />
          <textarea value={addTestimonial.quote} onChange={(e) => setAddTestimonial((p) => ({ ...p, quote: e.target.value }))} disabled={busy} placeholder="Their quote (required)" rows={4} maxLength={2000} className={textareaCls} />
          <input type="number" min={1} max={5} value={addTestimonial.rating} onChange={(e) => setAddTestimonial((p) => ({ ...p, rating: e.target.value }))} disabled={busy} placeholder="Rating 1–5 (optional)" className={inputCls} />
          <button type="button" onClick={handleQuickSubmit} disabled={busy || !addTestimonial.name.trim() || !addTestimonial.quote.trim()} className="btn-primary">
            {busy ? "Submitting…" : "Submit new testimonial"}
          </button>
        </div>
      )}

      {/* ---- REMOVE picker ---- */}
      {action === "remove" && items && items.length > 0 && (
        <div className="space-y-3 rounded-xl border-2 border-ember-200 bg-ember-50/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ember-800">
            Remove {category === "service" ? "a service" : category === "faq" ? "an FAQ" : "a testimonial"}
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map((_, i) => (
              <Pill key={i} label={itemLabel(i)} active={itemIdx === i} onClick={() => setItemIdx(i)} />
            ))}
          </div>
          <button type="button" onClick={handleQuickSubmit} disabled={busy} className="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ember-700 disabled:opacity-60">
            {busy ? "Submitting…" : `Remove "${itemLabel(itemIdx)}"`}
          </button>
        </div>
      )}

      {/* ---- EDIT existing (original flow) ---- */}
      {action === "edit" && (
        <>
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
              No {category === "service" ? "services" : category === "faq" ? "FAQs" : "testimonials"} found. Use &ldquo;+ Add new&rdquo; above to create one.
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
                  <Pill key={i} label={s.name} active={itemIdx === i} onClick={() => { setItemIdx(i); setSelectedFile(null); }} />
                ))}
              </div>
            </div>
          )}
          {category === "photo" && field === "photoService" && siteData.services.length === 0 && (
            <p className="text-sm text-navy-500">No services found.</p>
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
                          setError(null);
                          if (f && f.size > 5 * 1024 * 1024) {
                            setError("Image too large — max 5 MB.");
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
                      Currently: <span className="font-medium text-navy-700">{needsTextarea ? truncateStr(currentVal, 120) : currentVal}</span>
                    </p>
                  )}
                  {needsTextarea ? (
                    <textarea value={newValue} onChange={(e) => setNewValue(e.target.value)} disabled={busy} rows={4} maxLength={2000} placeholder="Enter new text…" className={textareaCls} />
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
                      className={inputCls}
                    />
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleQuickSubmit}
                disabled={busy || (isPhotoField ? !selectedFile : !noValueNeeded && newValue.trim().length === 0)}
                className="btn-primary"
              >
                {uploading ? "Uploading…" : busy ? "Submitting…" : isPhotoField ? "Upload & submit" : "Submit change"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ChangeRequestsBlock({
  token,
  requests,
  cap,
  onSubmitted,
  onRetracted,
  id,
  siteData,
  defaultOpen = false,
}: {
  token: string;
  requests: ChangeRequest[];
  cap: number;
  onSubmitted: (req: ChangeRequest) => void;
  onRetracted: (id: string) => void;
  id?: string;
  siteData?: SiteDataProp;
  defaultOpen?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<"quick" | "free">("quick");

  // Submission confirmation dialog (native <dialog> for built-in
  // modal behaviour, ESC handling and focus trap).
  const submitDialogRef = useRef<HTMLDialogElement | null>(null);

  // Retract confirmation dialog. We track which request is being
  // retracted in state — the dialog shows that request's preview
  // alongside the confirm action.
  const retractDialogRef = useRef<HTMLDialogElement | null>(null);
  const [retractTarget, setRetractTarget] = useState<ChangeRequest | null>(
    null,
  );
  const [retracting, setRetracting] = useState(false);

  const usedThisMonth = countActiveChangeRequestsByKind(requests, "free-text");
  const remaining = Math.max(0, cap - usedThisMonth);
  const atCap = remaining === 0;

  /**
   * "Submit request" button — runs client-side length validation
   * then opens the confirmation dialog. Server-side validation
   * (multi-item detector + monthly cap) fires inside `confirmSubmit`
   * after the customer hits Yes in the dialog.
   */
  function handleSubmitClick() {
    setError(null);
    setSuccess(null);
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setError("Please describe the change in at least a few words.");
      return;
    }
    if (trimmed.length > 5000) {
      setError("That's a lot for one message — please split it up.");
      return;
    }
    submitDialogRef.current?.showModal();
  }

  /** Yes-confirm in the submit dialog → fires the API call. */
  async function confirmSubmit() {
    const trimmed = message.trim();
    setPending(true);
    try {
      const res = await fetch("/api/account/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: trimmed }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        request?: ChangeRequest;
        remaining?: number;
        error?: string;
        suggestion?: string;
      };
      submitDialogRef.current?.close();
      if (!res.ok || !json.success || !json.request) {
        setError(json.error ?? "Couldn't submit just now. Try again.");
        return;
      }
      onSubmitted(json.request);
      setMessage("");
      const remainingAfter = json.remaining ?? remaining - 1;
      setSuccess(
        `Got it. ${remainingAfter} request${remainingAfter === 1 ? "" : "s"} remaining this month. You can retract it from the list below any time before I start working on it.`,
      );
      setTimeout(() => setSuccess(null), 10000);
    } catch (e) {
      submitDialogRef.current?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  /** Open the retract confirmation dialog for a specific request. */
  function startRetract(r: ChangeRequest) {
    setError(null);
    setSuccess(null);
    setRetractTarget(r);
    retractDialogRef.current?.showModal();
  }

  /** Yes-confirm in the retract dialog → fires DELETE. */
  async function confirmRetract() {
    if (!retractTarget) return;
    setRetracting(true);
    try {
      const res = await fetch("/api/account/change-request", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, requestId: retractTarget.id }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      retractDialogRef.current?.close();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Couldn't retract just now. Try again.");
        return;
      }
      onRetracted(retractTarget.id);
      setSuccess(
        "Retracted. That slot's back in your monthly allowance.",
      );
      setTimeout(() => setSuccess(null), 8000);
    } catch (e) {
      retractDialogRef.current?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetracting(false);
      setRetractTarget(null);
    }
  }

  return (
    // Collapsible — same <details> + custom summary pattern as
    // DashCard. The usage pill stays visible in the summary so the
    // customer sees their remaining count even when collapsed.
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-24 rounded-2xl bg-white p-7 shadow-card md:p-8 [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
    >
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Need a change?
          </h2>
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold",
              atCap
                ? "bg-navy-900 text-white"
                : remaining === 1
                  ? "bg-ember-100 text-ember-800 ring-1 ring-ember-200"
                  : "bg-cream-100 text-navy-800 ring-1 ring-navy-200",
            ].join(" ")}
          >
            {usedThisMonth} of {cap} used
            this month
          </span>
        </div>
        <ChevronToggle />
      </summary>
      <div className="mt-4">
      {/* original block content starts here */}
      <p className="mt-2 text-sm leading-relaxed text-navy-700">
        Tell me what you&apos;d like updated — a phone number, a new
        photo, a price tweak, a fresh testimonial. You get{" "}
        <strong>
          {cap} changes a month
        </strong>{" "}
        included. You can bundle a few related tweaks into one
        request (&ldquo;update my phone AND email&rdquo; counts as
        one). I&apos;ll come back within 48 working hours.
      </p>

      {/* Bundle rule callout — friendly take on the wishlist
          guard. Genuinely list-shaped submissions (3+ numbered
          items, multiple "additionally" paragraphs) still get
          declined, but normal "and" requests are fine. */}
      <div className="mt-4 rounded-xl border-2 border-navy-100 bg-cream-50 p-4 text-xs leading-relaxed text-navy-700">
        <p className="font-semibold text-navy-900">
          Bundle related tweaks freely
        </p>
        <p className="mt-1">
          Two or three related changes in one request? Fine — we
          apply them together. The exception is genuine wishlists:
          numbered lists with 3+ separate items, or
          paragraph-after-paragraph &ldquo;additionally&rdquo;
          requests. Those get auto-declined with a note to split
          them, and they don&apos;t burn a slot.
        </p>
      </div>

      {error && (
        <p className="mt-4 text-sm text-ember-700" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-4 text-sm text-green-700" role="status">
          {success}
        </p>
      )}

      {atCap ? (
        <div className="mt-5 rounded-xl border-2 border-navy-200 bg-cream-50 p-5 text-sm leading-relaxed text-navy-700">
          <p className="font-semibold text-navy-900">
            All {cap} requests used this
            month.
          </p>
          <p className="mt-2">
            Allowance resets on the 1st of next month. For anything
            urgent or bigger,{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="link"
            >
              email me directly
            </a>{" "}
            and I&apos;ll quote it separately.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          {/* Mode switcher */}
          <div className="flex gap-2 rounded-xl bg-cream-100 p-1">
            <button
              type="button"
              onClick={() => setMode("quick")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === "quick" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-700"}`}
            >
              Quick edit
            </button>
            <button
              type="button"
              onClick={() => setMode("free")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === "free" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-700"}`}
            >
              Free text
            </button>
          </div>

          {mode === "quick" && siteData ? (
            <QuickEditForm
              token={token}
              siteData={siteData}
              pending={pending}
              setPending={setPending}
              setError={setError}
              setSuccess={setSuccess}
              onSubmitted={onSubmitted}
              remaining={remaining}
            />
          ) : (
            <div className="mt-4">
              <label className="block">
                <span className="block text-sm font-semibold text-navy-900">
                  What would you like changed?
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. Please update my phone number on the contact page from 01865 111 222 to 01865 333 444 — we just got a new line."
                  rows={5}
                  maxLength={5000}
                  className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
                />
              </label>
              <button
                type="button"
                onClick={handleSubmitClick}
                disabled={pending || message.trim().length === 0}
                className="btn-primary mt-4"
              >
                {pending ? "Submitting…" : "Submit request"}
              </button>
            </div>
          )}
        </div>
      )}

      {requests.filter((r) => (r.kind ?? "free-text") === "free-text").length > 0 && (
        <div className="mt-7 border-t border-navy-100 pt-6">
          <h3 className="font-serif text-base font-semibold text-navy-900">
            Your requests
          </h3>
          <ul className="mt-3 space-y-3">
            {requests.filter((r) => (r.kind ?? "free-text") === "free-text").map((r) => (
              <li
                key={r.id}
                className={[
                  "rounded-xl border border-navy-100 p-4",
                  r.status === "retracted"
                    ? "bg-cream-100 opacity-75"
                    : "bg-cream-50",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-wider text-navy-500">
                    {formatRelativeDate(r.submittedAt)}
                  </span>
                  <RAGStatus status={r.status} />
                </div>
                <p
                  className={[
                    "mt-2 whitespace-pre-wrap text-sm text-navy-800",
                    r.status === "retracted" ? "line-through opacity-70" : "",
                  ].join(" ")}
                >
                  {r.message}
                </p>
                {/* Preview-pending banner — Cowork has auto-applied
                    + built a preview, customer needs to approve to
                    promote to live. The email is the primary CTA;
                    this in-dashboard prompt is the safety net for
                    customers who miss the email. */}
                {r.status === "in-progress" &&
                  r.previewVersionUrl &&
                  !r.customerApprovedAt &&
                  !r.customerRejectedAt && (
                    <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900">
                        Preview ready — your approval needed
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        I built a preview of your change. Have a look,
                        then approve to publish OR reject if it&apos;s
                        not right. Your live site is unchanged until
                        you approve.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={`/account/${token}/preview/${r.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border-2 border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:border-amber-400"
                        >
                          Open preview ↗
                        </a>
                        {r.customerApprovalToken && (
                          <>
                            <a
                              href={`/account/${token}/approve-change/${r.id}?t=${r.customerApprovalToken}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                            >
                              Approve & publish
                            </a>
                            <a
                              href={`/account/${token}/reject-change/${r.id}?t=${r.customerApprovalToken}`}
                              className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:border-red-400"
                            >
                              Reject
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                {/* Just-promoted confirmation — surfaces after the
                    customer clicks Approve and the promote workflow
                    succeeds (build-callback flips status=resolved). */}
                {r.customerApprovedAt && r.status === "resolved" && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                    ✓ Approved + live
                  </p>
                )}
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => startRetract(r)}
                    disabled={retracting}
                    className="mt-3 inline-flex items-center gap-1 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-semibold text-navy-700 transition-colors hover:border-ember-400 hover:text-ember-700 disabled:opacity-60"
                  >
                    <svg
                      width="12"
                      height="12"
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
                    Retract this request
                  </button>
                )}
                {r.reply && (
                  <div className="mt-3 rounded-lg border-l-2 border-green-500 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
                      Reply from ModuForge
                      {r.resolvedAt && (
                        <>
                          {" · "}
                          {formatRelativeDate(r.resolvedAt)}
                        </>
                      )}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-navy-800">
                      {r.reply}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- Submit confirmation dialog ---------- */}
      <dialog
        ref={submitDialogRef}
        className="m-auto max-w-md rounded-2xl border-0 p-0 shadow-lift backdrop:bg-navy-900/50"
        onClose={() => {
          // No-op; native ESC / backdrop-click closes cleanly. We
          // don't fire the API on close, only on Yes-confirm.
        }}
      >
        <div className="p-6 md:p-7">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Confirm your request
          </h2>
          <p className="mt-2 text-sm text-navy-700">
            This will use <strong>1 of your {remaining} remaining</strong>{" "}
            {remaining === 1 ? "request" : "requests"} this month.
          </p>

          <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-navy-100 bg-cream-50 p-4 text-sm whitespace-pre-wrap text-navy-800">
            {message.trim() || "(empty)"}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-navy-600">
            Once submitted, you can retract this request from the list
            below any time before I start working on it. Multi-item
            submissions are auto-declined and don&apos;t burn a slot.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => submitDialogRef.current?.close()}
              disabled={pending}
              className="rounded-lg border-2 border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:border-navy-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSubmit}
              disabled={pending}
              className="btn-primary"
            >
              {pending ? "Submitting…" : "Yes, submit"}
            </button>
          </div>
        </div>
      </dialog>

      {/* ---------- Retract confirmation dialog ---------- */}
      <dialog
        ref={retractDialogRef}
        className="m-auto max-w-md rounded-2xl border-0 p-0 shadow-lift backdrop:bg-navy-900/50"
        onClose={() => setRetractTarget(null)}
      >
        <div className="p-6 md:p-7">
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            Retract this request?
          </h2>
          <p className="mt-2 text-sm text-navy-700">
            You can only retract before I start working on it. The
            slot goes back into your monthly allowance.
          </p>

          {retractTarget && (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-navy-100 bg-cream-50 p-4 text-sm whitespace-pre-wrap text-navy-800">
              {retractTarget.message}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => retractDialogRef.current?.close()}
              disabled={retracting}
              className="rounded-lg border-2 border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:border-navy-400"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={confirmRetract}
              disabled={retracting}
              className="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ember-700 disabled:opacity-60"
            >
              {retracting ? "Retracting…" : "Yes, retract"}
            </button>
          </div>
        </div>
      </dialog>
      </div>
    </details>
  );
}

function formatDate(iso: string): string {
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

function formatRelativeDate(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMin = Math.floor((now - then) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
