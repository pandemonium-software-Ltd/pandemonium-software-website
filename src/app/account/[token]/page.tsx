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
import { getProspectByToken } from "@/lib/notion-prospects";
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

const ACCOUNT_ACCESSIBLE_STATUSES = new Set([
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

  if (!ACCOUNT_ACCESSIBLE_STATUSES.has(prospect.status)) {
    return (
      <ErrorWrapper
        title="Your account isn't active yet."
        body="Once payment is recorded, this dashboard unlocks. If you've just paid, give it a minute and refresh."
      />
    );
  }

  // Derive a single useful URL for the customer's site:
  //   - Live / Build Started / Onboarding Complete: their domain (if
  //     captured during Hub Step 2) — falls back to a placeholder
  //   - Earlier: no site URL yet, link to onboarding hub instead
  type OnboardingDomainSlice = { domain?: string };
  type OnboardingShape = { domain?: OnboardingDomainSlice };
  const onboardingShape = (prospect.onboardingData ?? {}) as OnboardingShape;
  const customerDomain = onboardingShape.domain?.domain ?? "";

  return (
    <AccountDashboard
      token={token}
      name={prospect.name}
      business={prospect.business ?? ""}
      status={prospect.status}
      domain={customerDomain}
      modules={prospect.moduleSelections}
      setupFee={prospect.setupFeeCalculated ?? 0}
      monthlyFee={prospect.monthlyFeeCalculated ?? 0}
      foundingMember={prospect.foundingMember}
      onboardingCompletedAt={prospect.onboardingCompletedAt ?? null}
      goLiveDate={prospect.goLiveDate ?? null}
      changeRequests={prospect.changeRequests}
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
              "Double-check the URL from my email, or reply and I'll resend it."}
          </p>
          <p className="prose-body mt-4">
            Email me at{" "}
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
