"use client";

// Customer dashboard at /account/[token]. Read-mostly client
// component with one interactive piece: the change-request form
// (POST /api/account/change-request). Everything else is rendered
// from server-fetched Notion data passed as props.

import Link from "next/link";
import { useRef, useState } from "react";
import {
  countActiveChangeRequestsByKind,
  countActiveChangeRequestsThisMonth,
  MONTHLY_CHANGE_REQUEST_LIMIT,
  MONTHLY_OFFER_UPDATE_LIMIT,
  type ChangeRequest,
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
import { site } from "@/lib/site";

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
  foundingMember: boolean;
  onboardingCompletedAt: string | null;
  goLiveDate: string | null;
  changeRequests: ChangeRequest[];
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
    foundingMember,
    onboardingCompletedAt,
    goLiveDate,
    changeRequests,
    hubStepDone,
    hubApplicableStepIds,
    currentOffer,
    newsletterSummary,
    effectiveCaps,
    hasAnalytics,
  } = props;
  const hasOffersModule = modules.includes("Offers");
  const hasNewsletterModule = modules.includes("Newsletter");

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
              sections.push({ id: "section-visitors", label: "Visitors" });
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
                {/* Bought-modules list — always shown so the customer
                 *  can audit at a glance "what am I paying for?". */}
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2 text-navy-900">
                    <CheckIcon /> Base website
                  </li>
                  {modules.length === 0 && (
                    <li className="text-navy-500">
                      No add-on modules yet.
                    </li>
                  )}
                  {modules.map((m) => (
                    <li key={m} className="flex items-center gap-2 text-navy-900">
                      <CheckIcon /> {m}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-navy-600">
                  Want to add or remove a module? Use the{" "}
                  <Link
                    href={`/onboarding/${token}?step=tools`}
                    className="link"
                  >
                    Modules step
                  </Link>{" "}
                  in your Hub — we&apos;ll review + confirm pricing
                  before anything changes on your bill.
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

            {/* ---------- Billing (placeholder for #6) ---------- */}
            {isHubUnlocked && !isCancelled && (
              <DashCard title="Billing" id="section-billing">
                <span className="inline-block rounded-full bg-cream-100 px-2.5 py-0.5 text-[11px] font-semibold text-navy-700 ring-1 ring-navy-200">
                  Self-serve coming soon
                </span>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-navy-600">Setup fee</dt>
                  <dd className="font-semibold text-navy-900">£{setupFee}</dd>
                  <dt className="text-navy-600">Monthly</dt>
                  <dd className="font-semibold text-navy-900">
                    £{monthlyFee}/mo
                    {foundingMember && (
                      <span className="ml-2 inline-block rounded-full bg-ember-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ember-700">
                        Founding rate
                      </span>
                    )}
                  </dd>
                </dl>
                <p className="mt-3 text-xs text-navy-600">
                  Card management, invoices and pause/cancel will live
                  here once Stripe is wired up. For now reply to any
                  email I&apos;ve sent.
                </p>
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
                Want to cancel?{" "}
                <a
                  href={`mailto:${site.contactEmail}?subject=Cancellation%20-%20${encodeURIComponent(business || name)}`}
                  className="link"
                >
                  Email me with &ldquo;Cancellation&rdquo; in the
                  subject
                </a>{" "}
                and I&apos;ll start the 30-day notice straight away.
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

function ChangeRequestsBlock({
  token,
  requests,
  cap,
  onSubmitted,
  onRetracted,
  id,
  defaultOpen = false,
}: {
  token: string;
  requests: ChangeRequest[];
  /** Effective monthly cap (default + any admin-granted bonus this
   *  month). The block displays this number in the usage pill,
   *  the at-cap banner and the friendly intro paragraph. */
  cap: number;
  onSubmitted: (req: ChangeRequest) => void;
  onRetracted: (id: string) => void;
  /** DOM id on the outer <details>. Lets the dashboard timeline
   *  rail target this block for smooth-scroll + open. */
  id?: string;
  /** Whether the block starts expanded. Defaults to false so the
   *  dashboard starts as a compact accordion. */
  defaultOpen?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const usedThisMonth = countActiveChangeRequestsThisMonth(requests);
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
          <label className="block">
            <span className="block text-sm font-semibold text-navy-900">
              What would you like changed? (one item)
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

          {error && (
            <p className="mt-3 text-sm text-ember-700" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="mt-3 text-sm text-green-700" role="status">
              {success}
            </p>
          )}

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

      {requests.length > 0 && (
        <div className="mt-7 border-t border-navy-100 pt-6">
          <h3 className="font-serif text-base font-semibold text-navy-900">
            Your requests
          </h3>
          <ul className="mt-3 space-y-3">
            {requests.map((r) => (
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
