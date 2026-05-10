"use client";

// Operator fleet view at /admin. Client component because it owns
// search + filter state. The server page fetches the full prospect
// list once and hands it down; client filters in-memory (fine at
// hundreds; if we ever push past ~1k, push filtering to the server
// with query params).
//
// Surfaces:
//   - Search box (matches name / business / email / domain / token prefix)
//   - Filter chips (All / Open requests / Awaiting reply / Live / Cancelled)
//   - Aggregate counters (X total, Y open requests, Z awaiting reply)
//   - Per-row outstanding indicators:
//       Red pill "N open" if any change request is pending/in-progress
//       Amber tag "Awaiting reply" if status indicates Ben needs to act
//   - Subtle row tint matching the strongest outstanding signal

import { useMemo, useState } from "react";
import type { ProspectRecord } from "@/lib/notion-prospects";

// Statuses where Ben (or Cowork later) is the next mover.
const AWAITING_REPLY_STATUSES = new Set<string>([
  "Phase 1 Complete",
  "Phase 2 Complete",
  "Phase 2 Flagged for Review",
  "Phase 2 Clarification Requested",
  "Phase 3 Complete",
]);

const LIVE_STATUSES = new Set<string>([
  "Live",
  "Build Started",
  "Onboarding Complete",
  "Onboarding Started",
  "Paid",
]);

type FilterChip =
  | "all"
  | "open-requests"
  | "awaiting-reply"
  | "live"
  | "cancelled";

const FILTER_LABEL: Record<FilterChip, string> = {
  all: "All",
  "open-requests": "Open requests",
  "awaiting-reply": "Awaiting reply",
  live: "Live customers",
  cancelled: "Cancelled",
};

export type AdminProspectListProps = {
  prospects: ProspectRecord[];
  baseUrl: string;
};

