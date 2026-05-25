// /admin — internal fleet view for Ben.
//
// Server component: fetches all prospects from the Notion Prospects DB
// + runs health checks across the connected services + hands the data
// to <AdminProspectList /> for rendering. The client component owns
// search + filter + table interactions; this server file owns auth
// (via middleware Basic Auth) + data fetching + the health strip.
//
// Auth: HTTP Basic Auth via src/middleware.ts. The user lands here
// after the browser handles the password prompt — by the time this
// component runs, they're already authenticated.

import type { Metadata } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listAllProspects, type ProspectRecord } from "@/lib/notion-prospects";
import { verifyNotionDatabases } from "@/lib/notion";
import { isStripeConfigured } from "@/lib/stripe";
import AdminProspectList from "@/components/admin/AdminProspectList";
import AnalyticsCard from "@/components/AnalyticsCard";
import SentryAlertsPanel from "@/components/admin/SentryAlertsPanel";
import {
  listSentryAlerts,
  type SentryAlertRow,
} from "@/lib/d1-sentry";
import type { D1Database } from "@/lib/d1-analytics";
import { site } from "@/lib/site";

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

  // Sentry alerts inbox — top 20 open alerts. D1 read on every
  // page load (fine: tiny query, fast). Empty array when the
  // binding is missing or no alerts have ever fired.
  let sentryAlerts: SentryAlertRow[] = [];
  try {
    const cfCtx = getCloudflareContext();
    const cfEnv = (cfCtx?.env ?? {}) as {
      pandemonium_analytics?: D1Database;
    };
    const d1 = cfEnv.pandemonium_analytics;
    if (d1) {
      sentryAlerts = await listSentryAlerts(d1, { status: "open", limit: 20 });
    }
  } catch {
    // D1 unavailable — render the panel empty rather than fail
    // the whole admin page.
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
            All prospects across Phases 1–3. Use the search to find anyone
            quickly; the filter chips highlight rows that need your attention
            (open change requests or pending replies).
          </p>
        </header>

        {/* Marketing-site analytics — at the top so it is the first
            thing you see when opening /admin. Collapsible inside
            the card itself. */}
        <div className="mb-8">
          <AnalyticsCard
            token="@self"
            domain="modu-forge.co.uk"
            title="📊 Marketing site analytics"
            apiPath="/api/admin/analytics"
          />
        </div>

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

        {/* Sentry alerts inbox — top of the page so they're impossible
            to miss. Hidden entirely when the queue is empty. */}
        {sentryAlerts.length > 0 && (
          <div className="mb-8">
            <SentryAlertsPanel alerts={sentryAlerts} />
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
          <AdminProspectList prospects={prospects} baseUrl={baseUrl} />
        )}
      </div>
    </section>
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
