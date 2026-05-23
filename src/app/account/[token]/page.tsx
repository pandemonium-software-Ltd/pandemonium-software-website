// /account/[token] — customer dashboard.
//
// The customer's home base post-launch. Same token they've had since
// enquiry; same gate pattern as the Onboarding Hub. Surfaces:
//   - status of their site (Live / building / onboarding)
//   - subscription details (setup fee paid, monthly, modules)
//   - this month's change-request count (X / 3 used; reset on the
//     1st each month UTC; out-of-scope rejections don't count)
//   - "Need a change?" inbox: submit a content change request,
//     see prior requests with status
//   - get-in-touch / cancel links
//
// Access opens at "Paid" (so customers can see their record while
// onboarding) and stays open after Cancelled (read-only view of
// their final state). Pre-payment statuses redirect to a "not
// active yet" message.
//
// All data comes from Notion. Mutations go through
// /api/account/change-request (POST). Cancellation is email-driven
// for now — Stage 2D Part 2 will add a self-serve cancel flow.

import type { Metadata } from "next";
import {
  getProspectByToken,
  MONTHLY_CHANGE_REQUEST_LIMIT,
  MONTHLY_OFFER_UPDATE_LIMIT,
  type ProspectStatus,
} from "@/lib/notion-prospects";
import { NEWSLETTER_MONTHLY_SEND_LIMIT } from "@/lib/newsletter/limits";
import { effectiveMonthlyCap } from "@/lib/admin-grants";
import { deriveStepList, getDoneFlags } from "@/lib/onboarding";
import AccountDashboard from "@/components/AccountDashboard";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Account — ModuForge",
  description:
    "Your ModuForge account: site status, subscription details, change requests.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dashboard opens at "Phase 2 Accepted" — i.e. once the customer's
// passed qualification + has a quote pending. Pre-qualify statuses
// (Phase 1 + Phase 2 unresolved) still hit the "not active yet"
// page because there's nothing meaningful to show beyond "we got
// your enquiry / we're checking compatibility" — and customers can
// just check email for that.
//
// Post-qualify the dashboard turns into a hub that adapts to where
// they are: quote awaiting payment → intake link, paid → Hub
// shortcut, live → site URL + change requests + newsletter.
const ACCOUNT_ACCESSIBLE_STATUSES = new Set<ProspectStatus>([
  "Phase 2 Accepted",
  "Phase 3 In Progress",
  "Phase 3 Complete",
  "Paid",
  "Onboarding Started",
  "Onboarding Complete",
  "Build Started",
  "Live",
  "Cancelled",
]);

