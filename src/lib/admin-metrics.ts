import type { ProspectRecord } from "./notion-prospects";

// --------------- Types ---------------

export type Kpis = {
  total: number;
  enquiries: number;
  paid: number;
  onboarding: number;
  live: number;
  cancelled: number;
  totalMrr: number;
  totalSetupCollected: number;
  foundingCount: number;
  standardCount: number;
  stuckBuilds: number;
  openChangeRequests: number;
};

export type OnboardingCustomer = {
  token: string;
  name: string;
  business: string;
  status: string;
  steps: {
    cloudflare: boolean;
    domain: boolean;
    tools: boolean;
    assets: boolean;
    review: boolean;
    content: boolean;
  };
  stepsCompleted: number;
  totalSteps: number;
  startedAt: string | undefined;
  daysInOnboarding: number;
  goLiveDate: string | undefined;
  daysUntilLaunch: number | null;
  isStuck: boolean;
  hasBuildFailure: boolean;
  lastBuildTriggered: string | undefined;
};

export type BuildMetrics = {
  onboardingCustomers: OnboardingCustomer[];
  stepCompletionRates: Record<string, number>;
  upcomingLaunches: OnboardingCustomer[];
  buildFailures: OnboardingCustomer[];
};

export type FunnelStage = {
  label: string;
  count: number;
};

export type NicheEntry = { niche: string; count: number };
export type ModuleEntry = { module: string; count: number };
export type LocationEntry = { location: string; count: number };

export type InsightMetrics = {
  conversionFunnel: FunnelStage[];
  revenueByTier: {
    founding: { count: number; mrr: number };
    standard: { count: number; mrr: number };
  };
  pipelineByNiche: NicheEntry[];
  modulePopularity: ModuleEntry[];
  locationSpread: LocationEntry[];
  totalMrr: number;
  totalSetupCollected: number;
};

export type LiveSite = {
  token: string;
  name: string;
  business: string;
  zoneStatus: string;
  siteLiveAt: string | undefined;
};

export type CronHealthEntry = {
  label: string;
  lastRan: string | null;
  status: "ok" | "warn" | "error";
};

export type GbpIssue = {
  token: string;
  name: string;
  lastError: string;
  fetchedAt: string;
};

export type RunMetrics = {
  liveSites: LiveSite[];
  zoneStatusBreakdown: Record<string, number>;
  cronHealth: CronHealthEntry[];
  gbpIssues: GbpIssue[];
  sentryOpen: number;
  sentryResolved: number;
};

// --------------- Status sets ---------------

const ONBOARDING_STATUSES = new Set([
  "Paid",
  "Onboarding Started",
  "Onboarding Complete",
  "Build Started",
]);

const PAID_OR_LATER = new Set([
  "Paid",
  "Onboarding Started",
  "Onboarding Complete",
  "Build Started",
  "Live",
]);

const ENQUIRY_STATUSES = new Set([
  "Phase 1 Complete",
  "Phase 1 Email Sent",
  "Phase 2 Complete",
  "Phase 2 Accepted",
  "Phase 2 Soft Rejected",
  "Phase 2 Flagged for Review",
  "Phase 2 Clarification Requested",
  "Phase 3 In Progress",
  "Phase 3 Complete",
]);

const STUCK_THRESHOLD_DAYS = 7;
const UPCOMING_LAUNCH_DAYS = 14;

// --------------- Helpers ---------------

