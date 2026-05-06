// /onboarding/[token] — Stage 2B Onboarding Hub.
//
// Sent in the post-payment receipt email and the L4 welcome email.
// The page is a server component that:
//   1. Validates the token shape
//   2. Looks up the prospect
//   3. Gates on status (must be Paid or further)
//   4. Renders <OnboardingHub /> with the derived step list and
//      existing per-step state
//
// All mutations happen via POST /api/onboarding from the client.

import type { Metadata } from "next";
import { getProspectByToken } from "@/lib/notion-prospects";
import {
  deriveStepList,
  getDoneFlags,
  isOnboardingUnlocked,
  onboardingDataSchema,
  pickInitialStep,
  type OnboardingData,
} from "@/lib/onboarding";
import OnboardingHub from "@/components/OnboardingHub";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Onboarding Hub — Pandemonium Software",
  description:
    "Set up your Cloudflare account, domain, brand assets and go-live date.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OnboardingPage({
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
    return <ErrorWrapper title="Link not found." />;
  }

  // Pre-payment? Show a friendly "not active yet" page rather than
  // exposing the Hub. Past-payment statuses (Paid, Onboarding *,
  // Build Started, Live) all unlock the Hub.
  if (!isOnboardingUnlocked(prospect.status)) {
    return (
      <ErrorWrapper
        title="Your onboarding link isn't active yet."
        body="Once payment is recorded, this page will unlock automatically. If you've just paid, give it a minute and refresh."
      />
    );
  }

  const steps = deriveStepList(prospect);
  const initialStepId = pickInitialStep(steps, prospect);
  const doneFlags = getDoneFlags(prospect);

  // Tolerate any shape on read; client gets a typed slice.
  const parsedData = onboardingDataSchema.safeParse(
    prospect.onboardingData ?? {},
  );
  const data: OnboardingData = parsedData.success ? parsedData.data : {};

  return (
    <OnboardingHub
      token={token}
      prospectName={prospect.name}
      businessName={prospect.business ?? ""}
      modules={prospect.moduleSelections}
      foundingMember={prospect.foundingMember}
      steps={steps}
      doneFlags={doneFlags}
      initialStepId={initialStepId}
      initialData={data}
      hubComplete={prospect.status === "Onboarding Complete"}
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