export default async function AccountPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return <ErrorWrapper title="That link doesn't look right." />;
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return <ErrorWrapper title="Account not found." />;
  }

  // Narrow the defensively-widened `ProspectStatus | string` to
  // ProspectStatus by checking membership of our allow-list. Anything
  // not in the set falls through to the "not active yet" page.
  if (
    !ACCOUNT_ACCESSIBLE_STATUSES.has(prospect.status as ProspectStatus)
  ) {
    return (
      <ErrorWrapper
        title="Your account isn't active yet."
        body="Your dashboard unlocks once we've confirmed your qualification. If you've just submitted a Phase 2 form, give me a few hours to review and you'll get an email with a link the moment it's ready."
      />
    );
  }
  const narrowedStatus = prospect.status as ProspectStatus;

  // Derive a single useful URL for the customer's site:
  //   - Live / Build Started / Onboarding Complete: their domain (if
  //     captured during Hub Step 2) — falls back to a placeholder
  //   - Earlier: no site URL yet, link to onboarding hub instead
  type OnboardingShape = {
    domain?: { domain?: string };
    content?: {
      offers?: {
        current?: {
          headline?: string;
          body?: string;
          ctaLabel?: string;
          ctaUrl?: string;
          startsAt?: string;
          endsAt?: string;
        };
      };
      newsletter?: {
        subscribers?: Array<{
          confirmedAt?: string;
          unsubscribedAt?: string;
        }>;
        history?: Array<{
          id?: string;
          subject?: string;
          sentAt?: string;
          recipientCount?: number;
          status?: "draft" | "sending" | "sent" | "failed";
        }>;
      };
    };
  };
  const onboardingShape = (prospect.onboardingData ?? {}) as OnboardingShape;
  const customerDomain = onboardingShape.domain?.domain ?? "";
  // Pull the live offer through to the dashboard. Only render in
  // OfferCard if we have a headline + dates (the schema guarantees
  // these when the customer has saved one). null = no offer.
  const offerRaw = onboardingShape.content?.offers?.current;
  const currentOffer =
    offerRaw &&
    typeof offerRaw.headline === "string" &&
    typeof offerRaw.startsAt === "string" &&
    typeof offerRaw.endsAt === "string"
      ? {
          headline: offerRaw.headline,
          body: offerRaw.body,
          ctaLabel: offerRaw.ctaLabel,
          ctaUrl: offerRaw.ctaUrl,
          startsAt: offerRaw.startsAt,
          endsAt: offerRaw.endsAt,
        }
      : null;

  // Newsletter summary for the dashboard NewsletterCard. Confirmed
  // + non-unsubscribed subscribers are the count that matters
  // (those are who'd actually receive a send).
  const newsletterRaw = onboardingShape.content?.newsletter;
  const subscriberCount = (newsletterRaw?.subscribers ?? []).filter(
    (s) => s.confirmedAt && !s.unsubscribedAt,
  ).length;
  const historyAll = newsletterRaw?.history ?? [];
  const currentYearMonth = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const sentThisMonth = historyAll.filter(
    (h) =>
      typeof h.sentAt === "string" &&
      h.sentAt.startsWith(currentYearMonth) &&
      h.status !== "failed",
  ).length;
  const lastSentAt = historyAll
    .filter((h) => typeof h.sentAt === "string" && h.status !== "failed")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))[0]
    ?.sentAt;
  const newsletterSummary = {
    subscriberCount,
    lastSentAt,
    sentThisMonth,
    history: historyAll
      .filter(
        (h): h is {
          id: string;
          subject: string;
          sentAt: string;
          recipientCount: number;
          status: "draft" | "sending" | "sent" | "failed";
        } =>
          typeof h.id === "string" &&
          typeof h.subject === "string" &&
          typeof h.sentAt === "string" &&
          typeof h.recipientCount === "number" &&
          typeof h.status === "string",
      )
      .slice(0, 5),
  };

  // Compute per-step done state for the dashboard's Hub nav card
  // (drives the green ticks + greyed style). Same helpers the Hub
  // page itself uses so dashboard and Hub never disagree on which
  // steps are complete.
  const hubSteps = deriveStepList(prospect);
  const doneFlags = getDoneFlags(prospect);
  const applicableStepIds = hubSteps.filter((s) => s.applicable).map((s) => s.id);

  // Effective monthly caps for this customer. Default cap PLUS any
  // bonus the admin granted via /admin/[token] this month. The cap
  // counters in the API routes already use these — we just need to
  // surface them in the dashboard so the customer's "X of Y" display
  // matches what the server actually allows.
  const effectiveCaps = {
    changeRequests: effectiveMonthlyCap({
      prospect,
      defaultCap: MONTHLY_CHANGE_REQUEST_LIMIT,
      kind: "changeRequests",
    }),
    offers: effectiveMonthlyCap({
      prospect,
      defaultCap: MONTHLY_OFFER_UPDATE_LIMIT,
      kind: "offers",
    }),
    newsletters: effectiveMonthlyCap({
      prospect,
      defaultCap: NEWSLETTER_MONTHLY_SEND_LIMIT,
      kind: "newsletters",
    }),
  };

  return (
    <AccountDashboard
      token={token}
      name={prospect.name}
      business={prospect.business ?? ""}
      status={narrowedStatus}
      domain={customerDomain}
      modules={prospect.moduleSelections}
      setupFee={prospect.setupFeeCalculated ?? 0}
      monthlyFee={prospect.monthlyFeeCalculated ?? 0}
      foundingMember={prospect.foundingMember}
      onboardingCompletedAt={prospect.onboardingCompletedAt ?? null}
      goLiveDate={prospect.goLiveDate ?? null}
      changeRequests={prospect.changeRequests}
      hubStepDone={doneFlags}
      hubApplicableStepIds={applicableStepIds}
      currentOffer={currentOffer}
      newsletterSummary={newsletterSummary}
      effectiveCaps={effectiveCaps}
      hasAnalytics={!!prospect.cloudflareZoneId}
    />
  );
}

function ErrorWrapper({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <section className="section bg-white">
      <div className="container-content max-w-2xl">
        <div className="card bg-white">
          <span className="eyebrow text-ember-700">Hmm.</span>
          <h1 className="heading-2 mt-3">{title}</h1>
          <p className="prose-body mt-5">
            {body ??
              "Double-check the URL from our email, or reply and we'll resend it."}
          </p>
          <p className="prose-body mt-4">
            Email us at{" "}
            <a href={`mailto:${site.contactEmail}`} className="link">
              {site.contactEmail}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
