// /intake/[token] — Phase 3 full intake wizard.
//
// Server component. Fetches prospect from Notion using the token,
// then either renders the multi-step wizard (with any previously-saved
// partial as default values) or one of the gating cards:
//
//   - Invalid / unknown token → "Link not found"
//   - Status not eligible (still in Phase 1 or Phase 2 pending) → "Not yet"
//   - Status already past Phase 3 (Paid, Build Started, Live) → "Already done"

import type { Metadata } from "next";
import { getProspectByToken } from "@/lib/notion-prospects";
import IntakeForm from "@/components/IntakeForm";
import type { Phase3Partial } from "@/lib/schemas";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Full intake — Pandemonium Software",
  description:
    "The full intake form. Once you've finished it, your fixed quote is locked in and you continue to payment.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ELIGIBLE_STATUSES = new Set([
  "Phase 2 Accepted",
  "Phase 3 In Progress",
  "Phase 3 Complete", // re-edit allowed until paid
]);

const ALREADY_PAID_STATUSES = new Set([
  "Paid",
  "Build Started",
  "Live",
  "Cancelled",
]);

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return (
      <Wrapper>
        <ErrorCard
          title="That link doesn't look right."
          body="Double-check the URL from my email, or reply and I'll resend it."
        />
      </Wrapper>
    );
  }

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    console.error("[intake page] Notion error:", e);
    return (
      <Wrapper>
        <ErrorCard
          title="Something went wrong on my end."
          body="Please try again in a minute. If the page still won't load, drop me an email and I'll sort it out."
        />
      </Wrapper>
    );
  }

  if (!prospect) {
    return (
      <Wrapper>
        <ErrorCard
          title="Link not found."
          body="Use the most recent intake link I sent — older links expire when a new one is issued."
        />
      </Wrapper>
    );
  }

  if (ALREADY_PAID_STATUSES.has(prospect.status)) {
    return (
      <Wrapper>
        <InfoCard
          title="You've already done the intake."
          body={`Your build is on the way. If you need to change anything before launch, drop me an email.`}
        />
      </Wrapper>
    );
  }

  if (!ELIGIBLE_STATUSES.has(prospect.status)) {
    return (
      <Wrapper>
        <InfoCard
          title="Not quite ready for this step."
          body="The intake form unlocks once I've replied to your qualification with an acceptance. Watch your inbox — I'm normally back within 4 working hours."
        />
      </Wrapper>
    );
  }

  // Pre-fill any previously-saved partial, plus light pre-fill from
  // earlier phases so the prospect isn't re-typing what I already know.
  const savedPartial = (prospect.phase3Data ?? {}) as Phase3Partial;
  const seedDefaults = {
    contactDetails: {
      contactName: savedPartial.contactDetails?.contactName ?? prospect.name,
      publicEmail: savedPartial.contactDetails?.publicEmail ?? prospect.email,
      phoneDisplay:
        savedPartial.contactDetails?.phoneDisplay ?? prospect.phone ?? "",
      phoneTel: savedPartial.contactDetails?.phoneTel ?? prospect.phone ?? "",
    },
    businessBasics: {
      tradingName:
        savedPartial.businessBasics?.tradingName ?? prospect.business ?? "",
      legalName: savedPartial.businessBasics?.legalName ?? "",
    },
    modules: {
      moduleBooking:
        savedPartial.modules?.moduleBooking ??
        prospect.phase2Data?.modulesInterest?.includes("Online Booking") ??
        false,
      moduleEnquiry:
        savedPartial.modules?.moduleEnquiry ??
        prospect.phase2Data?.modulesInterest?.includes("Enquiry Form") ??
        false,
      moduleNewsletter:
        savedPartial.modules?.moduleNewsletter ??
        prospect.phase2Data?.modulesInterest?.includes("Newsletter") ??
        false,
      gbpAddon:
        savedPartial.modules?.gbpAddon ??
        prospect.phase2Data?.modulesInterest?.includes(
          "Google Business Profile Setup/Audit",
        ) ??
        false,
    },
  };

  return (
    <>
      <section className="bg-cream-100/60 pb-10 pt-14 md:pb-12 md:pt-20">
        <div className="container-content max-w-3xl text-center">
          <span className="eyebrow">Full intake</span>
          <h1 className="heading-1">
            Everything I need to build your site.
          </h1>
          <p className="prose-body mx-auto mt-6 max-w-2xl">
            Seven short sections. Saves as you go, so you can close the tab
            and come back any time. Allow about 15 minutes — and have your
            logo handy if you have one.
          </p>
        </div>
      </section>

      <section className="pb-24 pt-8">
        <div className="container-content max-w-3xl">
          <IntakeForm
            token={token}
            prospectName={prospect.name}
            savedPartial={savedPartial}
            seedDefaults={seedDefaults}
          />
        </div>
      </section>
    </>
  );
}

// ---------- Helper UI ----------

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <section className="section bg-white">
      <div className="container-content max-w-2xl">{children}</div>
    </section>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card bg-white">
      <span className="eyebrow text-ember-700">Hmm.</span>
      <h1 className="heading-2 mt-3">{title}</h1>
      <p className="prose-body mt-5">{body}</p>
      <p className="prose-body mt-4">
        Email me at{" "}
        <a href={`mailto:${site.contactEmail}`} className="link">
          {site.contactEmail}
        </a>
        .
      </p>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card bg-white">
      <span className="eyebrow">Heads up</span>
      <h1 className="heading-2 mt-3">{title}</h1>
      <p className="prose-body mt-5">{body}</p>
      <p className="prose-body mt-4">
        Email me at{" "}
        <a href={`mailto:${site.contactEmail}`} className="link">
          {site.contactEmail}
        </a>
        {" "}if anything&apos;s urgent.
      </p>
    </div>
  );
}