function daysBetween(from: string, to: Date): number {
  const diff = to.getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function daysUntil(dateStr: string, now: Date): number {
  const diff = new Date(dateStr).getTime() - now.getTime();
  return Math.ceil(diff / 86_400_000);
}

function countSteps(p: ProspectRecord): {
  steps: OnboardingCustomer["steps"];
  completed: number;
  total: number;
} {
  const steps = {
    cloudflare: p.onboardingStep1Done,
    domain: p.onboardingStep2Done,
    tools: p.onboardingStep3Done,
    assets: p.onboardingStep4Done,
    review: p.onboardingStep5Done,
    content: p.onboardingContentDone,
  };
  const vals = Object.values(steps);
  return {
    steps,
    completed: vals.filter(Boolean).length,
    total: vals.length,
  };
}

// --------------- computeKpis ---------------

export function computeKpis(prospects: ProspectRecord[]): Kpis {
  let enquiries = 0;
  let paid = 0;
  let onboarding = 0;
  let live = 0;
  let cancelled = 0;
  let totalMrr = 0;
  let totalSetupCollected = 0;
  let foundingCount = 0;
  let standardCount = 0;
  let stuckBuilds = 0;
  let openChangeRequests = 0;
  const now = new Date();

  for (const p of prospects) {
    if (ENQUIRY_STATUSES.has(p.status)) enquiries++;
    if (ONBOARDING_STATUSES.has(p.status)) onboarding++;
    if (p.status === "Live") live++;
    if (p.status === "Cancelled") cancelled++;

    if (PAID_OR_LATER.has(p.status) || p.status === "Live") {
      paid++;
      totalMrr += p.monthlyFeeCalculated ?? 0;
      totalSetupCollected += p.setupFeeCalculated ?? 0;
      if (p.foundingMember) foundingCount++;
      else standardCount++;
    }

    if (
      ONBOARDING_STATUSES.has(p.status) &&
      p.onboardingStartedAt &&
      daysBetween(p.onboardingStartedAt, now) > STUCK_THRESHOLD_DAYS
    ) {
      const { completed, total } = countSteps(p);
      if (completed < total) stuckBuilds++;
    }

    for (const cr of p.changeRequests) {
      if (cr.status === "pending" || cr.status === "in-progress") {
        openChangeRequests++;
      }
    }
  }

  return {
    total: prospects.length,
    enquiries,
    paid,
    onboarding,
    live,
    cancelled,
    totalMrr,
    totalSetupCollected,
    foundingCount,
    standardCount,
    stuckBuilds,
    openChangeRequests,
  };
}

// --------------- computeBuildMetrics ---------------

export function computeBuildMetrics(
  prospects: ProspectRecord[],
): BuildMetrics {
  const now = new Date();
  const onboardingCustomers: OnboardingCustomer[] = [];

  const stepCounts = {
    cloudflare: 0,
    domain: 0,
    tools: 0,
    assets: 0,
    review: 0,
    content: 0,
  };
  let onboardingTotal = 0;

  for (const p of prospects) {
    if (!ONBOARDING_STATUSES.has(p.status)) continue;
    onboardingTotal++;

    const { steps, completed, total } = countSteps(p);

    if (steps.cloudflare) stepCounts.cloudflare++;
    if (steps.domain) stepCounts.domain++;
    if (steps.tools) stepCounts.tools++;
    if (steps.assets) stepCounts.assets++;
    if (steps.review) stepCounts.review++;
    if (steps.content) stepCounts.content++;

    const daysIn = p.onboardingStartedAt
      ? daysBetween(p.onboardingStartedAt, now)
      : 0;

    const launchDays =
      p.goLiveDate ? daysUntil(p.goLiveDate, now) : null;

    onboardingCustomers.push({
      token: p.token,
      name: p.name,
      business: p.business ?? "",
      status: p.status,
      steps,
      stepsCompleted: completed,
      totalSteps: total,
      startedAt: p.onboardingStartedAt,
      daysInOnboarding: daysIn,
      goLiveDate: p.goLiveDate,
      daysUntilLaunch: launchDays,
      isStuck: daysIn > STUCK_THRESHOLD_DAYS && completed < total,
      hasBuildFailure: !!p.previewBuildFailedAt,
      lastBuildTriggered: p.previewBuildTriggeredAt ?? p.finalLaunchTriggeredAt,
    });
  }

  const pct = (n: number) =>
    onboardingTotal > 0 ? Math.round((n / onboardingTotal) * 100) : 0;

  return {
    onboardingCustomers: onboardingCustomers.sort(
      (a, b) => b.daysInOnboarding - a.daysInOnboarding,
    ),
    stepCompletionRates: {
      "1. Cloudflare": pct(stepCounts.cloudflare),
      "2. Domain": pct(stepCounts.domain),
      "3. Tools": pct(stepCounts.tools),
      "4. Assets": pct(stepCounts.assets),
      "5. Review": pct(stepCounts.review),
      "6. Content": pct(stepCounts.content),
    },
    upcomingLaunches: onboardingCustomers.filter(
      (c) =>
        c.daysUntilLaunch !== null &&
        c.daysUntilLaunch >= 0 &&
        c.daysUntilLaunch <= UPCOMING_LAUNCH_DAYS,
    ),
    buildFailures: onboardingCustomers.filter((c) => c.hasBuildFailure),
  };
}

// --------------- computeInsightMetrics ---------------

export function computeInsightMetrics(
  prospects: ProspectRecord[],
): InsightMetrics {
  const funnelMap: Record<string, number> = {
    "Phase 1": 0,
    "Phase 2": 0,
    "Phase 3": 0,
    Paid: 0,
    Onboarding: 0,
    Live: 0,
  };

  const nicheMap = new Map<string, number>();
  const moduleMap = new Map<string, number>();
  const locationMap = new Map<string, number>();

  let foundingCount = 0;
  let foundingMrr = 0;
  let standardCount = 0;
  let standardMrr = 0;
  let totalMrr = 0;
  let totalSetup = 0;

  for (const p of prospects) {
    if (p.status === "Cancelled") continue;

    // Funnel
    if (p.status.startsWith("Phase 1")) funnelMap["Phase 1"]++;
    else if (p.status.startsWith("Phase 2")) funnelMap["Phase 2"]++;
    else if (p.status.startsWith("Phase 3")) funnelMap["Phase 3"]++;
    else if (p.status === "Paid") funnelMap["Paid"]++;
    else if (ONBOARDING_STATUSES.has(p.status) && p.status !== "Paid")
      funnelMap["Onboarding"]++;
    else if (p.status === "Live") funnelMap["Live"]++;

    // Niche
    const niche = p.businessType?.trim();
    if (niche) nicheMap.set(niche, (nicheMap.get(niche) ?? 0) + 1);

    // Location
    const loc = p.location?.trim();
    if (loc) locationMap.set(loc, (locationMap.get(loc) ?? 0) + 1);

    // Modules (from anyone who's chosen)
    for (const m of p.moduleSelections) {
      moduleMap.set(m, (moduleMap.get(m) ?? 0) + 1);
    }

    // Revenue (paying customers only)
    if (PAID_OR_LATER.has(p.status) || p.status === "Live") {
      const monthly = p.monthlyFeeCalculated ?? 0;
      const setup = p.setupFeeCalculated ?? 0;
      totalMrr += monthly;
      totalSetup += setup;
      if (p.foundingMember) {
        foundingCount++;
        foundingMrr += monthly;
      } else {
        standardCount++;
        standardMrr += monthly;
      }
    }
  }

  const sortedMap = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1]);

  return {
    conversionFunnel: [
      { label: "Phase 1", count: funnelMap["Phase 1"] },
      { label: "Phase 2", count: funnelMap["Phase 2"] },
      { label: "Phase 3", count: funnelMap["Phase 3"] },
      { label: "Paid", count: funnelMap["Paid"] },
      { label: "Onboarding", count: funnelMap["Onboarding"] },
      { label: "Live", count: funnelMap["Live"] },
    ],
    revenueByTier: {
      founding: { count: foundingCount, mrr: foundingMrr },
      standard: { count: standardCount, mrr: standardMrr },
    },
    pipelineByNiche: sortedMap(nicheMap).map(([niche, count]) => ({
      niche,
      count,
    })),
    modulePopularity: sortedMap(moduleMap).map(([module, count]) => ({
      module,
      count,
    })),
    locationSpread: sortedMap(locationMap).map(([location, count]) => ({
      location,
      count,
    })),
    totalMrr,
    totalSetupCollected: totalSetup,
  };
}

