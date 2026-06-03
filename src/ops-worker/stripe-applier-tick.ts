// Daily Stripe applier tick — closes the gap between the
// invoice.paid webhook and the customer-facing dashboard.
//
// The webhook fires on every successful invoice, which catches the
// common case: customer's monthly renewal succeeds → we apply any
// pending changes whose effectiveDate <= today. But there are two
// gaps the webhook alone misses:
//
//   1. A pending change has effectiveDate of (say) 2026-06-01 but
//      the renewal invoice already paid earlier in the month (or
//      the customer is on annual billing). The webhook fired on
//      pay-day; nothing fired on the effective date.
//
//   2. The customer cancelled the day-of and there's a pending
//      change for the same effective date that needs cleanup.
//
// This cron sweeps DAILY. Idempotency keys on every Stripe op +
// the resolveModuleChange writer mean re-runs are safe — the cron
// is a fallback to ensure nothing sits pending forever, not the
// primary trigger.
//
// Triggered by "0 4 * * *" in wrangler-ops.jsonc (04:00 UTC, sat
// after gdpr-scrub at 03:00 to keep outbound loads spread).

import {
  listAllProspects,
  type ProspectRecord,
  type ModuleChangeLogEntry,
} from "../lib/notion-prospects";
import { applyPendingChange } from "../lib/billing/apply-pending";

export type StripeApplierResult = {
  scanned: number;
  applied: number;
  failed: number;
};

export async function runStripeApplierTick(args: {
  now?: Date;
} = {}): Promise<StripeApplierResult> {
  const now = args.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  console.log(`[stripe-applier:${now.toISOString()}] starting`);

  const prospects = await listAllProspects();
  let applied = 0;
  let failed = 0;
  let scanned = 0;

  for (const prospect of prospects) {
    const due = duePendingChanges(prospect, today);
    if (due.length === 0) continue;
    scanned += due.length;
    // Skip if the prospect has no Stripe subscription — applyPendingChange
    // throws, which would just spam the log. Cancelled accounts +
    // pre-Stripe legacy customers fall here.
    if (!prospect.stripeSubscriptionId || !prospect.stripeCustomerId) {
      console.log(
        `[stripe-applier] ${prospect.token.slice(0, 8)} has ${due.length} pending change(s) but no Stripe subscription — skipped`,
      );
      continue;
    }
    for (const entry of due) {
      try {
        await applyPendingChange(prospect, entry);
        applied += 1;
        console.log(
          `[stripe-applier] ${prospect.token.slice(0, 8)} — applied ${entry.kind} ${entry.id} (effective ${entry.effectiveDate})`,
        );
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `[stripe-applier] ${prospect.token.slice(0, 8)} — ${entry.id} FAILED: ${msg}`,
        );
      }
    }
  }
  console.log(
    `[stripe-applier:${now.toISOString()}] complete — scanned=${scanned}, applied=${applied}, failed=${failed}`,
  );
  return { scanned, applied, failed };
}

function duePendingChanges(
  prospect: ProspectRecord,
  todayIso: string,
): ModuleChangeLogEntry[] {
  return prospect.moduleChangeLog.filter(
    (e) =>
      e.status === "pending-stripe" &&
      e.effectiveDate &&
      e.effectiveDate <= todayIso,
  );
}
