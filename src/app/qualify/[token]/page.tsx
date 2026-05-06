// /qualify/[token] — Phase 2 qualification page.
//
// Server component. Fetches the prospect from Notion using the token
// from the URL, then either renders the qualification form or one of
// three short messages depending on state:
//
//   - Invalid / unknown token → "Link not found"
//   - Prospect already past Phase 2 → "You've already done this"
//   - Otherwise → render the form

import type { Metadata } from "next";
import { getProspectByToken } from "@/lib/notion-prospects";
import QualificationForm from "@/components/QualificationForm";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Quick qualification — Pandamonium Software",
  description:
    "A few quick questions about your business so I can put together a fixed quote.",
  robots: { index: false, follow: false }, // never index private pages
};

// Always fetch fresh data from Notion. We don't want a cached page
// served to someone whose status has since moved on.
export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAST_PHASE_2_STATUSES = new Set([
  "Phase 2 Complete",
  "Phase 2 Accepted",
  "Phase 2 Soft Rejected",
  "Phase 2 Flagged for Review",
  "Phase 2 Clarification Requested",
  "Phase 3 In Progress",
  "Phase 3 Complete",
  "Paid",
  "Build Started",
  "Live",
  "Cancelled",
]);

export default async function QualifyPage({
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
          body="The qualification link from my email should be 36 characters of letters, numbers and dashes. Double-check the URL, or reply to my email and I'll resend it."
        />
      </Wrapper>
    );
  }

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    console.error("[qualify page] Notion error:", e);
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
          body="I can't find an enquiry that matches this link. Make sure you used the most recent email I sent — older qualification links expire when I send a new one. If in doubt, reply to my email."
        />
      </Wrapper>
    );
  }

  if (PAST_PHASE_2_STATUSES.has(prospect.status)) {
    return (
      <Wrapper>
        <InfoCard
          title="Already got your answers."
          body={`I've got your qualification answers from ${prospect.business ?? "you"}. Watch your inbox — the next email from me will either be an acceptance with your fixed quote, a quick clarification, or (rarely) a polite no. If you haven't heard from me within 24 working hours, drop me a line.`}
        />
      </Wrapper>
    );
  }

  return (
    <>
      <section className="bg-cream-100/60 pb-10 pt-14 md:pb-12 md:pt-20">
        <div className="container-content max-w-3xl text-center">
          <span className="eyebrow">Quick qualification</span>
          <h1 className="heading-1">A few quick questions.</h1>
          <p className="prose-body mx-auto mt-6 max-w-2xl">
            Hi {firstName(prospect.name)} — I&apos;ll use these answers to
            build you a fixed quote and a target go-live date.
            5–10 minutes, no jargon, plain answers welcome.
          </p>
        </div>
      </section>

      <section className="pb-24 pt-8">
        <div className="container-content max-w-3xl">
          <div className="card bg-white">
            <QualificationForm
              token={token}
              prospectName={prospect.name}
              prospectBusiness={prospect.business ?? null}
            />
          </div>
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
        </a>{" "}
        and I&apos;ll get you a fresh link.
      </p>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card bg-white">
      <span className="eyebrow">Got it</span>
      <h1 className="heading-2 mt-3">{title}</h1>
      <p className="prose-body mt-5">{body}</p>
      <p className="prose-body mt-4">
        Email me at{" "}
        <a href={`mailto:${site.contactEmail}`} className="link">
          {site.contactEmail}
        </a>{" "}
        if anything&apos;s urgent.
      </p>
    </div>
  );
}

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}
