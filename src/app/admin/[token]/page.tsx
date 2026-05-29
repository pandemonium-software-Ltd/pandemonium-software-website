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
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getProspectByToken } from "@/lib/notion-prospects";
import { readSnapshot } from "@/lib/d1-gbp";
import type { D1Database } from "@/lib/d1-analytics";
import ChangeRequestEditor from "@/components/admin/ChangeRequestEditor";
import ReviewEditEditor from "@/components/admin/ReviewEditEditor";
import ModuleChangeEditor from "@/components/admin/ModuleChangeEditor";
import PreviewUrlEditor from "@/components/admin/PreviewUrlEditor";
import UnlockStepButton from "@/components/admin/UnlockStepButton";
import AdminGrantPanel from "@/components/admin/AdminGrantPanel";
import { currentMonthKey, getAdminGrant } from "@/lib/admin-grants";
import { site } from "@/lib/site";
import {
  listExceptions,
  listAuditEntries,
  type OpsException,
  type OpsAuditEntry,
} from "@/lib/notion-ops";
import ResolveExceptionButton from "@/components/admin/ResolveExceptionButton";

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

  // GBP snapshot for the "Google reviews" card below. D1 read is
  // tolerant of a missing binding (admin still renders, just
  // without the GBP card) and tolerant of "no row yet" (customer
  // hasn't completed step3 — Section renders "—").
  let gbpSnapshot: Awaited<ReturnType<typeof readSnapshot>> = null;
  try {
    const cfCtx = getCloudflareContext();
    const env = cfCtx.env as Record<string, unknown>;
    const db = env.pandemonium_analytics as D1Database | undefined;
    if (db) {
      gbpSnapshot = await readSnapshot(db, prospect.token);
    }
  } catch (e) {
    console.error(
      `[admin/${token}] gbp snapshot load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const hasGbpModule = prospect.moduleSelections.includes(
    "Google Business Profile Setup/Audit",
  );

  let customerExceptions: OpsException[] = [];
  let customerActions: OpsAuditEntry[] = [];
  try {
    [customerExceptions, customerActions] = await Promise.all([
      listExceptions({ prospectPageId: prospect.pageId, limit: 20 }),
      listAuditEntries({ prospectPageId: prospect.pageId, limit: 30 }),
    ]);
  } catch {
    // Notion unavailable — sections render empty.
  }

  // Per-step done snapshot for the step-progress panel below. Each
  // entry shows the dot AND, when done, an "unlock" link that lets
  // Ben flip the flag back to false in one click (responding to a
  // customer "I need to change my CF account ID" email). StepId
  // keys map to the same constants the Hub uses.
  const stepProgress: Array<{ id: string; num: number; label: string; done: boolean }> = [
    { id: "cloudflare", num: 1, label: "Cloudflare", done: prospect.onboardingStep1Done },
    { id: "domain", num: 2, label: "Domain", done: prospect.onboardingStep2Done },
    { id: "tools", num: 3, label: "Tools", done: prospect.onboardingStep3Done },
    { id: "content", num: 4, label: "Content", done: prospect.onboardingContentDone },
    { id: "assets", num: 5, label: "Assets", done: prospect.onboardingStep4Done },
    { id: "review", num: 6, label: "Review", done: prospect.onboardingStep5Done },
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

      <NeedsAttentionBanner
        pendingChangeRequests={prospect.changeRequests.filter(
          (r) => r.status === "pending" || r.status === "in-progress",
        ).length}
        openIncidents={customerExceptions.filter((e) => !e.resolved).length}
        pendingReviewEdits={
          (
            ((prospect.onboardingData ?? {}) as {
              review?: { edits?: Array<{ status: string }> };
            }).review?.edits ?? []
          ).filter((e) => e.status === "submitted").length
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- Pipeline state ----------
         *  Custom layout so we can stamp a one-line legend explaining
         *  the phase numbering (otherwise "Phase 1/2/3" is opaque to
         *  anyone who doesn't have the playbook in their head) AND
         *  surface a "view what they submitted" link next to each
         *  phase row that has data. Links open the corresponding
         *  form-snapshot page in /admin/[token]/submissions/[phase]. */}
        <article className="rounded-2xl bg-white p-6 shadow-card">
          <h2 className="font-serif text-lg font-semibold text-navy-900">
            Pipeline
          </h2>
          <p className="mt-1 text-xs text-navy-600">
            Phase 1 = public enquiry form · Phase 2 = qualification
            (compatibility check) · Phase 3 = intake (full details +
            modules + payment).
          </p>
          <dl className="mt-4 grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-navy-600">Status</dt>
            <dd className="col-span-2 font-medium text-navy-900">
              {prospect.status}
            </dd>

            <dt className="text-navy-600">Enquiry submitted</dt>
            <dd className="font-medium text-navy-900">
              {formatDate(prospect.phase1SubmittedAt)}
            </dd>
            <dd className="text-right">
              {prospect.phase1SubmittedAt ? (
                <Link
                  href={`/admin/${token}/submissions/phase1`}
                  className="text-xs text-amber-700 underline hover:text-amber-900"
                >
                  view answers ↗
                </Link>
              ) : null}
            </dd>

            <dt className="text-navy-600">Qualification submitted</dt>
            <dd className="font-medium text-navy-900">
              {formatDate(prospect.phase2SubmittedAt)}
            </dd>
            <dd className="text-right">
              {prospect.phase2SubmittedAt ? (
                <Link
                  href={`/admin/${token}/submissions/phase2`}
                  className="text-xs text-amber-700 underline hover:text-amber-900"
                >
                  view answers ↗
                </Link>
              ) : null}
            </dd>

            <dt className="text-navy-600">Intake submitted</dt>
            <dd className="font-medium text-navy-900">
              {formatDate(prospect.phase3SubmittedAt)}
            </dd>
            <dd className="text-right">
              {prospect.phase3SubmittedAt ? (
                <Link
                  href={`/admin/${token}/submissions/phase3`}
                  className="text-xs text-amber-700 underline hover:text-amber-900"
                >
                  view answers ↗
                </Link>
              ) : null}
            </dd>

            <dt className="text-navy-600">Compatibility result</dt>
            <dd className="col-span-2 font-medium text-navy-900">
              {prospect.compatibilityResult ?? "—"}
            </dd>

            {prospect.hardBlockerTriggered && (
              <>
                <dt className="text-navy-600">Hard blocker</dt>
                <dd className="col-span-2 font-medium text-ember-700">
                  {prospect.hardBlockerTriggered}
                </dd>
              </>
            )}
            {prospect.softBlockersTriggered.length > 0 && (
              <>
                <dt className="text-navy-600">Soft blockers</dt>
                <dd className="col-span-2 font-medium text-navy-900">
                  {prospect.softBlockersTriggered.join(", ")}
                </dd>
              </>
            )}
          </dl>
        </article>

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
          <KV
            label="Extra locations"
            value={
              prospect.extraLocations > 0
                ? `${prospect.extraLocations} (£${prospect.extraLocations * 15} setup, no monthly)`
                : "None"
            }
          />
        </Section>

        {/* ---------- Onboarding ----------
         *  Custom Section markup (rather than using <Section>) so the
         *  step-progress grid can occupy a full-width row above the
         *  date table. Mixing the progress pills into a 2-col KV grid
         *  put labels and dates in mismatched cells (Notion ticket
         *  May 2026); this layout fixes it. */}
        <article className="rounded-2xl bg-white p-6 shadow-card">
          <h2 className="font-serif text-lg font-semibold text-navy-900">
            Onboarding Hub
          </h2>

          {/* Step progress — own full-width block, never grid-aligned
           *  with the date rows below. Pills given more breathing room
           *  (one column on narrow, two columns wider) so labels like
           *  "Cloudflare" / "Domain" / "Content" don't get truncated
           *  to "Clo..." / "Do..." / "Con...". */}
          <div className="mt-4 border-b border-navy-100 pb-5 text-sm">
            <p className="text-navy-600">
              Step progress (locked steps can be unlocked):
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {stepProgress.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border border-navy-100 bg-cream-50 px-3 py-2"
                >
                  <span
                    title={`Step ${s.num} (${s.id}) ${s.done ? "done" : "pending"}`}
                    className={[
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      s.done
                        ? "bg-green-600 text-white"
                        : "bg-white text-navy-700 ring-2 ring-navy-200",
                    ].join(" ")}
                  >
                    {s.done ? "✓" : s.num}
                  </span>
                  <span className="flex-1 text-xs text-navy-900">
                    {s.label}
                  </span>
                  {s.done && (
                    <UnlockStepButton
                      token={token}
                      stepId={s.id}
                      stepLabel={s.label}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Date table — separate dl below the progress block so
           *  labels and dates stay aligned regardless of how many
           *  step pills the progress grid renders. */}
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
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
          </dl>
        </article>

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

      {/* ---------- Google reviews (GBP module) ---------- */}
      {hasGbpModule && (
        <div className="mt-8">
          <h2 className="font-serif text-2xl font-semibold text-navy-900">
            Google reviews
          </h2>
          <div className="mt-3">
            <GbpAdminCard
              snapshot={gbpSnapshot}
              gbpUrl={
                ((prospect.onboardingData ?? {}) as {
                  tools?: { gbpUrl?: string };
                }).tools?.gbpUrl ?? null
              }
              gbpPlaceId={
                ((prospect.onboardingData ?? {}) as {
                  tools?: { gbpPlaceId?: string };
                }).tools?.gbpPlaceId ?? null
              }
              gbpResolutionError={
                ((prospect.onboardingData ?? {}) as {
                  tools?: { gbpResolutionError?: string };
                }).tools?.gbpResolutionError ?? null
              }
            />
          </div>
        </div>
      )}

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
            Module add/remove + cancellation requests from the
            customer dashboard (post-launch, unlimited) AND legacy
            pre-launch one-round entries from the Hub. Each pending
            row shows the exact Stripe op needed — action by the
            effective date.
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

      {/* ---------- Monthly allowances (admin grants) ---------- */}
      <div className="mt-8">
        <AdminGrantPanel
          token={token}
          monthKey={currentMonthKey()}
          initialBonuses={{
            changeRequests: getAdminGrant(prospect, "changeRequests"),
            offers: getAdminGrant(prospect, "offers"),
            newsletters: getAdminGrant(prospect, "newsletters"),
          }}
        />
      </div>

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

      {/* ---------- Pre-launch review edits (Hub Step 5) ---------- */}
      {(() => {
        const reviewEdits =
          ((prospect.onboardingData ?? {}) as {
            review?: { edits?: import("@/lib/onboarding").ReviewEdit[] };
          }).review?.edits ?? [];
        if (reviewEdits.length === 0) return null;
        return (
          <div className="mt-8">
            <h2 className="font-serif text-2xl font-semibold text-navy-900">
              Pre-launch review edits{" "}
              <span className="text-sm font-normal text-navy-500">
                ({reviewEdits.length})
              </span>
            </h2>
            <p className="mt-2 text-sm text-navy-600">
              Edits the customer submitted via the Hub Step 5 Review.
              Cowork classified + (where confident) auto-applied each.
              Anything escalated lands here for you to approve or reject.
            </p>
            <ul className="mt-4 space-y-4">
              {reviewEdits.map((re) => (
                <li
                  key={re.id}
                  // Same anchor pattern as change-requests for the
                  // step6 escalation deep links (/admin/[token]#re-<id>).
                  id={`re-${re.id}`}
                  className="scroll-mt-24 rounded-xl border border-navy-100 bg-white p-5 shadow-card target:ring-4 target:ring-amber-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-navy-500">
                      <span className="font-semibold text-navy-900">
                        Submitted {formatDateTime(re.submittedAt)}
                      </span>
                      <span className="ml-2 font-mono text-[11px]">
                        {re.id.slice(0, 8)}
                      </span>
                      <span
                        className={[
                          "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          re.status === "submitted"
                            ? "bg-amber-100 text-amber-900"
                            : re.status === "applied"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800",
                        ].join(" ")}
                      >
                        {re.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-navy-800">
                    {re.message}
                  </p>
                  <ReviewEditEditor token={token} edit={re} />
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

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

      {/* ---------- Incidents ---------- */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-semibold text-navy-900">
          Incidents{" "}
          <span className="text-sm font-normal text-navy-500">
            ({customerExceptions.length})
          </span>
          {customerExceptions.some((e) => !e.resolved) && (
            <span className="ml-2 inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
              {customerExceptions.filter((e) => !e.resolved).length} open
            </span>
          )}
        </h2>
        {customerExceptions.length === 0 ? (
          <p className="mt-3 text-sm text-navy-600">
            No incidents recorded for this customer.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {customerExceptions.map((ex) => (
              <li
                key={ex.id}
                className={[
                  "rounded-xl border p-4 text-sm shadow-card",
                  ex.resolved
                    ? "border-navy-100 bg-white"
                    : "border-red-200 bg-red-50/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">
                      {ex.step}
                    </span>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        ex.resolved
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800",
                      ].join(" ")}
                    >
                      {ex.resolved ? "resolved" : "open"}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-navy-400">
                    {formatDateTime(ex.detectedAt)}
                  </span>
                </div>
                <p className="mt-2 text-navy-800">{ex.errorMessage}</p>
                {ex.resolved && ex.resolutionNotes && (
                  <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                    {ex.resolutionNotes}
                  </p>
                )}
                {!ex.resolved && (
                  <div className="mt-2">
                    <ResolveExceptionButton exceptionId={ex.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Ops activity log ---------- */}
      <div className="mt-8">
        <h2 className="font-serif text-2xl font-semibold text-navy-900">
          Ops activity{" "}
          <span className="text-sm font-normal text-navy-500">
            (last {customerActions.length})
          </span>
        </h2>
        {customerActions.length === 0 ? (
          <p className="mt-3 text-sm text-navy-600">
            No ops activity recorded yet.
          </p>
        ) : (
          <div className="mt-4 rounded-xl border border-navy-100 bg-white shadow-card">
            <div className="max-h-80 divide-y divide-navy-100 overflow-y-auto">
              {customerActions.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    aria-hidden="true"
                    className={[
                      "inline-flex h-2 w-2 shrink-0 rounded-full",
                      a.status === "ok"
                        ? "bg-green-500"
                        : a.status === "fail"
                          ? "bg-red-500"
                          : "bg-navy-300",
                    ].join(" ")}
                  />
                  <span className="inline-flex rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">
                    {a.step}
                  </span>
                  <span className="flex-1 truncate text-xs text-navy-700">
                    {a.notes}
                  </span>
                  <span className="shrink-0 text-[10px] text-navy-400">
                    {formatDateTime(a.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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

/** GBP module card — admin overview of the reviews pipeline for
 *  one customer. Shows everything we need to verify "is the GBP
 *  feed wired up and healthy?" without leaving the page: which
 *  listing we resolved, current rating, count, last refresh,
 *  last error (if any), and the raw place_id for ad-hoc Places
 *  API debugging. */
function GbpAdminCard({
  snapshot,
  gbpUrl,
  gbpPlaceId,
  gbpResolutionError,
}: {
  snapshot: Awaited<ReturnType<typeof readSnapshot>>;
  gbpUrl: string | null;
  gbpPlaceId: string | null;
  gbpResolutionError: string | null;
}) {
  const stateColour = !gbpPlaceId
    ? "border-navy-200"
    : snapshot?.lastError
      ? "border-ember-300"
      : isStale(snapshot?.fetchedAt)
        ? "border-amber-300"
        : "border-green-300";
  return (
    <article
      className={`rounded-2xl border-2 ${stateColour} bg-white p-6 shadow-card`}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <KV label="Resolution" value={resolutionLabel(gbpPlaceId, snapshot, gbpResolutionError)} />
        {snapshot?.displayName && (
          <KV label="Matched listing" value={snapshot.displayName} />
        )}
        {snapshot?.formattedAddress && (
          <KV label="Address" value={snapshot.formattedAddress} />
        )}
        {gbpPlaceId && (
          <KV label="Place ID" value={gbpPlaceId} />
        )}
        {gbpUrl && (
          <>
            <dt className="text-navy-600">Customer URL</dt>
            <dd className="font-medium text-navy-900">
              <a
                href={gbpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link break-all"
              >
                {gbpUrl}
              </a>
            </dd>
          </>
        )}
        {snapshot && (
          <>
            <KV
              label="Rating"
              value={
                snapshot.rating !== null
                  ? `${snapshot.rating.toFixed(1)} ★ (${snapshot.totalReviews ?? 0} reviews)`
                  : "no rating yet"
              }
            />
            <KV
              label="Top reviews stored"
              value={`${snapshot.topReviews.length} review(s)`}
            />
            <KV
              label="Last refreshed"
              value={formatAge(snapshot.fetchedAt)}
            />
          </>
        )}
        {snapshot?.lastError && (
          <KV
            label="Last error"
            value={snapshot.lastError}
            tone="ember"
          />
        )}
        {gbpResolutionError && (
          <KV
            label="Resolution error"
            value={gbpResolutionError}
            tone="ember"
          />
        )}
      </dl>
      {snapshot && snapshot.topReviews.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-navy-700">
            Show {snapshot.topReviews.length} stored review(s)
          </summary>
          <ul className="mt-3 space-y-3">
            {snapshot.topReviews.map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-navy-100 bg-cream-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between text-xs text-navy-500">
                  <span className="font-semibold text-navy-700">
                    {r.authorName}
                  </span>
                  <span>
                    {r.rating} ★ · {r.relativeTimeDescription}
                  </span>
                </div>
                <p className="mt-2 text-navy-800">{r.text}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function resolutionLabel(
  placeId: string | null,
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
  resolutionError: string | null,
): string {
  if (!placeId && resolutionError) return "Failed — see error below";
  if (!placeId) return "Pending — waiting for next ops tick";
  if (!snapshot) return "Place_id resolved, first fetch pending";
  if (snapshot.lastError) return "Refresh failed last run";
  return "Healthy";
}

function isStale(fetchedAt?: string): boolean {
  if (!fetchedAt) return false;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return Number.isFinite(ageMs) && ageMs > 48 * 60 * 60 * 1000;
}

function formatAge(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return iso;
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function NeedsAttentionBanner({
  pendingChangeRequests,
  openIncidents,
  pendingReviewEdits,
}: {
  pendingChangeRequests: number;
  openIncidents: number;
  pendingReviewEdits: number;
}) {
  const items: string[] = [];
  if (pendingChangeRequests > 0)
    items.push(
      `${pendingChangeRequests} change request${pendingChangeRequests !== 1 ? "s" : ""} pending`,
    );
  if (openIncidents > 0)
    items.push(
      `${openIncidents} open incident${openIncidents !== 1 ? "s" : ""}`,
    );
  if (pendingReviewEdits > 0)
    items.push(
      `${pendingReviewEdits} review edit${pendingReviewEdits !== 1 ? "s" : ""} pending`,
    );
  if (items.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-3">
      <p className="text-sm font-semibold text-amber-900">
        Needs attention
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-xs text-amber-800">
            • {item}
          </li>
        ))}
      </ul>
    </div>
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
