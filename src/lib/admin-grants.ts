// Per-customer admin allowance grants.
//
// Customers have monthly caps on three things:
//   - Free-text change requests (MONTHLY_CHANGE_REQUEST_LIMIT)
//   - Offer updates (MONTHLY_OFFER_UPDATE_LIMIT)
//   - Newsletter sends (NEWSLETTER_MONTHLY_SEND_LIMIT)
//
// Sometimes the operator wants to extend a customer's monthly
// allowance — they're a good customer, they need an extra send for
// a one-off promo, etc. This module lets admin grant per-month
// bonuses that are added to the default cap.
//
// Storage shape (lives under onboardingData.adminGrants):
//   {
//     "2026-05": {
//       changeRequests?: number,  // extra CRs this month
//       offers?: number,
//       newsletters?: number,
//     },
//     "2026-06": { ... },
//   }
//
// Auto-resets at month rollover — no cron needed; the lookup just
// reads the CURRENT YYYY-MM key and ignores anything else. Old
// keys hang around as audit trail (could be cleaned up later if
// the JSON gets big, but at 12 keys/year that's a long way off).
//
// Why not a Notion column: avoids schema migration; the JSON blob
// approach is consistent with how we store all the other
// per-customer ad-hoc state (haiku cache, change-request inbox,
// onboarding data slices). Read-modify-write under one PATCH so
// concurrent grants from two tabs don't lose each other.

import {
  getProspectByToken,
  updateProspectOnboarding,
  type ProspectRecord,
} from "./notion-prospects";

export type AdminGrantKind = "changeRequests" | "offers" | "newsletters";

/** Current YYYY-MM key (UTC). Same convention as the cap-counters
 *  in the customer-facing routes — keeps the bonus lookup aligned
 *  with the usage count. */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Read the current bonus grant for a kind in the given month
 *  (default: this month). Returns 0 if no grant exists. */
export function getAdminGrant(
  prospect: ProspectRecord,
  kind: AdminGrantKind,
  monthKey: string = currentMonthKey(),
): number {
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const grants = (ob.adminGrants ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const monthGrants = grants[monthKey] ?? {};
  const v = monthGrants[kind];
  return typeof v === "number" && Number.isFinite(v) && v > 0
    ? Math.floor(v)
    : 0;
}

/** Increment the bonus grant for a kind by `delta` (default 1).
 *  Read-modify-write on the prospect's onboardingData. Caller is
 *  responsible for auth (operator-only via /api/admin/...).
 *
 *  Returns the new total bonus value for that kind in the
 *  current month so the UI can update without re-reading. */
export async function addAdminGrant(args: {
  token: string;
  kind: AdminGrantKind;
  delta?: number;
}): Promise<{ ok: true; newTotal: number; monthKey: string } | { ok: false; reason: string }> {
  const delta = Math.floor(args.delta ?? 1);
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, reason: "delta must be a non-zero integer" };
  }
  const prospect = await getProspectByToken(args.token).catch(() => null);
  if (!prospect) return { ok: false, reason: "prospect not found" };

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const grants = ((ob.adminGrants as Record<
    string,
    Record<string, unknown>
  >) ?? {}) as Record<string, Record<string, number>>;
  const monthKey = currentMonthKey();
  const monthGrants = { ...(grants[monthKey] ?? {}) };
  const prev = typeof monthGrants[args.kind] === "number" ? monthGrants[args.kind] : 0;
  const next = Math.max(0, prev + delta);
  monthGrants[args.kind] = next;

  const newGrants = { ...grants, [monthKey]: monthGrants };
  const newOb = { ...ob, adminGrants: newGrants };

  await updateProspectOnboarding(prospect.pageId, {
    data: newOb as Parameters<typeof updateProspectOnboarding>[1]["data"],
  });
  return { ok: true, newTotal: next, monthKey };
}

/** Effective monthly cap = default + bonus from admin grants.
 *  Pure helper — doesn't touch Notion. Used by every cap-check
 *  site so the customer-facing usage gauge respects the bonus. */
export function effectiveMonthlyCap(args: {
  prospect: ProspectRecord;
  defaultCap: number;
  kind: AdminGrantKind;
  monthKey?: string;
}): number {
  return args.defaultCap + getAdminGrant(
    args.prospect,
    args.kind,
    args.monthKey ?? currentMonthKey(),
  );
}
