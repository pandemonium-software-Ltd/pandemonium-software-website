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

  // Phase 3 seeds for Step 4 Site Content. Each new content-step
  // section pre-fills from these the FIRST time the customer
  // touches it, then the content-step value becomes canonical and
  // overrides Phase 3 from then on. Customers who already have a
  // content-step value see THAT (their existing edits) on this
  // visit; only blank fields get seeded.
  //
  // Computed here (server) rather than in the client so we can
  // share the parsing safely without dragging Phase 3's full
  // schema into the client bundle.
  const phase3Seeds = derivePhase3Seeds(prospect.phase3Data);

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
      phase3Seeds={phase3Seeds}
    />
  );
}

/**
 * Derive the Site Content seeds from Phase 3 intake data.
 * Defensive on every read — Phase 3 can be malformed or partially
 * filled; missing fields just produce empty arrays / undefined.
 *
 * Used to pre-fill blank Site Content sections so customers don't
 * re-enter what they already gave at intake. After the first save
 * to a content-step section, the content-step value becomes the
 * canonical source.
 */
function derivePhase3Seeds(phase3Data: unknown): Phase3Seeds {
  const p3 = (phase3Data ?? {}) as Record<string, unknown>;
  const services = (p3.services as Record<string, unknown> | undefined) ?? {};
  const contact =
    (p3.contactDetails as Record<string, unknown> | undefined) ?? {};
  const social =
    (p3.socialProof as Record<string, unknown> | undefined) ?? {};

  const optStr = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  const optNum = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

  const servicesArr = Array.isArray(services.services)
    ? services.services
        .map((s): Phase3Seeds["services"][number] | null => {
          if (!s || typeof s !== "object") return null;
          const obj = s as Record<string, unknown>;
          const name = optStr(obj.name);
          if (!name) return null;
          return {
            name,
            description: optStr(obj.description),
            priceFrom: optNum(obj.startingPrice),
          };
        })
        .filter((s): s is Phase3Seeds["services"][number] => s !== null)
    : [];

  const testimonialsArr = Array.isArray(social.testimonials)
    ? social.testimonials
        .map((t): Phase3Seeds["testimonials"][number] | null => {
          if (!t || typeof t !== "object") return null;
          const obj = t as Record<string, unknown>;
          const name = optStr(obj.name);
          const quote = optStr(obj.quote);
          if (!name || !quote) return null;
          return { name, location: optStr(obj.location), quote };
        })
        .filter((t): t is Phase3Seeds["testimonials"][number] => t !== null)
    : [];

  const openingHoursRaw = contact.openingHours as
    | Record<string, unknown>
    | undefined;
  const openingHours: Phase3Seeds["business"]["openingHours"] = {};
  if (openingHoursRaw && typeof openingHoursRaw === "object") {
    for (const [day, val] of Object.entries(openingHoursRaw)) {
      if (!val || typeof val !== "object") continue;
      const obj = val as Record<string, unknown>;
      openingHours[day] = {
        open: typeof obj.open === "boolean" ? obj.open : false,
        from: optStr(obj.from),
        to: optStr(obj.to),
      };
    }
  }

  return {
    services: servicesArr,
    differentiator: optStr(services.differentiator),
    testimonials: testimonialsArr,
    trust: {
      yearsExperience: optNum(social.yearsExperience),
      associations: optStr(social.associations),
      awards: optStr(social.awards),
    },
    business: {
      contactName: optStr(contact.contactName),
      phoneDisplay: optStr(contact.phoneDisplay),
      phoneTel: optStr(contact.phoneTel),
      publicEmail: optStr(contact.publicEmail),
      address: optStr(contact.address),
      serviceArea: optStr(contact.serviceArea),
      openingHours:
        Object.keys(openingHours).length > 0 ? openingHours : undefined,
    },
  };
}

/**
 * Phase 3 seed shape passed to OnboardingHub → Step4Content. All
 * fields optional — Phase 3 may be partially filled or skipped.
 */
export type Phase3Seeds = {
  services: Array<{
    name: string;
    description?: string;
    priceFrom?: number;
  }>;
  /** Phase 3 "what makes you different" free-text — used to seed
   *  the About blurb if blank in content step. */
  differentiator?: string;
  testimonials: Array<{
    name: string;
    location?: string;
    quote: string;
  }>;
  trust: {
    yearsExperience?: number;
    associations?: string;
    awards?: string;
  };
  business: {
    contactName?: string;
    phoneDisplay?: string;
    phoneTel?: string;
    publicEmail?: string;
    address?: string;
    serviceArea?: string;
    openingHours?: Record<
      string,
      { open: boolean; from?: string; to?: string }
    >;
  };
};

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
