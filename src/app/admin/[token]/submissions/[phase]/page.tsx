// Admin-only drill-down: "what did the customer submit in phase N?"
//
// Linked from the Pipeline panel on /admin/[token]. Renders the
// captured form data for one of three phases:
//   - phase1 = public enquiry (basic contact + business type)
//   - phase2 = qualification form (compatibility check inputs)
//   - phase3 = intake form (full details, modules, services, etc.)
//
// Auth: HTTP Basic Auth via src/middleware.ts (matches /admin/:path*).
// Phase 3 data is an unknown JSON blob (8-section wizard saves
// partial progress as the customer walks through) — rendered as
// pretty-printed JSON so the operator can read every field without
// needing to maintain a typed renderer per intake schema revision.

import type { Metadata } from "next";
import Link from "next/link";
import { getProspectByToken } from "@/lib/notion-prospects";

export const metadata: Metadata = {
  title: "Submission — ModuForge admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PHASE_LABELS = {
  phase1: "Phase 1 — public enquiry",
  phase2: "Phase 2 — qualification",
  phase3: "Phase 3 — intake",
} as const;

type Phase = keyof typeof PHASE_LABELS;

export default async function AdminSubmissionPage({
  params,
}: {
  params: Promise<{ token: string; phase: string }>;
}) {
  const { token, phase } = await params;

  if (!TOKEN_RE.test(token)) {
    return (
      <Wrapper backHref={`/admin/${token}`}>
        <ErrorCard
          title="Invalid token"
          body={`Token doesn't match UUID format: ${token}`}
        />
      </Wrapper>
    );
  }
  if (!(phase in PHASE_LABELS)) {
    return (
      <Wrapper backHref={`/admin/${token}`}>
        <ErrorCard
          title="Invalid phase"
          body={`Phase must be one of: phase1, phase2, phase3. Got: ${phase}`}
        />
      </Wrapper>
    );
  }
  const phaseKey = phase as Phase;

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    return (
      <Wrapper backHref={`/admin/${token}`}>
        <ErrorCard
          title="Notion load error"
          body={e instanceof Error ? e.message : String(e)}
        />
      </Wrapper>
    );
  }
  if (!prospect) {
    return (
      <Wrapper backHref={`/admin/${token}`}>
        <ErrorCard
          title="Not found"
          body={`No prospect with token ${token}.`}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper backHref={`/admin/${token}`}>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-navy-500">
          {prospect.business ?? prospect.name}
        </p>
        <h1 className="font-serif text-3xl font-semibold text-navy-900">
          {PHASE_LABELS[phaseKey]}
        </h1>
        <p className="mt-1 text-sm text-navy-600">
          {phaseKey === "phase1"
            ? "Public /enquiry form — first touch."
            : phaseKey === "phase2"
              ? "Qualification form — the short form that feeds the compatibility rules engine."
              : "Intake form — 8-section wizard with everything we need to build."}
        </p>
      </header>

      <article className="rounded-2xl bg-white p-6 shadow-card">
        {phaseKey === "phase1" && <Phase1View prospect={prospect} />}
        {phaseKey === "phase2" && <Phase2View prospect={prospect} />}
        {phaseKey === "phase3" && <Phase3View prospect={prospect} />}
      </article>
    </Wrapper>
  );
}

// ---------- Phase 1 ----------

function Phase1View({
  prospect,
}: {
  prospect: NonNullable<Awaited<ReturnType<typeof getProspectByToken>>>;
}) {
  if (!prospect.phase1SubmittedAt) {
    return <Empty label="Phase 1 not submitted yet." />;
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
      <Row label="Submitted at" value={fmtDate(prospect.phase1SubmittedAt)} />
      <Row label="Name" value={prospect.name} />
      <Row label="Email" value={prospect.email} />
      <Row label="Phone" value={prospect.phone ?? "—"} />
      <Row label="Business" value={prospect.business ?? "—"} />
      <Row label="Business type" value={prospect.businessType ?? "—"} />
      <Row label="UK location" value={prospect.location ?? "—"} />
      <Row
        label="Current website situation"
        value={prospect.websiteSituation ?? "—"}
      />
    </dl>
  );
}

