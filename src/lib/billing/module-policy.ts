// Module change policy — pure functions, no I/O.
//
// Owns the rules for when/how a customer can change which modules
// they bought. Used by:
//   - Step3Modules.tsx ReSelector (client-side gate / UI rendering)
//   - /api/onboarding/module-change (server-side enforcement)
//   - /admin/[token] (operator action panel)
//   - (Future) Stripe webhook handler — see docs/STRIPE-PHASE-2.md
//
// All functions here are pure: take a ProspectRecord (or fragments)
// in, return a decision out. No fetches, no Notion writes. Keeps the
// rules testable and lets us change tactics (manual operator vs.
// auto-Stripe) without touching the policy layer.
//
// Policy reference (per Ben's call 2026-05-09):
//   - 1 module change round per customer ever — hard cap
//   - Allowed only pre-commit (no preview submitted yet)
//   - Setup fee non-refundable once preview is requested OR signoff
//   - Subscription refund window: 14 days from latest monthly payment
//   - After 14 days: cancel-now + stop-next-cycle, no refund
//   - VAT not registered yet (will be later); deltas are gross
//   - Customer keeps data on removed modules (just hidden from UI),
//     re-adding restores access — no setup fee re-charge inside the
//     same change-round

import {
  calculateFees,
  type ModuleSelection,
  type FeeBreakdown,
} from "../fees";
import type { ProspectRecord } from "../notion-prospects";

// The four module flags map to canonical multi_select option strings.
// Centralised here so policy + UI + Notion writers all agree on the
// vocabulary. If you add a new module, add it here AND in fees.ts AND
// in lib/onboarding.ts deriveStepList().
export const MODULE_OPTIONS = [
  "Online Booking",
  "Enquiry Form",
  "Newsletter",
  "Google Business Profile Setup/Audit",
] as const;

export type ModuleOption = (typeof MODULE_OPTIONS)[number];

/** Normalise a module-string array into the strict ModuleSelection
 *  shape that fees.ts wants. Unknown strings are silently dropped
 *  (tolerates Notion drift). */
export function modulesToSelection(modules: string[]): ModuleSelection {
  return {
    moduleBooking: modules.includes("Online Booking"),
    moduleEnquiry: modules.includes("Enquiry Form"),
    moduleNewsletter: modules.includes("Newsletter"),
    gbpAddon: modules.includes("Google Business Profile Setup/Audit"),
  };
}

/** True if every entry in `selection` is a recognised module. Used
 *  by the API route to reject typo'd or injected values before we
 *  calculate fees. */
export function isValidModuleList(selection: string[]): boolean {
  const allowed = new Set<string>(MODULE_OPTIONS);
  return selection.every((m) => allowed.has(m));
}

// ---------- Eligibility gate ----------

export type ChangeEligibility =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "round-already-used"
        | "preview-submitted"
        | "signed-off"
        | "wrong-status"
        | "no-paid-record";
      message: string;
    };

/**
 * Can this prospect change their modules right now?
 *
 * Returns a discriminated union so callers can branch on the reason
 * without re-doing the checks. The `message` is customer-safe — UI
 * surfaces it directly when allowed=false.
 */
export function canChangeModules(prospect: ProspectRecord): ChangeEligibility {
  // Status gate: must be in the "post-paid, pre-launch" window.
  // - Phase 3 Complete and earlier → not yet paid, nothing to change
  // - Live / Cancelled → window has closed
  // - Build Started → site already being built, locked
  const allowedStatuses = new Set([
    "Paid",
    "Onboarding Started",
    "Onboarding Complete",
  ]);
  if (!allowedStatuses.has(prospect.status)) {
    return {
      allowed: false,
      reason: "wrong-status",
      message:
        prospect.status === "Live" || prospect.status === "Build Started"
          ? "Your site is already being built — module changes are locked at this stage. Email Ben if there's something urgent."
          : prospect.status === "Cancelled"
            ? "Your account is cancelled. Email Ben to reopen."
            : "Module changes open once you've paid and start onboarding.",
    };
  }

  // Hard cap: one round per customer, ever.
  if (prospect.moduleChangeRoundUsedAt) {
    return {
      allowed: false,
      reason: "round-already-used",
      message:
        "You've already used your one module change. Any further changes after launch go through the monthly change-request allowance, or email Ben to quote separately.",
    };
  }

  // Preview submitted = work has started; setup fee is now locked.
  // Also implicitly true once Step 5 is signed off (sign-off requires
  // preview), but we check both to give a more accurate error message.
  const review = readReviewSlice(prospect.onboardingData);
  if (review.previewSubmittedAt) {
    return {
      allowed: false,
      reason: "preview-submitted",
      message:
        "You've requested your site preview, so the setup fee is now committed and modules are locked. Email Ben if you need to change something — he'll quote it separately.",
    };
  }
  if (prospect.onboardingStep5Done || review.finalSignOff) {
    return {
      allowed: false,
      reason: "signed-off",
      message:
        "You've signed off your site — module changes are closed. Anything new goes through your post-launch monthly change requests.",
    };
  }

  return { allowed: true };
}

