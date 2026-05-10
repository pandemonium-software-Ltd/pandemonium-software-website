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
import { getServerEnv } from "@/lib/env";
import {
  deriveStepList,
  getDoneFlags,
  isOnboardingMutable,
  isOnboardingUnlocked,
  onboardingDataSchema,
  pickInitialStep,
  type OnboardingData,
} from "@/lib/onboarding";
import OnboardingHub from "@/components/OnboardingHub";
import { canChangeModules } from "@/lib/billing/module-policy";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Onboarding Hub",
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

  // Read the ops email customers invite as a team member across
  // Cloudflare (Step 1), Resend (Step 2) and GBP Manager (Step 3).
  // One env var, one shared inbox. Falls back to a clearly-broken
  // placeholder so a missing env var doesn't break the page — it
  // just becomes obvious in any invite step.
  const env = getServerEnv();
  const benEmail = env.BEN_OPS_EMAIL ?? "(BEN_OPS_EMAIL not configured)";
  // Public URL base for R2 brand-asset thumbnails (Step 4). Empty
  // string = no thumbnail preview, just filename tiles — uploads
  // still work without it.
  const r2PublicUrlBase = env.R2_PUBLIC_URL_BASE ?? "";

  // Module change eligibility (1-round-only, pre-commit only). Pure
  // policy lookup — see src/lib/billing/module-policy.ts. The latest
  // pending entry (if any) drives the in-flight UI in Step 3.
  const moduleChangeEligibility = canChangeModules(prospect);
  const pendingModuleChange =
    [...prospect.moduleChangeLog]
      .reverse()
      .find((e) => e.status === "pending-stripe") ?? null;

  // Canonical service list for the Hub. Order of preference:
  //   1. Content step's services (post-edit canonical — customer
  //      may have renamed / added / deleted services here)
  //   2. Phase 3 intake services (the original list, captured pre-
  //      payment for scoping + pricing)
  // Threaded to BOTH Step 4 Content (as the seed for the editable
  // list) AND Step 5 Brand Assets (as the read-only list of photo
  // upload slots). Renaming a service in Step 4 propagates here on
  // the next page render.
  const phase3Services = (() => {
    // Try content step first.
    const ob = prospect.onboardingData as
      | { content?: { services?: unknown } }
      | undefined;
    const fromContent = Array.isArray(ob?.content?.services)
      ? ob.content.services
      : [];
    const contentNames = fromContent
      .map((s: unknown) => {
        if (!s || typeof s !== "object") return null;
        const n = (s as { serviceName?: unknown }).serviceName;
        return typeof n === "string" && n.trim().length > 0
          ? { name: n.trim() }
          : null;
      })
      .filter((s): s is { name: string } => s !== null);
    if (contentNames.length > 0) return contentNames;

    // Fall back to Phase 3 intake.
    const p3 = prospect.phase3Data as { services?: unknown } | undefined;
    const raw = Array.isArray(p3?.services) ? p3.services : [];
    return raw
      .map((s: unknown) => {
        if (!s || typeof s !== "object") return null;
        const name = (s as { name?: unknown }).name;
        return typeof name === "string" && name.trim().length > 0
          ? { name: name.trim() }
          : null;
      })
      .filter((s): s is { name: string } => s !== null);
  })();

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
      hubLocked={!isOnboardingMutable(prospect.status)}
      benEmail={benEmail}
      r2PublicUrlBase={r2PublicUrlBase}
      customerConfirmedNameserversAt={prospect.customerConfirmedNameserversAt}
      moduleChangeEligibility={moduleChangeEligibility}
      pendingModuleChange={pendingModuleChange}
      phase3Services={phase3Services}
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