// ---------- Phase 2 ----------

function Phase2View({
  prospect,
}: {
  prospect: NonNullable<Awaited<ReturnType<typeof getProspectByToken>>>;
}) {
  if (!prospect.phase2SubmittedAt || !prospect.phase2Data) {
    return <Empty label="Phase 2 not submitted yet." />;
  }
  const d = prospect.phase2Data;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
      <Row label="Submitted at" value={fmtDate(prospect.phase2SubmittedAt)} />
      <Row
        label="Compatibility result"
        value={prospect.compatibilityResult ?? "—"}
      />
      <Row label="Acquisition method" value={d.acquisitionMethod} />
      <Row
        label="Monthly acquisition cost"
        value={`£${d.acquisitionMonthlyCost}`}
      />
      <Row label="Enquiry volume" value={d.enquiryVolume} />
      <Row label="Booking handling" value={d.bookingHandling} />
      <Row label="Google Business Profile" value={d.gbpStatus} />
      <Row label="Brand colour" value={d.brandColour ?? "—"} />
      <Row
        label="Brand colour unsure"
        value={d.brandColourUnsure ? "Yes" : "No"}
      />
      <Row
        label="Modules of interest"
        value={d.modulesInterest.length ? d.modulesInterest.join(", ") : "—"}
      />
      <Row label="Specific features" value={d.specificFeatures || "—"} />
      <Row label="Deal breakers" value={d.dealBreakers || "—"} />
      <Row label="Target go-live date" value={d.goLiveDate} />
    </dl>
  );
}

// ---------- Phase 3 ----------

function Phase3View({
  prospect,
}: {
  prospect: NonNullable<Awaited<ReturnType<typeof getProspectByToken>>>;
}) {
  if (!prospect.phase3SubmittedAt || !prospect.phase3Data) {
    return <Empty label="Phase 3 not submitted yet." />;
  }
  // Phase 3 is an 8-section wizard with a heterogeneous schema (revs
  // over time as we add modules / fields). Render as pretty JSON so
  // the operator sees every field without needing a typed walker —
  // the schema lives in src/lib/schemas.ts if a row needs decoding.
  return (
    <>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        <Row label="Submitted at" value={fmtDate(prospect.phase3SubmittedAt)} />
        <Row label="Setup fee" value={`£${prospect.setupFeeCalculated ?? "—"}`} />
        <Row
          label="Monthly fee"
          value={`£${prospect.monthlyFeeCalculated ?? "—"}/mo`}
        />
        <Row
          label="Modules paid for"
          value={
            prospect.moduleSelections.length
              ? prospect.moduleSelections.join(", ")
              : "Base only"
          }
        />
      </dl>
      <details className="mt-6 rounded-xl border border-navy-100 bg-cream-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-navy-900">
          Raw Phase 3 JSON (full intake answers)
        </summary>
        <pre className="mt-3 max-h-[600px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-white p-4 text-xs leading-relaxed text-navy-800">
          {JSON.stringify(prospect.phase3Data, null, 2)}
        </pre>
      </details>
    </>
  );
}

// ---------- Helpers ----------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-navy-600">{label}</dt>
      <dd className="break-words font-medium text-navy-900">{value}</dd>
    </>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-navy-500">{label}</p>;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Wrapper({
  backHref,
  children,
}: {
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section bg-cream-50 min-h-screen">
      <div className="container-content max-w-4xl">
        <nav className="mb-6 text-sm">
          <Link href={backHref} className="text-amber-700 hover:text-amber-900">
            ← Back to customer detail
          </Link>
        </nav>
        {children}
      </div>
    </section>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-2xl border-2 border-ember-300 bg-white p-6">
      <h1 className="font-serif text-2xl font-semibold text-navy-900">
        {title}
      </h1>
      <p className="mt-2 text-sm text-navy-700">{body}</p>
    </article>
  );
}