// ---------- Fee delta calculator ----------

export type ModuleDelta = {
  fromModules: string[];
  toModules: string[];
  added: string[];
  removed: string[];
  fromFees: FeeBreakdown;
  toFees: FeeBreakdown;
  /** New − Old. Positive = customer owes us; negative = we owe customer. */
  setupDelta: number;
  /** New − Old. Positive = sub goes up; negative = sub goes down. */
  monthlyDelta: number;
  /** True if the customer's selection didn't actually change (no-op).
   *  UI uses this to disable Confirm so we don't burn the round on a
   *  no-op submission. */
  isNoOp: boolean;
};

/**
 * Pure delta calculation: how do fees change between the two selections?
 *
 * Sorted alphabetically inside `added` / `removed` for stable
 * snapshots in the audit log + reproducible test fixtures.
 *
 * `foundingMember` is the prospect's flag (set during qualification
 * by Ben). Founding members get a flat rate that doesn't itemise per
 * module — but the delta calculation still works because both old
 * and new sides see the same flat rate; setup delta lands at zero
 * unless the GBP one-off addon changed.
 */
export function calculateModuleDelta(args: {
  fromModules: string[];
  toModules: string[];
  foundingMember: boolean;
}): ModuleDelta {
  const fromSet = new Set(args.fromModules);
  const toSet = new Set(args.toModules);
  const added = [...toSet].filter((m) => !fromSet.has(m)).sort();
  const removed = [...fromSet].filter((m) => !toSet.has(m)).sort();

  const fromFees = calculateFees(
    modulesToSelection(args.fromModules),
    args.foundingMember,
  );
  const toFees = calculateFees(
    modulesToSelection(args.toModules),
    args.foundingMember,
  );

  return {
    fromModules: [...args.fromModules].sort(),
    toModules: [...args.toModules].sort(),
    added,
    removed,
    fromFees,
    toFees,
    setupDelta: toFees.setup - fromFees.setup,
    monthlyDelta: toFees.monthly - fromFees.monthly,
    isNoOp: added.length === 0 && removed.length === 0,
  };
}

// ---------- Refund-window helpers ----------
//
// 14 days for both setup (if no commit) and per-monthly-payment.
// Ben's policy: only setup non-refundable POST-commit; if no preview/
// commit yet, refund the whole setup. Subscription always 14-day
// rolling from the most recent monthly charge.
//
// These functions take ISO timestamps so they're pure and testable.
// The API route + admin UI feed in `prospect.<latestPaymentAt>`
// (Stripe Phase 2 will populate that field; for now it's stubbed).

export const REFUND_WINDOW_DAYS = 14;

/**
 * Are we still inside the 14-day setup refund window?
 *
 * Returns false (refund denied) if:
 *   - paidAt is missing (no record of payment)
 *   - we're past the 14-day window
 *   - the customer has already requested preview OR committed
 *     (work delivered; setup non-refundable per policy)
 *
 * Returns true (refund allowed) if all three checks pass.
 */
export function canRefundSetup(args: {
  paidAt: string | undefined;
  previewSubmittedAt: string | undefined;
  finalSignOff: boolean;
  now?: string;
}): boolean {
  if (!args.paidAt) return false;
  if (args.previewSubmittedAt) return false;
  if (args.finalSignOff) return false;
  return withinDays(args.paidAt, REFUND_WINDOW_DAYS, args.now);
}

/**
 * Are we still inside the 14-day subscription refund window for the
 * most recent monthly charge?
 *
 * `latestMonthlyChargeAt` is sourced from the latest paid invoice
 * timestamp (Stripe Phase 2). Outside the window, customer can
 * cancel-now-stop-next-cycle but no money moves.
 */
export function canRefundLatestSubscription(args: {
  latestMonthlyChargeAt: string | undefined;
  now?: string;
}): boolean {
  if (!args.latestMonthlyChargeAt) return false;
  return withinDays(
    args.latestMonthlyChargeAt,
    REFUND_WINDOW_DAYS,
    args.now,
  );
}

// ---------- Internals ----------

function withinDays(
  iso: string,
  days: number,
  nowIso?: string,
): boolean {
  const then = Date.parse(iso);
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  if (Number.isNaN(then) || Number.isNaN(now)) return false;
  const elapsedMs = now - then;
  return elapsedMs >= 0 && elapsedMs <= days * 24 * 60 * 60 * 1000;
}

function readReviewSlice(onboardingData: unknown): {
  previewSubmittedAt?: string;
  finalSignOff?: boolean;
} {
  if (!onboardingData || typeof onboardingData !== "object") return {};
  const r = (onboardingData as { review?: unknown }).review;
  if (!r || typeof r !== "object") return {};
  const slice = r as Record<string, unknown>;
  return {
    previewSubmittedAt:
      typeof slice.previewSubmittedAt === "string"
        ? slice.previewSubmittedAt
        : undefined,
    finalSignOff: slice.finalSignOff === true,
  };
}