export default function AdminProspectList({
  prospects,
  baseUrl,
}: AdminProspectListProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");

  // Pre-compute outstanding signals once per prospect — used for both
  // counting (chips + aggregates) and rendering (row tint + pill).
  const enriched = useMemo(
    () =>
      prospects.map((p) => {
        const openRequests = p.changeRequests.filter(
          (r) => r.status === "pending" || r.status === "in-progress",
        );
        const openRequestCount = openRequests.length;
        // Age (days) of the OLDEST open request — that's the most
        // urgent to action. Floor so 23h ago shows as "0 days" /
        // "today"; 25h shows as "1 day". null when no open requests.
        const oldestOpenDays =
          openRequests.length > 0
            ? Math.floor(
                openRequests
                  .map((r) => Date.now() - new Date(r.submittedAt).getTime())
                  .reduce((max, ms) => Math.max(max, ms), 0) /
                  (1000 * 60 * 60 * 24),
              )
            : null;
        const awaitingReply = AWAITING_REPLY_STATUSES.has(p.status);
        const isLive = LIVE_STATUSES.has(p.status);
        const isCancelled = p.status === "Cancelled";
        const domain =
          ((p.onboardingData ?? {}) as { domain?: { domain?: string } })
            .domain?.domain ?? "";
        return {
          prospect: p,
          openRequestCount,
          oldestOpenDays,
          awaitingReply,
          isLive,
          isCancelled,
          domain,
          searchHaystack: [
            p.name,
            p.business ?? "",
            p.email,
            p.token,
            domain,
          ]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [prospects],
  );

  const aggregate = useMemo(() => {
    return {
      total: enriched.length,
      openRequests: enriched.reduce((n, e) => n + e.openRequestCount, 0),
      awaitingReply: enriched.filter((e) => e.awaitingReply).length,
      live: enriched.filter((e) => e.isLive).length,
      cancelled: enriched.filter((e) => e.isCancelled).length,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((e) => {
      if (q && !e.searchHaystack.includes(q)) return false;
      switch (filter) {
        case "open-requests":
          return e.openRequestCount > 0;
        case "awaiting-reply":
          return e.awaitingReply;
        case "live":
          return e.isLive;
        case "cancelled":
          return e.isCancelled;
        case "all":
        default:
          return true;
      }
    });
  }, [enriched, query, filter]);

  return (
    <>
      {/* Search + filter strip */}
      <div className="mb-6 rounded-2xl border border-navy-100 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex-1 min-w-[16rem]">
            <span className="sr-only">Search prospects</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, business, email, domain or token…"
              className="w-full rounded-xl border-2 border-navy-200 bg-white px-4 py-2.5 text-sm text-navy-900 outline-none focus:border-navy-900"
            />
          </label>
          <p className="text-xs text-navy-500">
            {filtered.length} of {aggregate.total}
            {query && " matching"}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChipButton
            chip="all"
            current={filter}
            onSelect={setFilter}
            count={aggregate.total}
          />
          <FilterChipButton
            chip="open-requests"
            current={filter}
            onSelect={setFilter}
            count={aggregate.openRequests}
            tone="red"
          />
          <FilterChipButton
            chip="awaiting-reply"
            current={filter}
            onSelect={setFilter}
            count={aggregate.awaitingReply}
            tone="amber"
          />
          <FilterChipButton
            chip="live"
            current={filter}
            onSelect={setFilter}
            count={aggregate.live}
            tone="green"
          />
          <FilterChipButton
            chip="cancelled"
            current={filter}
            onSelect={setFilter}
            count={aggregate.cancelled}
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card bg-cream-50 text-center">
          <p className="text-navy-700">
            No prospects match {query ? `"${query}"` : "this filter"}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-100 bg-white">
          <table className="min-w-full divide-y divide-navy-100 text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wider text-navy-600">
              <tr>
                <Th>Name / Business</Th>
                <Th>Action</Th>
                <Th>Type / Loc</Th>
                <Th>Status</Th>
                <Th>Compat</Th>
                <Th>Fees</Th>
                <Th>Submitted</Th>
                <Th>Links</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {filtered.map((e) => {
                const p = e.prospect;
                const rowTint =
                  e.openRequestCount > 0
                    ? "bg-red-50/40"
                    : e.awaitingReply
                      ? "bg-orange-50/40"
                      : "";
                return (
                  <tr key={p.pageId} className={`align-top ${rowTint}`}>
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
                      <ActionFlags
                        openRequestCount={e.openRequestCount}
                        oldestOpenDays={e.oldestOpenDays}
                        awaitingReply={e.awaitingReply}
                      />
                    </Td>
                    <Td>
                      <div className="text-xs">{p.businessType ?? "—"}</div>
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
                          <div className="text-xs">
                            {formatDate(p.phase3SubmittedAt)}
                          </div>
                          <div className="text-xs text-navy-500">P3</div>
                        </div>
                      ) : p.phase2SubmittedAt ? (
                        <div>
                          <div className="text-xs">
                            {formatDate(p.phase2SubmittedAt)}
                          </div>
                          <div className="text-xs text-navy-500">P2</div>
                        </div>
                      ) : p.phase1SubmittedAt ? (
                        <div>
                          <div className="text-xs">
                            {formatDate(p.phase1SubmittedAt)}
                          </div>
                          <div className="text-xs text-navy-500">P1</div>
                        </div>
                      ) : (
                        <span className="text-xs text-navy-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1 text-xs">
                        <a
                          href={`/admin/${p.token}`}
                          className="link font-semibold"
                        >
                          Detail →
                        </a>
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
                            <OnboardingProgress
                              prospect={p}
                            />
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-navy-500">
        Showing {filtered.length} of {aggregate.total}{" "}
        {aggregate.total === 1 ? "prospect" : "prospects"}. Refresh the
        page to re-pull from Notion.
      </p>
    </>
  );
}

// ---------- Filter chip button ----------

function FilterChipButton({
  chip,
  current,
  onSelect,
  count,
  tone,
}: {
  chip: FilterChip;
  current: FilterChip;
  onSelect: (c: FilterChip) => void;
  count: number;
  tone?: "red" | "amber" | "green";
}) {
  const active = chip === current;
  const toneClasses = active
    ? "bg-navy-900 text-white"
    : tone === "red" && count > 0
      ? "bg-red-50 text-red-800 ring-1 ring-red-200 hover:bg-red-100"
      : tone === "amber" && count > 0
        ? "bg-orange-50 text-orange-800 ring-1 ring-orange-200 hover:bg-orange-100"
        : tone === "green"
          ? "bg-green-50 text-green-800 ring-1 ring-green-200 hover:bg-green-100"
          : "bg-cream-50 text-navy-700 ring-1 ring-navy-200 hover:bg-cream-100";
  return (
    <button
      type="button"
      onClick={() => onSelect(chip)}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${toneClasses}`}
    >
      {FILTER_LABEL[chip]}
      <span className="ml-1.5 opacity-80">({count})</span>
    </button>
  );
}

// ---------- Action flags (red pill + amber tag) ----------

function ActionFlags({
  openRequestCount,
  oldestOpenDays,
  awaitingReply,
}: {
  openRequestCount: number;
  /** Age in days of the OLDEST open request (floor); null if none. */
  oldestOpenDays: number | null;
  awaitingReply: boolean;
}) {
  if (openRequestCount === 0 && !awaitingReply) {
    return <span className="text-xs text-navy-300">—</span>;
  }
  // Tier the request pill by age — older = more urgent visual.
  // 0d = red base; ≥3d = darker red + outline ring; ≥7d = pulsing
  // ring (not implemented; rely on the colour shift only to keep
  // CSS lean). Days appear in a smaller adjacent badge so the
  // colour codes the urgency at a glance and the number is exact.
  const ageStale = (oldestOpenDays ?? 0) >= 3;
  return (
    <div className="flex flex-col gap-1.5">
      {openRequestCount > 0 && (
        <div className="inline-flex flex-wrap items-center gap-1.5">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
              ageStale
                ? "bg-red-200 text-red-900 ring-2 ring-red-400"
                : "bg-red-100 text-red-800",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "h-2 w-2 rounded-full",
                ageStale ? "bg-red-600" : "bg-red-500",
              ].join(" ")}
            />
            {openRequestCount} open{" "}
            {openRequestCount === 1 ? "request" : "requests"}
          </span>
          {oldestOpenDays !== null && (
            <span
              className={[
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                ageStale
                  ? "bg-red-50 text-red-900"
                  : "bg-navy-100 text-navy-700",
              ].join(" ")}
              title={
                oldestOpenDays === 0
                  ? "Submitted today"
                  : `Oldest open request submitted ${oldestOpenDays} day${oldestOpenDays === 1 ? "" : "s"} ago`
              }
            >
              {oldestOpenDays === 0
                ? "today"
                : `${oldestOpenDays}d open`}
            </span>
          )}
        </div>
      )}
      {awaitingReply && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-orange-800">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-orange-500"
          />
          Awaiting reply
        </span>
      )}
    </div>
  );
}

// ---------- Table primitives ----------

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 font-semibold">{children}</th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-3">{children}</td>;
}

// ---------- Status / Compat badges ----------

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
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colour}`}
    >
      {result}
    </span>
  );
}

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
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}
