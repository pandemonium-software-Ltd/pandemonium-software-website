import type { Metadata } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listAllProspects, type ProspectRecord } from "@/lib/notion-prospects";
import { verifyNotionDatabases } from "@/lib/notion";
import { isStripeConfigured } from "@/lib/stripe";
import AdminProspectList from "@/components/admin/AdminProspectList";
import AnalyticsCard from "@/components/AnalyticsCard";
import SentryAlertsPanel from "@/components/admin/SentryAlertsPanel";
import BuildMonitorPanel from "@/components/admin/BuildMonitorPanel";
import CustomerInsightPanel from "@/components/admin/CustomerInsightPanel";
import RunMonitorPanel from "@/components/admin/RunMonitorPanel";
import BusinessHealthPanel from "@/components/admin/BusinessHealthPanel";
import OpsActivityPanel from "@/components/admin/OpsActivityPanel";
import {
  listSentryAlerts,
  countOpenSentryAlerts,
  type SentryAlertRow,
} from "@/lib/d1-sentry";
import {
  listExceptions,
  listAuditEntries,
  countUnresolvedExceptions,
  countRecentActions,
  type OpsException,
  type OpsAuditEntry,
  type PendingAdminAction,
} from "@/lib/notion-ops";
import type { D1Database } from "@/lib/d1-analytics";
import { site } from "@/lib/site";
import {
  computeKpis,
  computeBuildMetrics,
  computeInsightMetrics,
  computeRunMetrics,
  computeBusinessHealth,
  cronHealthStatus,
  type CronHealthEntry,
  type GbpIssue,
  type HealthCheckRow,
} from "@/lib/admin-metrics";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;

  let prospects: ProspectRecord[] = [];
  let loadError: string | null = null;
  try {
    prospects = await listAllProspects();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // D1 queries — Sentry alerts + cron health + GBP issues.
  // All wrapped in try/catch so a D1 outage degrades gracefully.
  let sentryAlerts: SentryAlertRow[] = [];
  let sentryOpenCount = 0;
  let sentryResolvedCount = 0;
  let analyticsLastRan: string | null = null;
  let gbpLastFetched: string | null = null;
  let gbpIssues: GbpIssue[] = [];
  let healthCheckRows: HealthCheckRow[] = [];

  try {
    const cfCtx = getCloudflareContext();
    const cfEnv = (cfCtx?.env ?? {}) as {
      pandemonium_analytics?: D1Database;
    };
    const d1 = cfEnv.pandemonium_analytics;
    if (d1) {
      const [alerts, openCount, resolvedAlerts, analyticsRow, gbpFreshness, gbpErrors, healthRows] =
        await Promise.all([
          listSentryAlerts(d1, { status: "open", limit: 20 }),
          countOpenSentryAlerts(d1),
          listSentryAlerts(d1, { status: "resolved", limit: 1 }).then(
            (rows) => rows.length,
          ),
          d1
            .prepare(
              `SELECT MAX(captured_at) AS last_ran FROM daily_analytics WHERE token = '@self'`,
            )
            .first<{ last_ran: string | null }>(),
          d1
            .prepare(`SELECT MAX(fetched_at) AS last_fetched FROM gbp_reviews`)
            .first<{ last_fetched: string | null }>(),
          d1
            .prepare(
              `SELECT token, last_error, fetched_at FROM gbp_reviews WHERE last_error IS NOT NULL`,
            )
            .all<{ token: string; last_error: string; fetched_at: string }>(),
          d1
            .prepare(
              `SELECT check_type, check_key, status, detail, checked_at
               FROM business_health_checks
               ORDER BY checked_at DESC
               LIMIT 100`,
            )
            .all<HealthCheckRow>()
            .then((r) => r.results ?? [])
            .catch(() => [] as HealthCheckRow[]),
        ]);

      sentryAlerts = alerts;
      sentryOpenCount = openCount;
      sentryResolvedCount = resolvedAlerts;
      analyticsLastRan = analyticsRow?.last_ran ?? null;
      gbpLastFetched = gbpFreshness?.last_fetched ?? null;

      const gbpErrorRows = gbpErrors.results ?? [];
      const prospectMap = new Map(prospects.map((p) => [p.token, p]));
      healthCheckRows = healthRows;
      gbpIssues = gbpErrorRows.map((r) => ({
        token: r.token,
        name: prospectMap.get(r.token)?.name ?? r.token,
        lastError: r.last_error,
        fetchedAt: r.fetched_at,
      }));
    }
  } catch {
    // D1 unavailable — panels render with empty/default data.
  }

  // Ops activity — exceptions + audit log from Notion.
  let opsExceptions: OpsException[] = [];
  let opsActions: OpsAuditEntry[] = [];
  let unresolvedIncidents = 0;
  let actionCounts = { total: 0, ok: 0, skip: 0, fail: 0 };
  try {
    [opsExceptions, opsActions, unresolvedIncidents, actionCounts] =
      await Promise.all([
        listExceptions({ unresolvedOnly: true, limit: 20 }),
        listAuditEntries({ limit: 30 }),
        countUnresolvedExceptions(),
        countRecentActions(24),
      ]);
  } catch {
    // Notion unavailable — panels render with empty data.
  }

  // Pending admin actions — computed from already-fetched prospects.
  const pendingActions: PendingAdminAction[] = [];
  for (const p of prospects) {
    for (const cr of p.changeRequests) {
      if (cr.status === "pending" || cr.status === "in-progress") {
        pendingActions.push({
          type: "change-request",
          prospectName: p.name,
          prospectToken: p.token,
          id: cr.id,
          message: cr.message,
          submittedAt: cr.submittedAt,
        });
      }
    }
    const reviewEdits = (
      (p.onboardingData as { review?: { edits?: Array<{ id: string; message: string; submittedAt: string; status: string }> } } | null)
        ?.review?.edits ?? []
    );
    for (const re of reviewEdits) {
      if (re.status === "submitted") {
        pendingActions.push({
          type: "review-edit",
          prospectName: p.name,
          prospectToken: p.token,
          id: re.id,
          message: re.message,
          submittedAt: re.submittedAt,
        });
      }
    }
  }
  pendingActions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  // Health checks for connected services.
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

  // Compute dashboard metrics from prospect data.
  const kpis = computeKpis(prospects);
  const buildMetrics = computeBuildMetrics(prospects);
  const insightMetrics = computeInsightMetrics(prospects);

  const cronHealth: CronHealthEntry[] = [
    {
      label: "Analytics",
      lastRan: analyticsLastRan,
      status: cronHealthStatus(analyticsLastRan),
    },
    {
      label: "GBP reviews",
      lastRan: gbpLastFetched,
      status: cronHealthStatus(gbpLastFetched),
    },
  ];

  const runMetrics = computeRunMetrics(
    prospects,
    cronHealth,
    gbpIssues,
    sentryOpenCount,
    sentryResolvedCount,
  );

  const businessHealth = computeBusinessHealth(prospects, healthCheckRows);

  return (
    <section className="bg-white py-10 md:py-14">
      <div className="container-content">
        <header className="mb-8">
          <span className="eyebrow">Admin</span>
          <h1 className="font-serif text-3xl font-semibold text-navy-900 md:text-4xl">
            Operations dashboard
          </h1>
          <p className="mt-2 text-sm text-navy-600">
            Fleet view across pipeline, builds, revenue and live sites.
          </p>
        </header>

        {/* KPI strip */}
        <div className="mb-8 grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          <KpiCard label="Prospects" value={kpis.total} />
          <KpiCard label="Enquiries" value={kpis.enquiries} />
          <KpiCard
            label="In onboarding"
            value={kpis.onboarding}
            alert={kpis.stuckBuilds > 0 ? `${kpis.stuckBuilds} stuck` : undefined}
          />
          <KpiCard label="Live" value={kpis.live} />
          <KpiCard
            label="MRR"
            value={`£${kpis.totalMrr}`}
            sub={`${kpis.foundingCount}F / ${kpis.standardCount}S`}
          />
          <KpiCard
            label="Open alerts"
            value={sentryOpenCount}
            alert={sentryOpenCount > 0 ? `${sentryOpenCount} open` : undefined}
          />
          <KpiCard
            label="Incidents"
            value={unresolvedIncidents}
            alert={unresolvedIncidents > 0 ? `${unresolvedIncidents} open` : undefined}
          />
          <KpiCard
            label="Pending"
            value={pendingActions.length}
            alert={pendingActions.length > 0 ? `${pendingActions.length} awaiting` : undefined}
            sub={`${actionCounts.total} auto (24h)`}
          />
        </div>

        {/* Service health strip */}
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

        {/* Dashboard panels */}
        <div className="mb-8 space-y-4">
          <OpsActivityPanel
            exceptions={opsExceptions}
            recentActions={opsActions}
            unresolvedCount={unresolvedIncidents}
            actionCounts={actionCounts}
            pendingActions={pendingActions}
          />
          <BuildMonitorPanel metrics={buildMetrics} />
          <CustomerInsightPanel metrics={insightMetrics} />
          <RunMonitorPanel metrics={runMetrics} />
          <BusinessHealthPanel health={businessHealth} />
        </div>

        {/* Marketing-site analytics */}
        <div className="mb-8">
          <AnalyticsCard
            token="@self"
            domain="modu-forge.co.uk"
            title="Marketing site analytics"
            apiPath="/api/admin/analytics"
          />
        </div>

        {/* Sentry alerts inbox */}
        <div className="mb-8">
          <SentryAlertsPanel alerts={sentryAlerts} />
        </div>

        {/* Prospect pipeline */}
        {prospects.length === 0 && !loadError ? (
          <div className="card bg-cream-50 text-center">
            <p className="text-navy-700">
              No prospects yet. The first one will appear here once someone
              submits the enquiry form.
            </p>
          </div>
        ) : (
          <AdminProspectList prospects={prospects} baseUrl={baseUrl} />
        )}
      </div>
    </section>
  );
}

// ---------- KPI card ----------

function KpiCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: number | string;
  sub?: string;
  alert?: string;
}) {
  return (
    <div className="rounded-xl border-2 border-navy-100 bg-white p-3 text-center">
      <p className="font-mono text-2xl font-bold text-navy-900">
        {typeof value === "number" ? value.toLocaleString("en-GB") : value}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </p>
      {sub && (
        <p className="mt-0.5 text-[10px] text-navy-500">{sub}</p>
      )}
      {alert && (
        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
          {alert}
        </span>
      )}
    </div>
  );
}

// ---------- Health strip primitive ----------

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
