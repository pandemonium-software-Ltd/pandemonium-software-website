// /admin/[token] — operator per-customer detail page.
//
// Drill-down from /admin's fleet view. Renders everything Notion
// knows about one prospect, with sections for their pipeline state,
// onboarding progress, change requests inbox, and quick links.
//
// Auth: HTTP Basic Auth via src/middleware.ts (matches /admin/:path*).
// By the time this component runs, Ben is authenticated.
//
// Stage 2D MVP scope: read-mostly view. Inline editing of fields,
// resolve-buttons on change requests, and direct-action buttons
// (rebuild, send email, override Cowork) come in later iterations
// once Cowork is doing the underlying work.

import type { Metadata } from "next";
import Link from "next/link";
import { getProspectByToken } from "@/lib/notion-prospects";
import ChangeRequestEditor from "@/components/admin/ChangeRequestEditor";
import ModuleChangeEditor from "@/components/admin/ModuleChangeEditor";
import PreviewUrlEditor from "@/components/admin/PreviewUrlEditor";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Customer detail — ModuForge admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminDetailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;

  if (!TOKEN_RE.test(token)) {
    return (
      <Wrapper>
        <ErrorCard
          title="Invalid token"
          body={`Token doesn't match UUID format: ${token}`}
        />
      </Wrapper>
    );
  }

  let prospect;
  let loadError: string | null = null;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (loadError) {
    return (
      <Wrapper>
        <ErrorCard title="Notion load error" body={loadError} />
      </Wrapper>
    );
  }
  if (!prospect) {
    return (
      <Wrapper>
        <ErrorCard
          title="Not found"
          body={`No prospect with token ${token}.`}
        />
      </Wrapper>
    );
  }

  // Onboarding step progress dots (5 fixed slots).
  const stepDoneFlags = [
    prospect.onboardingStep1Done,
    prospect.onboardingStep2Done,
    prospect.onboardingStep3Done,
    prospect.onboardingStep4Done,
    prospect.onboardingStep5Done,
  ];

  return (
    <Wrapper>
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-3 text-xs text-navy-500">
          <Link href="/admin" className="link">
            ← Back to fleet view
          </Link>
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-serif text-3xl font-semibold text-navy-900 md:text-4xl">
            {prospect.name}
          </h1>
          <StatusBadge status={prospect.status} />
        </div>
        <p className="mt-2 text-sm text-navy-600">
          {prospect.business ?? "—"} ·{" "}
          <a
            href={`mailto:${prospect.email}`}
            className="link"
          >
            {prospect.email}
          </a>
          {prospect.phone && (
            <>
              {" "}
              ·{" "}
              <a
                href={`tel:${prospect.phone.replace(/\s/g, "")}`}
                className="link"
              >
                {prospect.phone}
              </a>
            </>
          )}
          {prospect.location && <> · {prospect.location}</>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <a
            href={prospect.notionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-navy-900 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-navy-700"
          >
            Open in Notion ↗
          </a>
          <a
            href={`${baseUrl}/account/${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-2 border-navy-200 px-3 py-1.5 font-semibold text-navy-900 transition-colors hover:border-navy-400"
          >
            Customer dashboard ↗
          </a>
          <a
            href={`${baseUrl}/onboarding/${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-2 border-navy-200 px-3 py-1.5 font-semibold text-navy-900 transition-colors hover:border-navy-400"
          >
            Onboarding Hub ↗
          </a>
          <a
            href={`${baseUrl}/intake/${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-2 border-navy-200 px-3 py-1.5 font-semibold text-navy-900 transition-colors hover:border-navy-400"
          >
            Intake form ↗
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- Pipeline state ---------- */}
        <Section title="Pipeline">
          <KV label="Status" value={prospect.status} />
          <KV
            label="Submitted (Phase 1)"
            value={formatDate(prospect.phase1SubmittedAt)}
          />
          <KV
            label="Submitted (Phase 2)"
            value={formatDate(prospect.phase2SubmittedAt)}
          />
          <KV
            label="Submitted (Phase 3)"
            value={formatDate(prospect.phase3SubmittedAt)}
          />
          <KV
            label="Compatibility result"
            value={prospect.compatibilityResult ?? "—"}
          />
          {prospect.hardBlockerTriggered && (
            <KV
              label="Hard blocker"
              value={prospect.hardBlockerTriggered}
              tone="ember"
            />
          )}
          {prospect.softBlockersTriggered.length > 0 && (
            <KV
              label="Soft blockers"
              value={prospect.softBlockersTriggered.join(", ")}
            />
          )}
        </Section>

        {/* ---------- Subscription ---------- */}
        <Section title="Subscription">
          <KV
            label="Setup fee"
            value={
              prospect.setupFeeCalculated
                ? `£${prospect.setupFeeCalculated}`
                : "—"
            }
          />
          <KV
            label="Monthly fee"
            value={
              prospect.monthlyFeeCalculated
                ? `£${prospect.monthlyFeeCalculated}/mo`
                : "—"
            }
          />
          <KV
            label="Founding member"
            value={prospect.foundingMember ? "Yes" : "No"}
          />
          <KV
            label="Modules"
            value={
              prospect.moduleSelections.length > 0
                ? prospect.moduleSelections.join(", ")
                : "Base only"
            }
          />
        </Section>

        {/* ---------- Onboarding ---------- */}
        <Section title="Onboarding Hub">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-navy-600">Step progress:</span>
            {stepDoneFlags.map((done, i) => (
              <span
                key={i}
                title={`Step ${i + 1} ${done ? "done" : "pending"}`}
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  done
                    ? "bg-green-600 text-white"
                    : "bg-cream-100 text-navy-700 ring-2 ring-navy-200",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
            ))}
          </div>
          <KV
            label="Started at"
            value={formatDate(prospect.onboardingStartedAt)}
          />
          <KV
            label="Completed at"
            value={formatDate(prospect.onboardingCompletedAt)}
          />
          <KV
            label="Go-live target"
            value={formatDate(prospect.goLiveDate)}
          />
        </Section>

        {/* ---------- Captured config ---------- */}
        <Section title="Captured config">
          <KV
            label="Domain"
            value={
              ((prospect.onboardingData ?? {}) as { domain?: { domain?: string } })
                .domain?.domain ?? "—"
            }
          />
          <KV
            label="Registrar"
            value={
              ((prospect.onboardingData ?? {}) as { domain?: { registrar?: string } })
                .domain?.registrar ?? "—"
            }
          />
          <KV
            label="Cloudflare email"
            value={
              ((prospect.onboardingData ?? {}) as {
                cloudflare?: { cloudflareEmail?: string };
              }).cloudflare?.cloudflareEmail ?? "—"
            }
          />
          <KV
            label="Resend signup email"
            value={
              ((prospect.onboardingData ?? {}) as {
                domain?: { resendSignupEmail?: string };
              }).domain?.resendSignupEmail ?? "—"
            }
          />
          <KV
            label="Cal.com URL"
            value={
              ((prospect.onboardingData ?? {}) as {
                tools?: { calcomBookingUrl?: string };
              }).tools?.calcomBookingUrl ?? "—"
            }
          />
          <KV
            label="GBP URL"
            value={
              ((prospect.onboardingData ?? {}) as { tools?: { gbpUrl?: string } })
                .tools?.gbpUrl ?? "—"
            }
          />
        </Section>
      </div>

      {/* ---------- Preview URL editor ---------- */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-semibold text-navy-900">
          Site preview
        </h2>
        <div className="mt-3">
          <PreviewUrlEditor
            token={token}
            previewSubmittedAt={
              ((prospect.onboardingData ?? {}) as {
                review?: { previewSubmittedAt?: string };
              }).review?.previewSubmittedAt
            }
            currentPreviewUrl={
              ((prospect.onboardingData ?? {}) as {
                review?: { previewUrl?: string };
              }).review?.previewUrl ?? ""
            }
          />
        </div>
      </div>

      {/* ---------- Module change log ---------- */}
      {prospect.moduleChangeLog.length > 0 && (
        <div className="mt-8">
          <h2 className="font-serif text-2xl font-semibold text-navy-900">
            Module changes{" "}
            <span className="text-sm font-normal text-navy-500">
              ({prospect.moduleChangeLog.length})
            </span>
          </h2>
          <p className="mt-2 text-xs text-navy-600">
            Customer self-service module re-selections (1-round-only,
            pre-commit only). Pending entries need a manual Stripe op
            then &ldquo;Apply&rdquo; — see docs/STRIPE-PHASE-2.md for
            the auto-Stripe migration path.
          </p>
          <ul className="mt-4 space-y-4">
            {[...prospect.moduleChangeLog]
              .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
              .map((entry) => (
                <li key={entry.id}>
                  <ModuleChangeEditor token={token} entry={entry} />
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* ---------- Change requests ---------- */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-semibold text-navy-900">
          Change requests inbox{" "}
          <span className="text-sm font-normal text-navy-500">
            ({prospect.changeRequests.length})
          </span>
        </h2>
        {prospect.changeRequests.length === 0 ? (
          <p className="mt-3 text-sm text-navy-600">
            No change requests yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {prospect.changeRequests.map((r) => (
              <li
                key={r.id}
                // Anchor target so the email's "reply with one click"
                // deep link (#cr-<id>) scrolls the right request into
                // view. scroll-mt-24 leaves space for the sticky-ish
                // page header so the row isn't jammed against the top
                // edge.
                id={`cr-${r.id}`}
                className="scroll-mt-24 rounded-xl border border-navy-100 bg-white p-5 shadow-card target:ring-4 target:ring-amber-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-navy-500">
                    <span className="font-semibold text-navy-900">
                      Submitted {formatDateTime(r.submittedAt)}
                    </span>
                    <span className="ml-2 font-mono text-[11px]">
                      {r.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-navy-800">
                  {r.message}
                </p>
                <ChangeRequestEditor token={token} request={r} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-navy-500">
          Resolving or rejecting a request emails the customer with
          your reply verbatim. They also see it on their dashboard.
        </p>
      </div>

      {/* ---------- Notes ---------- */}
      {prospect.notes && (
        <div className="mt-8">
          <h2 className="font-serif text-2xl font-semibold text-navy-900">
            Notes
          </h2>
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-navy-100 bg-white p-5 text-sm text-navy-800 shadow-card">
            {prospect.notes}
          </p>
        </div>
      )}
    </Wrapper>
  );
}

// ---------- Helpers ----------

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-white py-10 md:py-14">
      <div className="container-content">{children}</div>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl bg-white p-6 shadow-card">
      <h2 className="font-serif text-lg font-semibold text-navy-900">
        {title}
      </h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {children}
      </dl>
    </article>
  );
}

function KV({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ember";
}) {
  return (
    <>
      <dt className="text-navy-600">{label}</dt>
      <dd
        className={[
          "font-medium",
          tone === "ember" ? "text-ember-700" : "text-navy-900",
        ].join(" ")}
      >
        {value}
      </dd>
    </>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border-2 border-ember-300 bg-white p-6">
      <h1 className="font-serif text-2xl font-semibold text-navy-900">
        {title}
      </h1>
      <p className="mt-2 text-sm text-navy-700">{body}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-block rounded-full bg-navy-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-navy-800">
      {status}
    </span>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
