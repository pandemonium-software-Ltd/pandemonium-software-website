"use client";

// Onboarding Hub — Step 3: Modules.
//
// Replaces the old "Connect your tools" step. Customer-purchased
// modules each get their own collapsible card with a clear RAG
// status (red / amber / green). Cards default-expanded if not
// complete, default-collapsed if complete — so the customer scans
// the page and sees what still needs work.
//
// Sub-modules (only render if the corresponding module was bought):
//   - Sender email — Resend (Newsletter OR Enquiry Form)
//   - Online booking — Cal.com (Online Booking)
//   - Google Business Profile (GBP addon)
//   - Newsletter widget config (Newsletter)
//   - Offers strip config (Offers)
//
// Newsletter + Offers config used to live in Step 4 Content but
// moved here (May 2026) so module setup is colocated with the
// "what did I buy" mental model. Same data slice (content.newsletter
// / content.offers), just a different mount point — see /admin/[token]
// pipeline panel for the chronology if this looks surprising.
//
// Step 3 itself is hidden from the wizard if the customer bought
// none of the five. See deriveStepList in lib/onboarding.ts.

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  calculateModuleDelta,
  MODULE_OPTIONS,
  type ChangeEligibility,
  type ModuleOption,
} from "@/lib/billing/module-policy";
import type { ModuleChangeLogEntry } from "@/lib/notion-prospects";
import type { OfferEntry } from "@/lib/onboarding";
import Step4OfferSection from "@/components/onboarding/Step4OfferSection";
import Step4NewsletterSection from "@/components/onboarding/Step4NewsletterSection";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  /** Email customers invite as Resend / GBP team member. */
  benEmail: string;
  /** Prospect's purchased module names. */
  modules: string[];
  /** Prospect's founding-member flag — drives the fee delta calc
   *  in the re-selector (founding rate is flat). */
  foundingMember: boolean;
  /** Prospect token — used by the re-selector to POST changes. */
  token: string;
  /** Result of canChangeModules() from the policy module. Drives
   *  the re-selector's enabled / disabled / locked rendering. */
  moduleChangeEligibility: ChangeEligibility;
  /** Latest pending entry from the change log, if any. When set,
   *  the re-selector shows the in-flight state instead of the
   *  picker. */
  pendingModuleChange: ModuleChangeLogEntry | null;
  /** Onboarding content slice — used by Newsletter + Offers
   *  config sections. Same shape Step 4 Content has access to;
   *  only the newsletter + offers keys are read here. */
  contentData: Record<string, unknown>;
  /** Customer's domain (from Step 2). Used as the right-hand side
   *  of the newsletter "From line" preview ("news@yourdomain"). */
  customerDomain: string;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
  /** Save a patch into the `content` slice (not `tools`). Used
   *  by the Newsletter + Offers sections — their data lives under
   *  content.newsletter / content.offers because the customer-
   *  site adapter reads it from there. */
  saveContentPartial: (patch: Record<string, unknown>) => Promise<boolean>;
  /** When set, render ONLY the matching module's setup card
   *  (single-module focused mode). Driven by a `?focus=<module>`
   *  query param on the URL — used when the post-launch dashboard
   *  routes a customer here to set up one newly-added module. */
  focusModule?: string;
};

const RESEND_SIGNUP_URL = "https://resend.com/signup";
const RESEND_TEAM_HELP_URL =
  "https://resend.com/docs/dashboard/teams/introduction";
// UK customers get routed to cal.eu (EU instance, GDPR data
// residency); rest of world stays on cal.com. Linking to cal.eu/signup
// directly skips the redirect for our UK-focused customer base.
// Help docs are served from cal.com regardless of instance.
const CALCOM_SIGNUP_URL = "https://cal.eu/signup";
const CALCOM_EVENTS_HELP_URL =
  "https://cal.com/help/setting-up-event-types";
const GBP_HOME_URL = "https://business.google.com";
const GBP_MANAGER_HELP_URL =
  "https://support.google.com/business/answer/3403100";

const GBP_URL_HOSTS = [
  "maps.app.goo.gl",
  "goo.gl",
  "g.page",
  "google.com",
  "google.co.uk",
  "www.google.com",
  "www.google.co.uk",
  "search.google.com",
  "business.google.com",
];

function isGbpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const host = new URL(trimmed).hostname;
    return GBP_URL_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

type ModuleStatus = "not-started" | "in-progress" | "complete";