// --------------- computeRunMetrics ---------------

export function computeRunMetrics(
  prospects: ProspectRecord[],
  cronHealth: CronHealthEntry[],
  gbpIssues: GbpIssue[],
  sentryOpen: number,
  sentryResolved: number,
): RunMetrics {
  const liveSites: LiveSite[] = [];
  const zoneBreakdown: Record<string, number> = {};

  for (const p of prospects) {
    if (p.status !== "Live") continue;

    liveSites.push({
      token: p.token,
      name: p.name,
      business: p.business ?? "",
      zoneStatus: p.cloudflareZoneStatus ?? "unknown",
      siteLiveAt: p.siteLiveAt,
    });

    const zs = p.cloudflareZoneStatus ?? "unknown";
    zoneBreakdown[zs] = (zoneBreakdown[zs] ?? 0) + 1;
  }

  return {
    liveSites,
    zoneStatusBreakdown: zoneBreakdown,
    cronHealth,
    gbpIssues,
    sentryOpen,
    sentryResolved,
  };
}

// --------------- Business Health ---------------

export type SecretHealth = {
  key: string;
  lastRotated: string;
  daysAgo: number;
  status: "ok" | "warn" | "error";
};

export type GdprHealth = {
  activeDataSubjects: number;
  pendingScrubs: { token: string; name: string; retentionUntil: string; daysUntil: number }[];
  overdueScrubs: { token: string; name: string; retentionUntil: string; daysOverdue: number }[];
  completedScrubs: number;
};

