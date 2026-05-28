// Apply a pending ModuleChangeLogEntry — single shared helper used
// by every code path that flips a pending-stripe entry to applied:
//
//   - /api/webhooks/stripe              (invoice.paid handler)
//   - /api/admin/module-change           (operator Applied button)
//   - ops-worker stripe-applier cron     (daily 04:00 UTC)
//
// One implementation = one set of edge cases to reason about.
// Idempotency: every Stripe call uses a deterministic key derived
// from the change entry's UUID, so re-running on the same entry is
// a safe no-op (Stripe returns the previously-created object).
//
// What it does:
//   1. Per-entry kind, run the right Stripe mutations:
//        - modules-post-launch    → add/remove subscription items
//                                   for each module change; add an
//                                   invoice item for setup-fee delta
//                                   on adds.
//        - multilocation-change   → add an invoice item for the
//                                   £15 × diff (positive only — we
//                                   don't refund for removed
//                                   locations per policy).
//        - cancel-end-of-period   → set cancel_at_period_end on the
//                                   subscription; no money moves
//                                   today.
//        - cancel-immediate-prorated → cancel subscription NOW +
//                                   refund the prorated unused
//                                   monthly via refundLatestSubscriptionPayment.
//   2. Resolve the entry in Notion (writes "applied" + recomputed
//      Module Selections, Setup Fee, Monthly Fee, Extra Locations).
//
// Throws on any unrecoverable Stripe error so callers can log +
// move on to the next entry; recoverable errors (Stripe returning
// "already done") are silently absorbed by idempotency keys.

import {
  calculateFees,
  MODULE_MULTILOCATION_SETUP_GBP,
  MODULE_SETUP_PENCE,
  type ModuleSelection,
} from "@/lib/fees";
import { modulesToSelection } from "@/lib/billing/module-policy";
import { proratedRefundPounds } from "@/lib/billing/module-policy";
import {
  resolveModuleChange,
  type ModuleChangeLogEntry,
  type ProspectRecord,
  markCancelled,
  clearProspectStripeSubscription,
} from "@/lib/notion-prospects";
import {
  addModuleToSubscription,
  addOneOffInvoiceItem,
  cancelSubscription,
  removeModuleFromSubscription,
  refundLatestSubscriptionPayment,
} from "@/lib/stripe";
import {
  STRIPE_MODULE_PRICE_IDS,
} from "@/lib/stripe-products";

/**
 * Apply a single pending-stripe entry: Stripe mutations + Notion
 * resolveModuleChange. Idempotent — calling twice with the same
 * entry is safe (Stripe idempotency + Notion overwrites).
 *
 * Requires `prospect.stripeSubscriptionId` for everything except
 * cancel-end-of-period which already pulled the sub ID before
 * cancel; throws if missing.
 */
