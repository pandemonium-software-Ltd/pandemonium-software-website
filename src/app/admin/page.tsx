// /admin — internal dashboard for Ben.
//
// Lists every prospect in the Notion Prospects DB, sorted by most
// recent. Each row shows the key fields and links out to the Notion
// page (where Ben can edit / add notes), plus the qualify / intake
// links to copy into the L1 / L3 reply emails.
//
// Auth: HTTP Basic Auth via src/middleware.ts. The user lands here
// after the browser handles the password prompt — by the time this
// component runs, they're already authenticated.

import type { Metadata } from "next";
import { listAllProspects, type ProspectRecord } from "@/lib/notion-prospects";
import { verifyNotionDatabases } from "@/lib/notion";
import { isStripeConfigured } from "@/lib/stripe";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Admin — Pandemonium Software",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? site.url;

  let prospects: ProspectRecord[] = [];
  let loadError: string | null = null;
  try {
    prospects = await listAllProspects();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // Health checks for the connected services. If verifyNotionDatabases
  // throws (auth/network), we treat all DBs as unreachable rather than
  // hiding the dashboard.
  type DbCheck = { id: string; title: string } | { error: string };
  type AllDbs = {
    prospects: DbCheck;
    clients: DbCheck;
    assets: DbCheck;
    exceptions: DbCheck;
  };
  let dbHealth: AllDbs;
  try {
    dbHealth = await verifyNotionDatabases();
  } catch (e) {
    const err = { error: e instanceof Error ? e.message : String(e) };
    dbHealth = { prospects: err, clients: err, assets: err, exceptions: err };
  }
  const isOk = (c: DbCheck): c is { id: string; title: string } =>
    "title" in c;

  const stripeReady = isStripeConfigured();

  return (
    <section className="bg-white py-10 md:py-14">
      <div className="container-content">
        <header className="mb-8">
          <span className="eyebrow">Admin</span>
          <h1 className="font-serif text-3xl font-semibold text-navy-900 md:text-4xl">
            Prospect pipeline
          </h1>
          <p className="mt-2 text-sm text-navy-600">
            All prospects across Phases 1–3. Click a Notion link to open the
            full record. Copy the qualify / intake URLs into your L1 / L3
            reply emails.
          </p>
        </header>

        {/* Health strip */}
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCard
            label="Notion: Prospects"
            ok={isOk(dbHealth.prospects)}
            detail={
              isOk(dbHealth.prospects)
                ? dbHealth.prospects.title
                : dbHealth.prospects.error
            }
          />
          <HealthCard
            label="Notion: Clients"
            ok={isOk(dbHealth.clients)}
            detail={
              isOk(dbHealth.clients)
                ? dbHealth.clients.title
                : dbHealth.clients.error
            }
          />
          <HealthCard
            label="Notion: Assets"
            ok={isOk(dbHealth.assets)}
            detail={
              isOk(dbHealth.assets)
                ? dbHealth.assets.title
                : dbHealth.assets.error
            }
          />
          <HealthCard
            label="Stripe"
            ok={stripeReady}
            detail={stripeReady ? "Configured" : "Not yet (Stage 2A Part 2)"}
          />
        </div>

        {loadError && (
          <div className="mb-6 rounded-xl border-2 border-ember-500 bg-white p-4 text-sm text-ember-700">
            <strong>Couldn&apos;t load prospects:</strong> {loadError}
          </div>
        )}

        {prospects.length === 0 && !loadError ? (
          <div className="card bg-cream-50 text-center">
            <p className="text-navy-700">
              No prospects yet. The first one will appear here once someone
              submits the enquiry form.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100 bg-white">
            <table className="min-w-full divide-y divide-navy-100 text-sm">
              <thead className="bg-cream-50 text-left text-xs uppercase tracking-wider text-navy-600">
                <tr>
                  <Th>Name / Business</Th>
                  <Th>Type / Loc</Th>
                  <Th>Status</Th>
                  <Th>Compat</Th>
                  <Th>Fees</Th>
                  <Th>Submitted</Th>
                  <Th>Links</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {prospects.map((p) => (
                  <tr key={p.pageId} className="align-top">
                    <Td>
                      <div className="font-semibold text-navy-900">
                        {p.name}
                      </div>
                      <div className="text-xs text-navy-600">
                        {p.business ?? "—"}
                      </div>
                      <div className="text-xs text-navy-500">{p.email}</div>
                    </Td>
                    <Td>
                      <div className="text-xs">
                        {p.businessType ?? "—"}
                      </div>
                      <div className="text-xs text-navy-500">
                        {p.location ?? "—"}
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td>
                      {p.compatibilityResult ? (
                        <CompatBadge result={p.compatibilityResult} />
                      ) : (
                        <span className="text-xs text-navy-400">—</span>
                      )}
                      {p.hardBlockerTriggered && (
                        <div
                          className="mt-1 max-w-[12rem] truncate text-xs text-ember-700"
                          title={p.hardBlockerTriggered}
                        >
                          {p.hardBlockerTriggered}
                        </div>
                      )}
                      {p.softBlockersTriggered.length > 0 && (
                        <div className="mt-1 max-w-[12rem] text-xs text-navy-500">
                          {p.softBlockersTriggered.length} soft
                        </div>
                      )}
                    </Td>
                    <Td>
                      {p.setupFeeCalculated && p.monthlyFeeCalculated ? (
                        <div>
                          <div className="font-semibold">
                            £{p.setupFeeCalculated} setup
                          </div>
                          <div className="text-xs text-navy-600">
                            £{p.monthlyFeeCalculated}/mo
                          </div>
                          {p.foundingMember && (
                            <div className="text-xs text-ember-700">
                              ★ Founding
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-navy-400">—</span>
                      )}
                    </Td>
                    <Td>
                      {p.phase3SubmittedAt ? (
                        <div>
                          <div className="text-xs">{formatDate(p.phase3SubmittedAt)}</div>
                          <div className="text-xs text-navy-500">P3</div>
                        </div>
                      ) : p.phase2SubmittedAt ? (
                        <div>
                          <div className="text-xs">{formatDate(p.phase2SubmittedAt)}</div>
                          <div className="text-xs text-navy-500">P2</div>
                        </div>
                      ) : p.phase1SubmittedAt ? (
                        <div>
                          <div className="text-xs">{formatDate(p.phase1SubmittedAt)}</div>
                          <div className="text-xs text-navy-500">P1</div>
                        </div>
                      ) : (
                        <span className="text-xs text-navy-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1 text-xs">
                        <a
                          href={p.notionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link"
                        >
                          Notion ↗
                        </a>
                        <CopyLink
                          label="Qualify URL"
                          url={`${baseUrl}/qualify/${p.token}`}
                        />
                        {(p.compatibilityResult === "Accept" ||
                          p.status === "Phase 3 In Progress" ||
                          p.status === "Phase 3 Complete") && (
                          <CopyLink
                            label="Intake URL"
                            url={`${baseUrl}/intake/${p.token}`}
                          />
                        )}
                        {(p.status === "Paid" ||
                          p.status === "Onboarding Started" ||
                          p.status === "Onboarding Complete" ||
                          p.status === "Build Started" ||
                          p.status === "Live") && (
                          <>
                            <CopyLink
                              label="Hub URL"
                              url={`${baseUrl}/onboarding/${p.token}`}
                            />
                            <OnboardingProgress prospect={p} />
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-navy-500">
          {prospects.length} {prospects.length === 1 ? "prospect" : "prospects"}.
          Refresh the page to re-pull from Notion.
        </p>
      </div>
    </section>
  );
}

// ---------- Helper components ----------

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-3">{children}</td>;
}

function HealthCard({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div
      className={[
        "rounded-xl border-2 bg-white p-3 text-sm",
        ok ? "border-green-300" : "border-ember-300",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={[
            "inline-flex h-2.5 w-2.5 rounded-full",
            ok ? "bg-green-500" : "bg-ember-500",
          ].join(" ")}
        />
        <span className="font-semibold text-navy-900">{label}</span>
      </div>
      <p className="mt-1 truncate text-xs text-navy-600">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colour = STATUS_COLOURS[status] ?? "bg-navy-100 text-navy-700";
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colour}`}
    >
      {status}
    </span>
  );
}

const STATUS_COLOURS: Record<string, string> = {
  "Phase 1 Complete": "bg-blue-100 text-blue-800",
  "Phase 1 Email Sent": "bg-blue-100 text-blue-800",
  "Phase 2 Complete": "bg-purple-100 text-purple-800",
  "Phase 2 Accepted": "bg-green-100 text-green-800",
  "Phase 2 Soft Rejected": "bg-red-100 text-red-800",
  "Phase 2 Flagged for Review": "bg-yellow-100 text-yellow-800",
  "Phase 2 Clarification Requested": "bg-yellow-100 text-yellow-800",
  "Phase 3 In Progress": "bg-orange-100 text-orange-800",
  "Phase 3 Complete": "bg-green-100 text-green-800",
  Paid: "bg-green-200 text-green-900",
  "Onboarding Started": "bg-purple-100 text-purple-800",
  "Onboarding Complete": "bg-green-100 text-green-800",
  "Build Started": "bg-orange-100 text-orange-800",
  Live: "bg-green-200 text-green-900",
  Cancelled: "bg-navy-100 text-navy-600",
};

// Tiny "1•2•3•4•5" hub progress strip — filled circles = done, hollow = pending.
// Shown on /admin under the Hub URL link for any post-payment prospect.
function OnboardingProgress({ prospect }: { prospect: ProspectRecord }) {
  const flags = [
    prospect.onboardingStep1Done,
    prospect.onboardingStep2Done,
    prospect.onboardingStep3Done,
    prospect.onboardingStep4Done,
    prospect.onboardingStep5Done,
  ];
  const doneCount = flags.filter(Boolean).length;
  return (
    <div
      className="mt-1 flex items-center gap-1"
      title={`Onboarding: ${doneCount}/5 steps done`}
    >
      <span className="text-[10px] uppercase tracking-wider text-navy-500">
        Hub
      </span>
      {flags.map((done, i) => (
        <span
          key={i}
          aria-label={`Step ${i + 1} ${done ? "done" : "pending"}`}
          className={[
            "inline-block h-2 w-2 rounded-full",
            done ? "bg-green-500" : "bg-navy-200",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

function CompatBadge({ result }: { result: string }) {
  const colour =
    result === "Accept"
      ? "bg-green-100 text-green-800"
      : result === "Soft Reject"
        ? "bg-red-100 text-red-800"
        : result === "Flag for Review"
          ? "bg-yellow-100 text-yellow-800"
          : result === "Clarification Needed"
            ? "bg-yellow-100 text-yellow-800"
            : "bg-navy-100 text-navy-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colour}`}>
      {result}
    </span>
  );
}

function CopyLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="link truncate"
      title={url}
    >
      {label} ↗
    </a>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}
