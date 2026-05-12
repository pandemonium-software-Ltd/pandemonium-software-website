// /account/[token]/submissions — read-only view of everything the
// customer has submitted across the pipeline.
//
// Surfaces (when present):
//   - Phase 1 enquiry (name, email, phone, business, type, location,
//     website situation) — always present once the customer's past
//     "Phase 2 Accepted" so the dashboard is accessible at all
//   - Phase 2 qualification (11 fields from phase2Schema) — when
//     Phase 2 has been submitted
//   - Phase 3 intake (full nested structure from phase3) — when
//     Phase 3 has been submitted (full or partial)
//
// Same access gate as the dashboard: post-qualify statuses only.
//
// All fields render as plain text (greyed, non-editable). For
// changes the customer emails Ben. The page exists so customers
// can revisit "what did I tell him?" without having to dig through
// their inbox.

import type { Metadata } from "next";
import Link from "next/link";
import {
  getProspectByToken,
  type ProspectStatus,
} from "@/lib/notion-prospects";
import type { Phase2Data } from "@/lib/schemas";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your submissions — ModuForge",
  description: "Read-only view of everything you've submitted.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCESSIBLE_STATUSES = new Set<ProspectStatus>([
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

export default async function SubmissionsPage({
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
  if (!ACCESSIBLE_STATUSES.has(prospect.status as ProspectStatus)) {
    return (
      <ErrorWrapper
        title="Your account isn't active yet."
        body="Your dashboard unlocks once we've confirmed your qualification."
      />
    );
  }

  const phase2 = prospect.phase2Data;
  const phase3 = (prospect.phase3Data ?? {}) as Record<string, unknown>;
  const hasPhase3 = Object.keys(phase3).length > 0;

  return (
    <section className="bg-cream-50 pb-24 pt-12 md:pt-16">
      <div className="container-content max-w-3xl">
        <div className="mb-6">
          <Link
            href={`/account/${token}`}
            className="text-sm font-medium text-navy-500 transition-colors hover:text-navy-800"
          >
            ← Back to dashboard
          </Link>
        </div>
        <span className="eyebrow">Your submissions</span>
        <h1 className="font-serif text-3xl font-semibold text-navy-900 md:text-4xl">
          Everything you&apos;ve shared with me
        </h1>
        <p className="mt-3 max-w-2xl text-base text-navy-700">
          A read-only record of what you told me across the
          pipeline. To update anything, drop me a line at{" "}
          <a href={`mailto:${site.contactEmail}`} className="link">
            {site.contactEmail}
          </a>
          .
        </p>

        {/* -------- Phase 1 — Enquiry -------- */}
        <SectionCard
          id="phase-1"
          title="Phase 1 — Enquiry"
          submittedAt={prospect.phase1SubmittedAt}
        >
          <ReadOnlyField label="Your name" value={prospect.name} />
          <ReadOnlyField label="Email" value={prospect.email} />
          <ReadOnlyField label="Phone" value={prospect.phone ?? "—"} />
          <ReadOnlyField label="Business name" value={prospect.business ?? "—"} />
          <ReadOnlyField
            label="Business type"
            value={prospect.businessType ?? "—"}
          />
          <ReadOnlyField label="Location" value={prospect.location ?? "—"} />
          <ReadOnlyField
            label="Current website situation"
            value={prospect.websiteSituation ?? "—"}
          />
        </SectionCard>

        {/* -------- Phase 2 — Qualification -------- */}
        <SectionCard
          id="phase-2"
          title="Phase 2 — Qualification"
          submittedAt={prospect.phase2SubmittedAt}
        >
          {phase2 ? (
            <Phase2View data={phase2} />
          ) : (
            <p className="text-sm text-navy-600">
              You haven&apos;t submitted Phase 2 yet.
            </p>
          )}
        </SectionCard>

        {/* -------- Phase 3 — Intake -------- */}
        <SectionCard
          id="phase-3"
          title="Phase 3 — Full intake"
          submittedAt={prospect.phase3SubmittedAt}
        >
          {hasPhase3 ? (
            <Phase3View data={phase3} />
          ) : (
            <p className="text-sm text-navy-600">
              You haven&apos;t started Phase 3 yet.
              {prospect.status === "Phase 2 Accepted" && (
                <>
                  {" "}
                  <Link href={`/intake/${token}`} className="link">
                    Open the intake form →
                  </Link>
                </>
              )}
            </p>
          )}
        </SectionCard>
      </div>
    </section>
  );
}

// ---------- Layout primitives ----------

function SectionCard({
  id,
  title,
  submittedAt,
  children,
}: {
  id: string;
  title: string;
  submittedAt?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      id={id}
      className="mt-8 scroll-mt-24 rounded-2xl border border-navy-100 bg-white p-6 shadow-card target:ring-4 target:ring-amber-200 md:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold text-navy-900">
          {title}
        </h2>
        {submittedAt && (
          <span className="text-xs text-navy-500">
            Submitted {formatDate(submittedAt)}
          </span>
        )}
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </article>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap rounded-lg border border-navy-100 bg-cream-50 px-3 py-2 text-sm text-navy-700">
        {value || <span className="text-navy-400">(empty)</span>}
      </p>
    </div>
  );
}

// ---------- Phase 2 viewer ----------

function Phase2View({ data }: { data: Phase2Data }) {
  return (
    <>
      <ReadOnlyField label="How you find new customers" value={data.acquisitionMethod} />
      <ReadOnlyField
        label="Monthly spend on customer acquisition"
        value={`£${data.acquisitionMonthlyCost}`}
      />
      <ReadOnlyField label="Enquiries per month" value={data.enquiryVolume} />
      <ReadOnlyField
        label="How you handle bookings"
        value={data.bookingHandling}
      />
      <ReadOnlyField label="Google Business Profile" value={data.gbpStatus} />
      <ReadOnlyField
        label="Brand colour"
        value={
          data.brandColourUnsure
            ? "Not sure yet (you can decide later)"
            : data.brandColour ?? "—"
        }
      />
      <ReadOnlyField
        label="Modules of interest"
        value={
          data.modulesInterest.length > 0
            ? data.modulesInterest.join(", ")
            : "None selected"
        }
      />
      <ReadOnlyField
        label="Specific features"
        value={data.specificFeatures ?? "—"}
      />
      <ReadOnlyField label="Deal-breakers" value={data.dealBreakers ?? "—"} />
      <ReadOnlyField
        label="Target go-live date"
        value={data.goLiveDate || "—"}
      />
    </>
  );
}

// ---------- Phase 3 viewer ----------
//
// Phase 3 is a nested object with 8 sections. We don't depend on
// the schema being fully populated — render every nested key/value
// pair we find, recursively. Keeps this stable as schema evolves
// without needing a per-field renderer.

function Phase3View({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-navy-600">No sections completed yet.</p>
    );
  }
  return (
    <>
      {entries.map(([sectionKey, sectionVal]) => (
        <Phase3Section
          key={sectionKey}
          title={humaniseKey(sectionKey)}
          value={sectionVal}
        />
      ))}
    </>
  );
}