export async function applyPendingChange(
  prospect: ProspectRecord,
  entry: ModuleChangeLogEntry,
): Promise<void> {
  if (entry.status !== "pending-stripe") {
    // Already applied / rejected / billing-failed — nothing to do.
    return;
  }
  const customerId = prospect.stripeCustomerId;
  const subscriptionId = prospect.stripeSubscriptionId;
  if (!customerId || !subscriptionId) {
    throw new Error(
      `Prospect ${prospect.name} has no Stripe customer/subscription — can't apply ${entry.id}`,
    );
  }

  const fromSet = new Set(entry.fromModules);
  const toSet = new Set(entry.toModules);
  const added = [...toSet].filter((m) => !fromSet.has(m));
  const removed = [...fromSet].filter((m) => !toSet.has(m));

  // Recompute fees with the FULL new selection — same path the
  // intake + admin endpoints take. Multi-location count comes
  // off the entry for multilocation-change kinds, otherwise off
  // the prospect.
  const isMultiLocChange = entry.kind === "multilocation-change";
  const targetExtraLocations = isMultiLocChange
    ? entry.toExtraLocations ?? 0
    : prospect.extraLocations;

  const selection: ModuleSelection = modulesToSelection(
    entry.toModules,
    targetExtraLocations,
  );
  const newFees = calculateFees(selection, prospect.foundingMember);

  switch (entry.kind) {
    case "modules-post-launch":
    case "modules-pre-launch": {
      // Recurring item adds + removes
      for (const m of added) {
        const priceId = STRIPE_MODULE_PRICE_IDS[m];
        if (!priceId) continue;
        await addModuleToSubscription({
          subscriptionId,
          priceId,
          idempotencyKey: `add-mod:${entry.id}:${m}`,
        });
      }
      for (const m of removed) {
        const priceId = STRIPE_MODULE_PRICE_IDS[m];
        if (!priceId) continue;
        await removeModuleFromSubscription({
          subscriptionId,
          priceId,
          idempotencyKey: `rm-mod:${entry.id}:${m}`,
        });
      }
      // One-off setup-fee invoice items for module ADDS only.
      // Removals don't refund (per policy — setup work was done).
      for (const m of added) {
        const pence = MODULE_SETUP_PENCE[m];
        if (!pence) continue;
        await addOneOffInvoiceItem({
          customerId,
          subscriptionId,
          amountPence: pence,
          description: `${m} module setup`,
          idempotencyKey: `setup:${entry.id}:${m}`,
        });
      }
      break;
    }

    case "multilocation-change": {
      const diff =
        (entry.toExtraLocations ?? 0) - (entry.fromExtraLocations ?? 0);
      if (diff > 0) {
        await addOneOffInvoiceItem({
          customerId,
          subscriptionId,
          amountPence: diff * MODULE_MULTILOCATION_SETUP_GBP * 100,
          description: `Multi-location — ${diff} extra location${diff === 1 ? "" : "s"} added`,
          idempotencyKey: `multiloc:${entry.id}`,
        });
      }
      // Removals: no refund (matches dashboard modal's
      // "no refund — work already delivered" copy).
      break;
    }

    case "cancel-end-of-period": {
      await cancelSubscription({
        subscriptionId,
        mode: "at-period-end",
        idempotencyKey: `cancel-eop:${entry.id}`,
      });
      // markCancelled fires on customer.subscription.deleted
      // event; nothing to do in Notion now beyond resolveModuleChange.
      break;
    }

    case "cancel-immediate-prorated": {
      await cancelSubscription({
        subscriptionId,
        mode: "immediate",
        idempotencyKey: `cancel-now:${entry.id}`,
      });
      // Refund the prorated unused portion of the current month.
      // Use the entry's recorded proratedRefund (computed
      // client-side when the customer submitted) for consistency
      // with what they saw in the cancel modal.
      const refundPence = Math.round((entry.proratedRefund ?? 0) * 100);
      if (refundPence > 0) {
        await refundLatestSubscriptionPayment({
          customerId,
          amountPence: refundPence,
          idempotencyKey: `refund:${entry.id}`,
        });
      }
      // Status flip + GDPR retention stamp — webhook will also do
      // this on customer.subscription.deleted, but cancellation is
      // immediate so we don't wait for the round-trip.
      await markCancelled(prospect.pageId);
      await clearProspectStripeSubscription(prospect.pageId);
      break;
    }

    default:
      // Unknown kind — skip Stripe but still resolve so the entry
      // doesn't sit forever pending. Operator can investigate via
      // /admin if it's a bug.
      console.warn(
        `[apply-pending] unknown kind ${entry.kind} on ${entry.id} — resolving without Stripe`,
      );
  }

  // 2. Resolve in Notion — writes the new module list + recomputed
  //    fees + (for multi-location) new Extra Locations count
  //    atomically. Same writer the admin button uses.
  await resolveModuleChange(prospect.pageId, entry.id, {
    status: "applied",
    resolutionNote: `Auto-applied via Stripe ${entry.kind} (effective ${entry.effectiveDate ?? "now"}).`,
    appliedSelection: entry.toModules,
    appliedFees: { setup: newFees.setup, monthly: newFees.monthly },
    appliedExtraLocations: isMultiLocChange
      ? targetExtraLocations
      : undefined,
  });
}

// Reference unused imports to keep tree-shaking happy
void proratedRefundPounds;