export type CiHealth = {
  lastRan: string | null;
  status: "pass" | "warn" | "fail" | "unknown";
  npmAudit: { status: string; high: number; critical: number } | null;
  typecheck: { status: string } | null;
  tests: { status: string; passed: number; failed: number } | null;
  majorOutdated: number;
};

export type AuditHealth = {
  lastAuditDate: string | null;
  daysSinceAudit: number | null;
  status: "ok" | "warn" | "error";
  findings: number;
  fixed: number;
  accepted: number;
};

export type BusinessHealth = {
  gdpr: GdprHealth;
  ci: CiHealth;
  audit: AuditHealth;
  secrets: SecretHealth[];
  overallStatus: "ok" | "warn" | "error";
};

export type HealthCheckRow = {
  check_type: string;
  check_key: string;
  status: string;
  detail: string | null;
  checked_at: string;
};

export function computeBusinessHealth(
  prospects: ProspectRecord[],
  healthRows: HealthCheckRow[],
): BusinessHealth {
  const now = new Date();

  // --- GDPR ---
  let activeDataSubjects = 0;
  let completedScrubs = 0;
  const pendingScrubs: GdprHealth["pendingScrubs"] = [];
  const overdueScrubs: GdprHealth["overdueScrubs"] = [];

  for (const p of prospects) {
    if (p.dataScrubbedAt) {
      completedScrubs++;
      continue;
    }
    if (p.status !== "Cancelled") {
      activeDataSubjects++;
      continue;
    }
    if (p.dataRetentionUntil) {
      const retDate = new Date(p.dataRetentionUntil);
      const diffDays = Math.ceil((retDate.getTime() - now.getTime()) / 86_400_000);
      if (diffDays < 0) {
        overdueScrubs.push({ token: p.token, name: p.name, retentionUntil: p.dataRetentionUntil, daysOverdue: Math.abs(diffDays) });
      } else {
        pendingScrubs.push({ token: p.token, name: p.name, retentionUntil: p.dataRetentionUntil, daysUntil: diffDays });
      }
    }
  }

  // --- CI ---
  const latestCi = healthRows
    .filter((r) => r.check_type === "ci_run")
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0];

  let ciHealth: CiHealth = {
    lastRan: null,
    status: "unknown",
    npmAudit: null,
    typecheck: null,
    tests: null,
    majorOutdated: 0,
  };

  if (latestCi) {
    let detail: Record<string, unknown> = {};
    try { detail = JSON.parse(latestCi.detail ?? "{}"); } catch { /* */ }
    const npm = detail.npm_audit as { status?: string; high?: number; critical?: number } | undefined;
    const tc = detail.typecheck as { status?: string } | undefined;
    const tests = detail.tests as { status?: string; passed?: number; failed?: number } | undefined;
    const outdated = detail.outdated as { major_behind?: number } | undefined;

    ciHealth = {
      lastRan: latestCi.checked_at,
      status: latestCi.status as CiHealth["status"],
      npmAudit: npm ? { status: npm.status ?? "unknown", high: npm.high ?? 0, critical: npm.critical ?? 0 } : null,
      typecheck: tc ? { status: tc.status ?? "unknown" } : null,
      tests: tests ? { status: tests.status ?? "unknown", passed: tests.passed ?? 0, failed: tests.failed ?? 0 } : null,
      majorOutdated: outdated?.major_behind ?? 0,
    };
  }

  // --- Security audit ---
  const latestAudit = healthRows
    .filter((r) => r.check_type === "security_audit")
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0];

  let auditHealth: AuditHealth = {
    lastAuditDate: null, daysSinceAudit: null,
    status: "error", findings: 0, fixed: 0, accepted: 0,
  };

  if (latestAudit) {
    const days = daysBetween(latestAudit.checked_at, now);
    let detail: Record<string, number> = {};
    try { detail = JSON.parse(latestAudit.detail ?? "{}"); } catch { /* */ }
    auditHealth = {
      lastAuditDate: latestAudit.checked_at,
      daysSinceAudit: days,
      status: days < 95 ? "ok" : days < 180 ? "warn" : "error",
      findings: detail.findings ?? 0,
      fixed: detail.fixed ?? 0,
      accepted: detail.accepted ?? 0,
    };
  }

  // --- Secrets ---
  const SECRET_KEYS = [
    "NOTION_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY", "SESSION_SECRET", "INTERNAL_BUILD_SECRET", "GITHUB_TOKEN",
  ];
  const secretMap = new Map<string, HealthCheckRow>();
  for (const r of healthRows) {
    if (r.check_type !== "secret_rotation") continue;
    const existing = secretMap.get(r.check_key);
    if (!existing || r.checked_at > existing.checked_at) {
      secretMap.set(r.check_key, r);
    }
  }
  const secrets: SecretHealth[] = SECRET_KEYS.map((key) => {
    const row = secretMap.get(key);
    if (!row) return { key, lastRotated: "unknown", daysAgo: 999, status: "error" as const };
    const days = daysBetween(row.checked_at, now);
    return {
      key,
      lastRotated: row.checked_at,
      daysAgo: days,
      status: days < 180 ? "ok" as const : days < 365 ? "warn" as const : "error" as const,
    };
  });

  // --- Overall ---
  const hasError =
    overdueScrubs.length > 0 ||
    ciHealth.status === "fail" ||
    auditHealth.status === "error" ||
    secrets.some((s) => s.status === "error");
  const hasWarn =
    pendingScrubs.some((s) => s.daysUntil < 7) ||
    ciHealth.status === "warn" ||
    auditHealth.status === "warn" ||
    secrets.some((s) => s.status === "warn");

  return {
    gdpr: { activeDataSubjects, pendingScrubs, overdueScrubs, completedScrubs },
    ci: ciHealth,
    audit: auditHealth,
    secrets,
    overallStatus: hasError ? "error" : hasWarn ? "warn" : "ok",
  };
}

// --------------- cronHealthStatus ---------------

export function cronHealthStatus(
  lastRan: string | null,
): "ok" | "warn" | "error" {
  if (!lastRan) return "error";
  const hoursAgo =
    (Date.now() - new Date(lastRan).getTime()) / 3_600_000;
  if (hoursAgo < 26) return "ok";
  if (hoursAgo < 50) return "warn";
  return "error";
}