function Phase3Section({ title, value }: { title: string; value: unknown }) {
  // Section values are usually objects ({ contactName: "...",
  // publicEmail: "...", ... }). If we get anything else, render
  // it as a single value.
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return (
      <ReadOnlyField label={title} value={formatValue(value)} />
    );
  }
  const rows = Object.entries(value as Record<string, unknown>);
  return (
    <details
      className="rounded-lg border border-navy-100 bg-cream-50"
      open={rows.length <= 5}
    >
      <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-navy-900 hover:bg-cream-100">
        {title}
        <span className="ml-2 text-[11px] font-normal text-navy-500">
          ({rows.length} {rows.length === 1 ? "field" : "fields"})
        </span>
      </summary>
      <div className="space-y-2 px-3 pb-3 pt-1">
        {rows.map(([k, v]) => (
          <ReadOnlyField key={k} label={humaniseKey(k)} value={formatValue(v)} />
        ))}
      </div>
    </details>
  );
}

/** "contactDetails" → "Contact details". Splits camelCase + capitalises. */
function humaniseKey(k: string): string {
  return k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Best-effort string rendering of a phase-3 nested value. */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (v.length === 0) return "(none)";
    // Render arrays of primitives as comma-list; arrays of objects
    // as JSON (so customer can still see their content).
    if (v.every((i) => typeof i === "string")) return v.join(", ");
    return JSON.stringify(v, null, 2);
  }
  // Nested object — flatten one level.
  if (typeof v === "object") {
    return JSON.stringify(v, null, 2);
  }
  return String(v);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------- Error UI ----------

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
        </div>
      </div>
    </section>
  );
}