export default function Step3Modules({
  data,
  done,
  readOnly,
  benEmail,
  modules,
  foundingMember,
  token,
  moduleChangeEligibility,
  pendingModuleChange,
  contentData,
  customerDomain,
  savePartial,
  markDone,
  saveContentPartial,
  focusModule,
}: Props) {
  // ---------- Initial state from saved data ----------

  const initialResendEmail =
    typeof data.resendSignupEmail === "string"
      ? data.resendSignupEmail
      : "";
  const initialResendInvited = data.resendInvitedMe === true;
  const initialCalcomUrl =
    typeof data.calcomBookingUrl === "string" ? data.calcomBookingUrl : "";
  const initialGbpUrl = typeof data.gbpUrl === "string" ? data.gbpUrl : "";
  const initialGbpInvited = data.gbpManagerInvited === true;
  const gbpPendingName = typeof data.gbpResolvedName === "string" ? data.gbpResolvedName : null;
  const gbpPendingAddress = typeof data.gbpResolvedAddress === "string" ? data.gbpResolvedAddress : null;
  const gbpHasPending = !!data.gbpPlaceIdPending && !data.gbpPlaceId;
  const gbpIsConfirmed = !!data.gbpPlaceId;
  const gbpResolutionFailed = typeof data.gbpResolutionFailedAt === "string" && data.gbpResolutionFailedAt.length > 0;
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [resendEmail, setResendEmail] = useState(initialResendEmail);
  const [resendInvited, setResendInvited] = useState(initialResendInvited);
  const [calcomUrl, setCalcomUrl] = useState(initialCalcomUrl);
  const [gbpUrl, setGbpUrl] = useState(initialGbpUrl);
  const [gbpInvited, setGbpInvited] = useState(initialGbpInvited);
  const [notes, setNotes] = useState(initialNotes);

  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);

  // Module applicability from the prospect's selections.
  // When focusModule is set (single-module set-up mode from the
  // post-launch dashboard), AND the focus matches a tool-setup
  // module, restrict to just that one — otherwise all bought
  // modules render as normal.
  const focusActive =
    !!focusModule &&
    [
      "Newsletter",
      "Enquiry Form",
      "Online Booking",
      "Google Business Profile Setup/Audit",
      "Offers",
    ].includes(focusModule);
  const hasResend = focusActive
    ? focusModule === "Newsletter" || focusModule === "Enquiry Form"
    : modules.includes("Newsletter") || modules.includes("Enquiry Form");
  const hasCalcom = focusActive
    ? focusModule === "Online Booking"
    : modules.includes("Online Booking");
  const hasGbp = focusActive
    ? focusModule === "Google Business Profile Setup/Audit"
    : modules.includes("Google Business Profile Setup/Audit");
  const hasNewsletter = focusActive
    ? focusModule === "Newsletter"
    : modules.includes("Newsletter");
  const hasOffers = focusActive
    ? focusModule === "Offers"
    : modules.includes("Offers");

  // ---------- Per-module status (drives RAG pills + initial collapse) ----------

  const resendStatus: ModuleStatus = !resendEmail && !resendInvited
    ? "not-started"
    : resendEmail.trim() && resendInvited
      ? "complete"
      : "in-progress";

  const calcomStatus: ModuleStatus = (() => {
    const url = calcomUrl.trim();
    if (!url) return "not-started";
    try {
      const parsed = new URL(url);
      // Accept both cal.com (global) and cal.eu (EU instance — UK
      // customers get routed here for GDPR data residency). Same
      // product, two domains; both serve identical embed widgets.
      const hostnameOk =
        parsed.hostname === "cal.com" ||
        parsed.hostname === "cal.eu" ||
        parsed.hostname === "www.cal.com" ||
        parsed.hostname === "www.cal.eu" ||
        parsed.hostname.endsWith(".cal.com") ||
        parsed.hostname.endsWith(".cal.eu");
      // Require /username/event-slug, not just /username. The
      // profile-only URL (cal.eu/their-name) opens a list of event
      // types, not a booking widget — embedding it on the site
      // would land the visitor on the wrong screen.
      const segments = parsed.pathname.split("/").filter(Boolean);
      const pathOk = segments.length >= 2;
      return hostnameOk && pathOk ? "complete" : "in-progress";
    } catch {
      return "in-progress";
    }
  })();

  const gbpStatus: ModuleStatus = !gbpUrl && !gbpInvited
    ? "not-started"
    : gbpUrl.trim() && isGbpUrl(gbpUrl) && gbpInvited
      ? "complete"
      : "in-progress";

  // ---------- Save / mark-done / update ----------

  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = { notes: notes.trim() };
    if (hasResend) {
      patch.resendSignupEmail = resendEmail.trim();
      patch.resendInvitedMe = resendInvited;
    }
    if (hasCalcom) patch.calcomBookingUrl = calcomUrl.trim();
    if (hasGbp) {
      patch.gbpUrl = gbpUrl.trim();
      patch.gbpManagerInvited = gbpInvited;
      if (gbpResolutionFailed) {
        patch.gbpResolutionFailedAt = null;
        patch.gbpResolutionError = null;
      }
    }
    return patch;
  }

  function validateForDone(): string | null {
    if (hasCalcom && calcomStatus !== "complete") {
      const url = calcomUrl.trim();
      if (!url) {
        return "Please complete the Online booking module — paste your Cal.com event URL.";
      }
      // Distinguish the two failure modes so the customer knows
      // exactly what's wrong: bad host vs. profile-only path.
      try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split("/").filter(Boolean);
        if (segments.length < 2) {
          return "That looks like your Cal.com profile URL — paste the link to a specific event instead (it'll have a slug after your username, e.g. cal.eu/your-name/30min).";
        }
      } catch {
        /* fall through to generic */
      }
      return "That doesn't look like a Cal.com URL — it should start with https://cal.eu/ (or https://cal.com/).";
    }
    if (hasGbp && gbpStatus !== "complete") {
      if (!gbpUrl.trim())
        return "Please complete the Google Business Profile module — paste your Google Maps link.";
      if (!isGbpUrl(gbpUrl))
        return "That doesn't look like a Google Maps or Business Profile link. Search for your business on Google Maps, click Share → Copy link, and paste it here.";
      if (!gbpInvited)
        return "Please tick the box once you've added me as a Manager on your GBP listing.";
    }
    if (hasResend && resendStatus !== "complete") {
      if (!resendEmail.trim())
        return "Please complete the Sender email module — share your Resend signup email.";
      if (!resendInvited)
        return "Please tick the box once you've added me as a team member in Resend.";
    }
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

  const disabled = readOnly;

  // Per-module unlock: when the step is read-only but a paid-for
  // module hasn't finished its customer-side setup (Cal.com URL,
  // Resend invite, GBP URL+invite), we unlock JUST that module's
  // card so the customer can complete it. Triggered by the
  // dashboard's "Set up →" button for post-launch module adds.
  //
  // Lock decisions are based on STORED completeness (what's in
  // Notion when the page loaded), NOT the live React state.
  // Otherwise the moment the customer starts typing the fields,
  // local state flips to "complete" → section re-locks → Update
  // button disappears → save is impossible. Latch behaviour:
  // once unlocked for a session, stays unlocked until reload.
  // "Complete enough to not need unlock" — a non-empty URL is
  // sufficient. Full Cal.com URL validation happens in calcomStatus
  // (live state). If invalid, customer will see the in-progress
  // badge and can still save.
  const calcomInitiallyComplete = !!initialCalcomUrl.trim();
  const resendInitiallyComplete =
    !!initialResendEmail.trim() && initialResendInvited === true;
  const gbpInitiallyComplete =
    !!initialGbpUrl.trim() && initialGbpInvited === true;
  const calcomDisabled = disabled && calcomInitiallyComplete;
  const resendDisabled = disabled && resendInitiallyComplete;
  const gbpDisabled = disabled && gbpInitiallyComplete;
  // True when at least one module's setup is unlocked — drives
  // the post-Done "Update saved data" button so the customer
  // can save the newly-filled setup back to Notion.
  const hasUnlockedModule =
    (hasCalcom && !calcomDisabled) ||
    (hasResend && !resendDisabled) ||
    (hasGbp && !gbpDisabled);

  // ---------- Header copy ----------

  const moduleCount =
    (hasResend ? 1 : 0) + (hasCalcom ? 1 : 0) + (hasGbp ? 1 : 0);
  const completeCount =
    (hasResend && resendStatus === "complete" ? 1 : 0) +
    (hasCalcom && calcomStatus === "complete" ? 1 : 0) +
    (hasGbp && gbpStatus === "complete" ? 1 : 0);

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
              Step 3
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
              Modules
            </h2>
          </div>
          <span className="text-sm font-semibold text-navy-700">
            {completeCount} of {moduleCount} complete
          </span>
        </div>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          Set up the modules you bought. Each card below is its own
          mini-step — green when complete, red when nothing&apos;s
          started yet, amber if there&apos;s some way to go. Click a
          card&apos;s header to expand or collapse.
        </p>
      </header>

      {/* Module re-selector — replaces the old "email me to change
          modules" callout (commit a99df725). Customer can now
          self-service one module change pre-commit; charge / refund
          is currently a manual operator step (see /admin/[token])
          but the architecture is wired for the Stage 2A Part 2
          auto-Stripe path (see docs/STRIPE-PHASE-2.md). */}
      <ModuleReSelector
        currentModules={modules}
        foundingMember={foundingMember}
        token={token}
        eligibility={moduleChangeEligibility}
        pendingChange={pendingModuleChange}
      />

      {/* Per-card id chain so each ModuleCard's Confirm button knows
       *  which sibling to scroll to. Computed from the customer's
       *  actual module selection (Cal.com only renders if they bought
       *  Online Booking, etc.) so the chain skips absent modules. */}
      <section className="mt-7 space-y-4">
        {(() => {
          const renderedIds: string[] = [];
          if (hasCalcom) renderedIds.push("module-calcom");
          if (hasResend) renderedIds.push("module-resend");
          if (hasGbp) renderedIds.push("module-gbp");
          const nextOf = (id: string): string | undefined => {
            const idx = renderedIds.indexOf(id);
            if (idx === -1 || idx === renderedIds.length - 1) return undefined;
            return renderedIds[idx + 1];
          };
          return (
            <>
              {hasCalcom && (
                <ModuleCard
                  cardId="module-calcom"
                  nextSectionId={nextOf("module-calcom")}
                  title="Online booking"
                  subtitle="Cal.com"
                  status={calcomStatus}
                  info={[
                    "Cal.com booking widget embedded on your site",
                    "Visitors book directly from your homepage",
                    "Syncs with your Google or Outlook calendar",
                    "Configurable availability, buffer time and booking limits",
                  ]}
                >
                  <ModuleCalcom
                    url={calcomUrl}
                    onUrlChange={setCalcomUrl}
                    disabled={calcomDisabled}
                  />
                </ModuleCard>
              )}

              {hasResend && (
                <ModuleCard
                  cardId="module-resend"
                  nextSectionId={nextOf("module-resend")}
                  title="Sender email"
                  subtitle="Resend"
                  status={resendStatus}
                  info={[
                    "Professional sender address (e.g. news@yourdomain.co.uk)",
                    "Full DKIM and SPF authentication on your domain",
                    "Powers your enquiry form notifications and newsletter sends",
                    "Deliverability tracking built into your dashboard",
                  ]}
                >
                  <ModuleResend
                    email={resendEmail}
                    invited={resendInvited}
                    onEmailChange={setResendEmail}
                    onInvitedChange={setResendInvited}
                    benEmail={benEmail}
                    disabled={resendDisabled}
                  />
                </ModuleCard>
              )}

              {hasGbp && (
                <ModuleCard
                  cardId="module-gbp"
                  nextSectionId={nextOf("module-gbp")}
                  title="Google Business Profile"
                  subtitle="business.google.com"
                  status={gbpStatus}
                  info={[
                    "Full GBP audit with category, description and photo recommendations",
                    "Weekly automated audits emailed to your account manager",
                    "Live Google reviews pulled onto your website daily",
                    "Star ratings marked up for Google search result rich snippets",
                  ]}
                >
                  {gbpResolutionFailed && !gbpHasPending && !gbpIsConfirmed && (
                    <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-semibold">
                        We couldn&apos;t find your business on Google Maps
                      </p>
                      <p className="mt-1">
                        Double-check the link you pasted — search for your
                        business on Google Maps, tap <strong>Share</strong>,
                        copy the link and paste it below. Once you save, we&apos;ll
                        try again automatically.
                      </p>
                    </div>
                  )}
                  <ModuleGbp
                    url={gbpUrl}
                    invited={gbpInvited}
                    pendingName={gbpPendingName}
                    pendingAddress={gbpPendingAddress}
                    hasPending={gbpHasPending}
                    isConfirmed={gbpIsConfirmed}
                    onConfirmListing={async () => {
                      setPending("save");
                      await savePartial({ gbpListingConfirmed: true });
                      setPending("none");
                    }}
                    onRejectListing={async () => {
                      setPending("save");
                      await savePartial({
                        gbpPlaceIdPending: null,
                        gbpResolvedName: null,
                        gbpResolvedAddress: null,
                        gbpListingConfirmed: null,
                        gbpUrl: "",
                      });
                      setGbpUrl("");
                      setGbpInvited(false);
                      setPending("none");
                    }}
                    onUrlChange={setGbpUrl}
                    onInvitedChange={setGbpInvited}
                    benEmail={benEmail}
                    disabled={gbpDisabled}
                  />
                </ModuleCard>
              )}
            </>
          );
        })()}

        {/* Offers — moved from Step 4 Content May 2026. Self-
         *  contained card with its own save button (writes into
         *  content.offers, not tools). Optional — never gates
         *  "mark done"; customer can ship without setting one and
         *  add their first offer post-launch via the dashboard. */}
        {hasOffers && (
          <Step4OfferSection
            current={
              (contentData as { offers?: { current?: OfferEntry } }).offers
                ?.current
            }
            readOnly={readOnly}
            onSave={async (entry) => {
              const prevOffers = (contentData as {
                offers?: { current?: OfferEntry; history?: OfferEntry[] };
              }).offers;
              const prevCurrent = prevOffers?.current;
              const history = prevOffers?.history ?? [];
              let nextOffers: {
                current?: OfferEntry;
                history?: OfferEntry[];
              };
              if (entry === null) {
                nextOffers = {
                  current: undefined,
                  history: prevCurrent
                    ? [prevCurrent, ...history].slice(0, 24)
                    : history,
                };
              } else if (prevCurrent && prevCurrent.id !== entry.id) {
                nextOffers = {
                  current: entry,
                  history: [prevCurrent, ...history].slice(0, 24),
                };
              } else {
                nextOffers = { current: entry, history };
              }
              return saveContentPartial({ offers: nextOffers });
            }}
          />
        )}

        {/* Newsletter widget config — sender name, sender local-
         *  part, widget headline / body / CTA. Same migration note
         *  as Offers above. saveContentPartial writes to
         *  content.newsletter.config; the subscribers / drafts /
         *  history arrays are preserved untouched. */}
        {hasNewsletter && (
          <Step4NewsletterSection
            current={
              (contentData as { newsletter?: { config?: Record<string, unknown> } })
                .newsletter?.config
            }
            customerDomain={customerDomain}
            readOnly={readOnly}
            onSave={async (config) => {
              const prev = (contentData as {
                newsletter?: {
                  subscribers?: unknown[];
                  drafts?: unknown[];
                  history?: unknown[];
                };
              }).newsletter;
              const nextNewsletter = {
                config,
                subscribers: prev?.subscribers ?? [],
                drafts: prev?.drafts ?? [],
                history: prev?.history ?? [],
              };
              return saveContentPartial({ newsletter: nextNewsletter });
            }}
          />
        )}
      </section>

      {/* ---------- Notes + buttons ---------- */}
      <section className="mt-7">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Anything I should know? (optional)
          </span>
          <textarea
            value={notes}
            disabled={disabled}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. my GBP is still pending Google verification — should be cleared by next week"
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
          <>
            <p className="text-sm text-green-700" role="status">
              <strong>Done.</strong> Edit above and click Update if
              anything changes.
            </p>
            {(!readOnly || hasUnlockedModule) && (
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

// ---------- Collapsible module shell ----------

function ModuleCard({
  cardId,
  nextSectionId,
  title,
  subtitle,
  status,
  info,
  children,
}: {
  cardId: string;
  nextSectionId?: string;
  title: string;
  subtitle: string;
  status: ModuleStatus;
  info?: string[];
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(status !== "complete");

  function handleConfirm() {
    setExpanded(false);
    if (!nextSectionId) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(nextSectionId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  return (
    <div
      id={cardId}
      className={[
        "overflow-hidden rounded-2xl border-2 transition-colors scroll-mt-6",
        status === "complete"
          ? "border-green-200 bg-green-50/40"
          : status === "in-progress"
            ? "border-orange-200 bg-orange-50/40"
            : "border-red-200 bg-red-50/30",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/40"
      >
        <ModuleStatusBadge status={status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-serif text-lg font-semibold text-navy-900">
              {title}
            </p>
            {info && <InfoButton items={info} />}
          </div>
          <p className="text-xs text-navy-500">{subtitle}</p>
        </div>
        <Chevron expanded={expanded} />
      </button>
      {expanded && (
        <div className="border-t border-navy-100/60 bg-white px-5 py-5 md:px-6 md:py-6">
          {children}
          {/* Confirm-and-collapse button (added 2026-05-14). Customer
           *  finishes configuring this module, clicks Confirm, the
           *  card collapses and the page smooth-scrolls down to the
           *  next module card (if there is one). Doesn't auto-save —
           *  the page-level Save / Mark Done / Update buttons in the
           *  footer keep their existing semantics. State is local
           *  only; collapsing never loses input. */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-navy-100 pt-4">
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:bg-navy-800"
            >
              ✓ Confirm{nextSectionId ? " — next module" : " — collapse"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  const tone =
    status === "complete"
      ? { dot: "bg-green-500", pill: "bg-green-100 text-green-800" }
      : status === "in-progress"
        ? { dot: "bg-orange-500", pill: "bg-orange-100 text-orange-800" }
        : { dot: "bg-red-500", pill: "bg-red-100 text-red-800" };
  const label =
    status === "complete"
      ? "Complete"
      : status === "in-progress"
        ? "In progress"
        : "Not started";
  return (
    <span
      className={`inline-flex flex-none items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${tone.pill}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={[
        "flex-none text-navy-500 transition-transform",
        expanded ? "rotate-180" : "",
      ].join(" ")}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoButton({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="What's included"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-navy-300 text-[11px] font-bold leading-none text-navy-500 transition-colors hover:border-navy-500 hover:text-navy-700"
      >
        i
      </button>
      {open && (
        <>
          {/* Backdrop — closes popover on tap-away */}
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-xl border border-navy-200 bg-white p-4 shadow-lg sm:w-72">
            <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              What&apos;s included
            </p>
            <ul className="mt-2 space-y-1.5">
              {items.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 text-[0.8rem] leading-snug text-navy-700"
                >
                  <span className="mt-0.5 flex-none text-green-600">&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Module: Cal.com ----------

function ModuleCalcom({
  url,
  onUrlChange,
  disabled,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <p className="text-[0.95rem] leading-relaxed text-navy-700">
        Set up a free Cal.com booking page and paste the link to the
        specific <strong>event</strong> you want bookable from your
        website. I&apos;ll embed it so visitors can book in one click.
        No team invite needed — Cal.com runs entirely in your account.
      </p>

      <ol className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-navy-700">
        <li className="flex gap-3">
          <Bullet n={1} />
          <span>
            Open{" "}
            <a
              href={CALCOM_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              cal.eu/signup
            </a>{" "}
            and create a free account. (UK customers get the EU
            instance at <code>cal.eu</code> for GDPR compliance — same
            product as <code>cal.com</code>, both work for our embed.)
            Pick a username that fits your business — it becomes part
            of every booking URL (e.g.{" "}
            <code>cal.eu/<strong>your-business</strong>/30min</code>).
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={2} />
          <span>
            <strong>Verify your email.</strong> Cal.com sends a
            confirmation link the moment you sign up — open it before
            going further. <em>Check your spam / junk folder</em> if
            it doesn&apos;t show up in a minute.
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={3} />
          <span>
            <strong>Connect your calendar.</strong> Click{" "}
            <strong>Apps</strong> in the left sidebar, then{" "}
            <strong>App store</strong>. Find the <strong>Calendar</strong>{" "}
            category (in &ldquo;Featured categories&rdquo;) and pick the
            calendar you actually use — most likely{" "}
            <strong>Google Calendar</strong> (if you use Gmail) or{" "}
            <strong>Outlook Calendar</strong> (if you use Microsoft /
            Office 365). Click <strong>Install</strong>, then{" "}
            <strong>Allow / Authorise</strong> on the pop-up. That&apos;s
            it — Cal.com now pulls your busy times so it never
            double-books you.
            <span className="mt-2 block rounded-lg border border-navy-100 bg-cream-50 p-3 text-[0.85rem] text-navy-600">
              <strong>Tip:</strong> Skip Google Meet, Conferencing,
              Analytics, etc. — you don&apos;t need them unless you
              run video consultations. You can always add them later.
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={4} />
          <span>
            <strong>Set your working hours.</strong> Click{" "}
            <strong>Availability</strong> in the left sidebar. The
            default is Mon-Fri 9am-5pm — adjust the days + times to
            when you actually take bookings (e.g. Tue-Sat 10am-6pm).
            Save. Every event you create uses this by default; you
            can override per-event later if needed.
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={5} />
          <span>
            <strong>Create your booking event.</strong> Click{" "}
            <strong>Event Types</strong> in the left sidebar →{" "}
            <strong>+ New</strong>. You&apos;ll see a sidebar with
            several sections (Basics, Availability, Limits, Advanced,
            etc.) — fill in only these three, ignore the rest:
            <span className="mt-3 block space-y-2.5 text-[0.9rem]">
              <span className="block rounded-lg border border-navy-100 bg-white p-3">
                <strong className="text-navy-900">
                  ✏️ Basics
                </strong>
                <span className="mt-1 block text-navy-700">
                  Give it a clear customer-facing name (e.g.
                  &ldquo;30-minute consultation&rdquo;, &ldquo;Free
                  quote call&rdquo;, &ldquo;Garden visit&rdquo;).
                  Pick a duration (30 or 60 mins is typical).
                </span>
              </span>
              <span className="block rounded-lg border border-navy-100 bg-white p-3">
                <strong className="text-navy-900">
                  📅 Availability
                </strong>
                <span className="mt-1 block text-navy-700">
                  Leave this on &ldquo;Working hours&rdquo; — uses the
                  schedule you just set. Only change it if THIS event
                  has different hours from your normal work (rare).
                </span>
              </span>
              <span className="block rounded-lg border border-navy-100 bg-white p-3">
                <strong className="text-navy-900">
                  🕐 Limits
                </strong>
                <span className="mt-1 block text-navy-700">
                  Recommended caps to stop your day getting hammered:
                  set a <em>buffer time</em> of 15-30 min before AND
                  after each booking (gives you travel + tidy-up
                  time). Optionally cap bookings per day (e.g.{" "}
                  <strong>max 4 bookings per day</strong>). Skip the
                  rest.
                </span>
              </span>
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={6} />
          <span>
            <strong>Copy the link to that event</strong> — NOT your
            profile URL. On the Event Types page, hover the row for
            the event you just created and click the{" "}
            <strong>copy / link icon</strong>. Or open the event and
            copy the URL from the top-right share button. It will
            look like:
            <code className="mt-2 block break-all rounded-lg bg-cream-50 px-3 py-2 font-mono text-[0.85rem]">
              https://cal.eu/your-name/<strong>30min-consultation</strong>
            </code>
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={7} />
          <span>Paste the event link into the box below.</span>
        </li>
      </ol>

      {/* Collapsible optional-sections — keeps the main flow short
          while letting the curious customer dig deeper. */}
      <details className="mt-5 rounded-2xl border-2 border-navy-100 bg-white">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-navy-900 hover:bg-cream-50">
          Optional: the other sidebar sections (Advanced, Apps,
          Workflows, etc.)
        </summary>
        <div className="space-y-3 px-5 pb-5 text-[0.9rem] leading-relaxed text-navy-700">
          <p>
            When you open an event you&apos;ll see more options in the
            sidebar. Here&apos;s what they do, in plain English:
          </p>
          <div className="rounded-lg bg-cream-50 p-3">
            <p className="font-semibold text-navy-900">
              ⚙️ Advanced
            </p>
            <p className="mt-1">
              Where the booking happens (in-person, phone, Google
              Meet etc.), and what extra questions customers answer
              when they book. Useful additions: <em>phone number</em>{" "}
              (so you can call if they no-show), <em>address</em> (if
              you visit them). For most one-off bookings, the defaults
              are fine.
            </p>
          </div>
          <div className="rounded-lg bg-cream-50 p-3">
            <p className="font-semibold text-navy-900">
              🔌 Apps
            </p>
            <p className="mt-1">
              Turn on extra integrations for THIS event. The two
              you&apos;d normally use:
              <em>Google Meet</em> (if it&apos;s a video call —
              auto-creates the meeting link) or <em>Stripe</em> (if
              you charge a booking deposit). Skip the rest.
            </p>
          </div>
          <div className="rounded-lg bg-cream-50 p-3">
            <p className="font-semibold text-navy-900">
              ⚡ Workflows
            </p>
            <p className="mt-1">
              Automated reminders + follow-ups. Worth adding ONE:
              an SMS or email reminder 24 hours before the booking
              cuts no-shows in half. Click <strong>+ Add workflow</strong>{" "}
              → pick the &ldquo;Email reminder&rdquo; template → set
              it to fire 24 hours before. Save. Don&apos;t worry about
              the rest of the workflow options.
            </p>
          </div>
          <div className="rounded-lg bg-navy-50 p-3">
            <p className="font-semibold text-navy-900">
              Sections you can ignore
            </p>
            <ul className="mt-1.5 list-disc pl-4 space-y-1">
              <li>
                <strong>Recurring</strong> — for sessions that repeat
                weekly with the same person (e.g. a coach). Not
                relevant for one-off bookings.
              </li>
              <li>
                <strong>Webhooks</strong> — developer feature for
                wiring Cal.com into another system. You won&apos;t
                need this.
              </li>
            </ul>
          </div>
        </div>
      </details>

      <div className="mt-6 rounded-2xl bg-cream-50 p-5">
        <h4 className="font-serif text-base font-semibold text-navy-900">
          Got more than one Event Type?
        </h4>
        <p className="mt-2 text-sm leading-relaxed text-navy-700">
          Pick the <strong>main one</strong> you want customers to
          book from your website — usually a free discovery call or
          your most popular service. We embed one event so the
          website&apos;s call-to-action is unambiguous; visitors can
          still see your other event types from inside the Cal.com
          page once they&apos;re booking. Want a menu of multiple
          bookable events on the site? Email me after launch and
          I&apos;ll quote it as a small add-on.
        </p>
      </div>

      <p className="mt-4 text-xs text-navy-500">
        Stuck on any step?{" "}
        <a
          href={CALCOM_EVENTS_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="link"
        >
          Cal.com&apos;s help page
        </a>{" "}
        or hit reply to my last email and I&apos;ll walk you through.
        A video walkthrough is coming soon.
      </p>

      <label className="mt-5 block">
        <span className="block text-sm font-semibold text-navy-900">
          Your Cal.com event link
        </span>
        <input
          type="url"
          value={url}
          disabled={disabled}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://cal.eu/your-name/30min-consultation"
          autoComplete="url"
          className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 font-mono text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        <span className="mt-1.5 block text-xs text-navy-500">
          Must look like <code>cal.eu/your-name/event-slug</code>{" "}
          (or <code>cal.com/...</code> — both work). Your profile URL
          alone (just <code>cal.eu/your-name</code>) won&apos;t work
          because it doesn&apos;t open a specific booking flow.
        </span>
      </label>
    </>
  );
}

// ---------- Module: Resend (sender email) ----------

function ModuleResend({
  email,
  invited,
  onEmailChange,
  onInvitedChange,
  benEmail,
  disabled,
}: {
  email: string;
  invited: boolean;
  onEmailChange: (v: string) => void;
  onInvitedChange: (v: boolean) => void;
  benEmail: string;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(benEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }
  return (
    <>
      <p className="text-[0.95rem] leading-relaxed text-navy-700">
        Resend is a free email-sending service. You sign up and add
        me as a team member — I run the technical side from there.
        Your sender email becomes <code>news@yourdomain</code> /{" "}
        <code>forms@yourdomain</code> with full DKIM and SPF set up
        on your existing domain.
      </p>
      <ol className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-navy-700">
        <li className="flex gap-3">
          <Bullet n={1} />
          <span>
            Open{" "}
            <a
              href={RESEND_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              resend.com/signup
            </a>{" "}
            and create a free account. Free tier covers way more
            volume than a small business will ever send.
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={2} />
          <span>
            In Resend, click <strong>Settings</strong> →{" "}
            <strong>Team</strong> → <strong>Invite</strong>. (
            <a
              href={RESEND_TEAM_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Resend&apos;s help
            </a>{" "}
            if you get stuck.)
          </span>
        </li>
        <li className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Bullet n={3} />
            <span>
              Invite this email as an <strong>Admin</strong>:
            </span>
          </div>
          <InviteCallout email={benEmail} copied={copied} onCopy={copy} role="Admin" />
        </li>
        <li className="flex gap-3">
          <Bullet n={4} />
          <span>
            Tell me your Resend signup email below and tick that
            you&apos;ve sent the invite.
          </span>
        </li>
      </ol>
      <label className="mt-5 block">
        <span className="block text-sm font-semibold text-navy-900">
          Your Resend signup email
        </span>
        <input
          type="email"
          value={email}
          disabled={disabled}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@yourbusiness.co.uk"
          autoComplete="email"
          className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
      </label>
      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          checked={invited}
          disabled={disabled}
          onChange={(e) => onInvitedChange(e.target.checked)}
          className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 accent-navy-900"
        />
        <span className="min-w-0 text-[0.95rem] leading-relaxed text-navy-700">
          <span className="font-semibold text-navy-900">
            I&apos;ve added you as a team member in Resend.
          </span>
          <span className="mt-1 block text-xs text-navy-500">
            I&apos;ll get an invitation email from your account once
            you&apos;ve sent it.
          </span>
        </span>
      </label>
    </>
  );
}

// ---------- Module: Google Business Profile ----------

function ModuleGbp({
  url,
  invited,
  onUrlChange,
  onInvitedChange,
  benEmail,
  disabled,
  pendingName,
  pendingAddress,
  hasPending,
  isConfirmed,
  onConfirmListing,
  onRejectListing,
}: {
  url: string;
  invited: boolean;
  onUrlChange: (v: string) => void;
  onInvitedChange: (v: boolean) => void;
  benEmail: string;
  disabled: boolean;
  pendingName: string | null;
  pendingAddress: string | null;
  hasPending: boolean;
  isConfirmed: boolean;
  onConfirmListing: () => void;
  onRejectListing: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(benEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }
  return (
    <>
      <p className="text-[0.95rem] leading-relaxed text-navy-700">
        Your GBP is how most local customers find you in Google
        Search and Maps. I&apos;ll audit yours (or set one up if you
        don&apos;t have one), pick the right categories, write a
        search-friendly description, fill in opening hours, services
        and photos.
      </p>
      <p className="mt-3 rounded-lg border border-brand-primary-100 bg-brand-primary-50 p-3 text-[0.9rem] leading-relaxed text-brand-primary-900">
        <strong>Bonus included with your monthly:</strong> once
        you&apos;ve added me as a Manager (steps below), your top
        Google reviews will be pulled onto your site automatically
        and refreshed every day. No copying-pasting; star ratings
        also light up in Google search results, helping click-through.
      </p>
      <ol className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-navy-700">
        <li className="flex gap-3">
          <Bullet n={1} />
          <span>
            Go to your Business Profile (sign in at{" "}
            <a
              href={GBP_HOME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              business.google.com
            </a>
            ). If you don&apos;t have a listing yet, click{" "}
            <strong>Add your business to Google</strong> and follow
            the verification steps first.
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={2} />
          <span>
            Select <strong>More</strong> →{" "}
            <strong>Business Profile settings</strong> →{" "}
            <strong>People and access</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <Bullet n={3} />
          <span>
            At the top left, select <strong>Add</strong> →{" "}
            <strong>Invite new users</strong>.
          </span>
        </li>
        <li className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Bullet n={4} />
            <span>
              Enter this email. Under <strong>Access</strong>, select{" "}
              <strong>Manager</strong>. Click <strong>Invite</strong>.
            </span>
          </div>
          <InviteCallout
            email={benEmail}
            copied={copied}
            onCopy={copy}
            role="Manager"
          />
        </li>
        <li className="flex gap-3">
          <Bullet n={5} />
          <span>
            Paste your GBP URL below and tick that you&apos;ve added
            me. (
            <a
              href={GBP_MANAGER_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Google&apos;s help on adding users
            </a>
            .)
          </span>
        </li>
      </ol>
      <div className="mt-4 rounded-xl bg-cream-50 p-4 text-xs leading-relaxed text-navy-600">
        <p className="font-semibold text-navy-900">
          Pick Manager, not Owner.
        </p>
        <p className="mt-1.5">
          Manager gives us everything we need to audit and update the
          listing. Owner would let us transfer the listing&apos;s
          primary ownership — which we&apos;d never do, but the
          option shouldn&apos;t exist in the first place.
        </p>
      </div>
      <label className="mt-5 block">
        <span className="block text-sm font-semibold text-navy-900">
          Your Google Business Profile link
        </span>
        <p className="mt-1.5 text-[0.85rem] leading-relaxed text-navy-600">
          The easiest way: search for your business on{" "}
          <a
            href="https://www.google.com/maps"
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            Google Maps
          </a>
          , click your listing, then hit the <strong>Share</strong>{" "}
          button and <strong>Copy link</strong>. Paste it below.
        </p>
        <input
          type="url"
          value={url}
          disabled={disabled}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://maps.app.goo.gl/abc123 or https://goo.gl/maps/..."
          autoComplete="url"
          className="mt-2 w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-3 font-mono text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
        />
        {url.trim() !== "" && !isGbpUrl(url) && (
          <span className="mt-1.5 block text-xs font-medium text-red-600">
            That doesn&apos;t look like a Google Maps or Business Profile
            link. Please paste the link you get from the Share button on
            your Google Maps listing.
          </span>
        )}
        {(url.trim() === "" || isGbpUrl(url)) && (
          <span className="mt-1.5 block text-xs text-navy-500">
            Accepted formats: maps.app.goo.gl/…, google.com/maps/…,
            g.page/…, or search.google.com/local/… share links.
          </span>
        )}
      </label>
      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          checked={invited}
          disabled={disabled}
          onChange={(e) => onInvitedChange(e.target.checked)}
          className="mt-1 h-5 w-5 flex-none rounded border-2 border-navy-300 accent-navy-900"
        />
        <span className="min-w-0 text-[0.95rem] leading-relaxed text-navy-700">
          <span className="font-semibold text-navy-900">
            I&apos;ve added you as a Manager on my GBP listing.
          </span>
        </span>
      </label>

      {/* Listing confirmation card — shown after cron resolves the
          place_id but before we latch it. Customer confirms this is
          their business to prevent wrong-listing latches. */}
      {hasPending && pendingName && (
        <div className="mt-5 rounded-xl border-2 border-ember-300 bg-ember-50 p-4">
          <p className="text-sm font-semibold text-navy-900">
            We found this listing — is it yours?
          </p>
          <div className="mt-2 rounded-lg bg-white p-3 shadow-card">
            <p className="text-base font-semibold text-navy-900">
              {pendingName}
            </p>
            {pendingAddress && (
              <p className="mt-0.5 text-sm text-navy-600">
                {pendingAddress}
              </p>
            )}
          </div>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={onConfirmListing}
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
            >
              Yes, that&apos;s my business
            </button>
            <button
              type="button"
              onClick={onRejectListing}
              className="rounded-lg border-2 border-navy-300 bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-cream-50"
            >
              Not mine — try again
            </button>
          </div>
        </div>
      )}

      {isConfirmed && (
        <div className="mt-5 rounded-xl border-2 border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">
            Listing confirmed — your Google reviews are being connected
            to your site. You&apos;ll get a confirmation email shortly.
          </p>
        </div>
      )}
    </>
  );
}

// ---------- Shared bits ----------

function Bullet({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-navy-900 font-serif text-xs font-semibold text-white"
    >
      {n}
    </span>
  );
}

function InviteCallout({
  email,
  copied,
  onCopy,
  role,
}: {
  email: string;
  copied: boolean;
  onCopy: () => void;
  role: string;
}) {
  return (
    <div className="ml-9 rounded-xl border-2 border-navy-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-navy-500">
        Invite this email
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code className="break-all rounded-lg bg-cream-50 px-3 py-1.5 font-mono text-base text-navy-900">
          {email}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-navy-600">
        Role to pick: <strong>{role}</strong>
      </p>
    </div>
  );
}

// ---------- Module re-selector ----------
//
// The customer can change their module mix exactly ONCE before
// launch (see src/lib/billing/module-policy.ts for the rules).
// Three render paths:
//   1. pendingChange present  → in-flight UI (amber callout)
//   2. eligibility.allowed=false → locked (cream callout, reason text)
//   3. default → "Re-select modules" link → opens picker
// Picker has live fee delta + Confirm button → POSTs to
// /api/onboarding/module-change → page reloads on success.
function ModuleReSelector({
  currentModules,
  foundingMember,
  token,
  eligibility,
  pendingChange,
}: {
  currentModules: string[];
  foundingMember: boolean;
  token: string;
  eligibility: ChangeEligibility;
  pendingChange: ModuleChangeLogEntry | null;
}) {
  const [picking, setPicking] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(
    new Set(currentModules),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Live delta — recalculated whenever the customer ticks/unticks.
  // Shows "no change" until they actually move something.
  const delta = useMemo(
    () =>
      calculateModuleDelta({
        fromModules: currentModules,
        toModules: [...selection],
        foundingMember,
      }),
    [currentModules, selection, foundingMember],
  );

  function toggle(option: ModuleOption) {
    const next = new Set(selection);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    setSelection(next);
  }

  async function handleConfirm() {
    if (delta.isNoOp) {
      setError(
        "Nothing's changed yet — tick or untick something before confirming.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/module-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newModules: [...selection] }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Couldn't process. Try again.");
        return;
      }
      setSubmitted(true);
      // Reload so server-side hydration picks up the new pending
      // entry + locked-round state — clean transition into the
      // in-flight UI without prop juggling.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't process. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // --- Pending change in flight ---
  if (pendingChange) {
    const added = pendingChange.toModules.filter(
      (m) => !pendingChange.fromModules.includes(m),
    );
    const removed = pendingChange.fromModules.filter(
      (m) => !pendingChange.toModules.includes(m),
    );
    return (
      <aside className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
        <h3 className="font-serif text-base font-semibold text-navy-900">
          Module change in progress
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-navy-700">
          You requested a module change on{" "}
          {new Date(pendingChange.submittedAt).toLocaleDateString(
            "en-GB",
            { day: "numeric", month: "short", year: "numeric" },
          )}
          . I&apos;m processing the payment side now — usually within one
          working day. You&apos;ll get an email once it&apos;s confirmed
          and your modules will update on this page automatically.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-navy-700">
          {added.length > 0 && (
            <li>
              <strong>Adding:</strong> {added.join(", ")}
            </li>
          )}
          {removed.length > 0 && (
            <li>
              <strong>Removing:</strong> {removed.join(", ")}
            </li>
          )}
          <li>
            <strong>New monthly:</strong> £{pendingChange.newMonthlyTotal}/mo
          </li>
        </ul>
      </aside>
    );
  }

  // --- Not allowed (round used / preview submitted / wrong status) ---
  if (!eligibility.allowed) {
    return (
      <aside className="mt-5 rounded-2xl border border-cream-200 bg-cream-50 p-4">
        <p className="text-sm leading-relaxed text-navy-700">
          <strong>Module changes are locked.</strong>{" "}
          {eligibility.message}
        </p>
      </aside>
    );
  }

  // --- Picker open ---
  if (picking) {
    return (
      <aside className="mt-5 rounded-2xl border-2 border-navy-300 bg-white p-5">
        <h3 className="font-serif text-base font-semibold text-navy-900">
          Re-select your modules
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-navy-600">
          You can do this <strong>once</strong>. Tick / untick to change
          your mix; we&apos;ll calculate the difference below. Confirming
          uses your one allowed change — make sure it&apos;s right
          before you click.
        </p>

        <fieldset className="mt-4 grid gap-2" disabled={submitting || submitted}>
          {MODULE_OPTIONS.map((option) => {
            const checked = selection.has(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy-200 bg-cream-50 px-4 py-3 transition-colors hover:border-navy-400"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="mt-1"
                />
                <span className="text-sm text-navy-900">{option}</span>
              </label>
            );
          })}
        </fieldset>

        {/* Live delta */}
        <div className="mt-4 space-y-1 rounded-xl bg-cream-50 p-4 text-sm text-navy-700">
          {delta.isNoOp ? (
            <p>
              <em>
                No change yet — tick or untick something to see the
                difference.
              </em>
            </p>
          ) : (
            <>
              {delta.added.length > 0 && (
                <p>
                  <strong>Adding:</strong> {delta.added.join(", ")}
                </p>
              )}
              {delta.removed.length > 0 && (
                <p>
                  <strong>Removing:</strong> {delta.removed.join(", ")}
                </p>
              )}
              <p className="mt-2 border-t border-navy-100 pt-2">
                <strong>Setup:</strong>{" "}
                {delta.setupDelta > 0
                  ? `+£${delta.setupDelta} (one-off charge)`
                  : delta.setupDelta < 0
                    ? `−£${Math.abs(delta.setupDelta)} (refund)`
                    : "no change"}
              </p>
              <p>
                <strong>Monthly:</strong>{" "}
                {delta.monthlyDelta > 0
                  ? `+£${delta.monthlyDelta}/mo`
                  : delta.monthlyDelta < 0
                    ? `−£${Math.abs(delta.monthlyDelta)}/mo`
                    : "no change"}
              </p>
              <p className="mt-2 border-t border-navy-100 pt-2">
                <strong>New totals:</strong> £{delta.toFees.setup}{" "}
                setup, £{delta.toFees.monthly}/mo
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setPicking(false);
              setSelection(new Set(currentModules));
              setError(null);
            }}
            disabled={submitting || submitted}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={delta.isNoOp || submitting || submitted}
            className="btn-primary"
          >
            {submitted
              ? "Submitted ✓"
              : submitting
                ? "Submitting…"
                : "Confirm change"}
          </button>
        </div>
      </aside>
    );
  }

  // --- Default: collapsed pitch + open-picker link ---
  return (
    <aside className="mt-5 rounded-2xl border border-cream-200 bg-cream-50 p-4">
      <p className="text-sm leading-relaxed text-navy-700">
        <strong>Want to add or remove a module?</strong> You can change
        your module selection <strong>once</strong> before launch
        (after that, modules are locked).{" "}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="link underline"
        >
          Re-select modules →
        </button>
      </p>
    </aside>
  );
}
