// Apply a stuck `pending-stripe` module change that predates the
// 2026-05-14 immediate-apply fix. Because there's no real Stripe
// integration yet, this script does the operator's job: flips
// Module Selections + fees + marks the log entry as applied, with
// a resolutionNote making clear it was a manual reconciliation.
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/apply-pending-module-change.ts <token>
//
// Idempotent: if the prospect has no pending-stripe entries, it
// reports that and exits cleanly.

import {
  getProspectByToken,
  resolveModuleChange,
} from "../src/lib/notion-prospects";
import { calculateFees } from "../src/lib/fees";
import { sendCustomerEmail } from "../src/ops-worker/notify";
import { getServerEnv } from "../src/lib/env";
import { site } from "../src/lib/site";

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error(
      "Usage: npx tsx --env-file=.dev.vars scripts/apply-pending-module-change.ts <token>",
    );
    process.exit(1);
  }

  const prospect = await getProspectByToken(token);
  if (!prospect) {
    console.error(`Prospect ${token} not found.`);
    process.exit(1);
  }

  console.log(`prospect:        ${prospect.name} (${prospect.business ?? "—"})`);
  console.log(`status:          ${prospect.status}`);
  console.log(`current modules: ${prospect.moduleSelections.join(", ")}`);
  console.log(`current setup:   £${prospect.setupFeeCalculated ?? "—"}`);
  console.log(`current monthly: £${prospect.monthlyFeeCalculated ?? "—"}`);

  // Find the most-recent pending-stripe entry. We apply that one only;
  // earlier pending entries (if any — shouldn't happen given the
  // 1-round cap but defensive) get reported but not touched.
  const pending = [...prospect.moduleChangeLog].filter(
    (e) => e.status === "pending-stripe",
  );
  if (pending.length === 0) {
    console.log("\n✓ No pending-stripe entries. Nothing to apply.");
    process.exit(0);
  }
  if (pending.length > 1) {
    console.warn(
      `\n⚠ Found ${pending.length} pending-stripe entries. Will apply the most-recent one only:`,
    );
    for (const p of pending) {
      console.warn(`  - ${p.id} (${p.submittedAt})`);
    }
  }
  const target = pending[pending.length - 1];

  console.log(`\nPending change to apply:`);
  console.log(`  id:           ${target.id}`);
  console.log(`  submittedAt:  ${target.submittedAt}`);
  console.log(`  fromModules:  ${target.fromModules.join(", ")}`);
  console.log(`  toModules:    ${target.toModules.join(", ")}`);
  console.log(`  setupDelta:   £${target.setupDelta}`);
  console.log(`  monthlyDelta: £${target.monthlyDelta}`);
  console.log(`  newSetup:     £${target.newSetupTotal}`);
  console.log(`  newMonthly:   £${target.newMonthlyTotal}`);

  // Recompute fees from the actual module list — defensive against
  // any drift between the saved log entry and current pricing
  // constants. Should match target.newSetupTotal / target.newMonthlyTotal
  // exactly under normal circumstances.
  const recomputed = calculateFees(
    {
      moduleBooking: target.toModules.includes("Online Booking"),
      moduleEnquiry: target.toModules.includes("Enquiry Form"),
      moduleNewsletter: target.toModules.includes("Newsletter"),
      moduleOffers: target.toModules.includes("Offers"),
      gbpAddon: target.toModules.includes("Google Business Profile Setup/Audit"),
    },
    prospect.foundingMember,
  );
  if (
    recomputed.setup !== target.newSetupTotal ||
    recomputed.monthly !== target.newMonthlyTotal
  ) {
    console.warn(
      `⚠ Recomputed fees (£${recomputed.setup} setup, £${recomputed.monthly}/mo) don't match the log entry (£${target.newSetupTotal} setup, £${target.newMonthlyTotal}/mo). Using recomputed values.`,
    );
  }

  console.log(`\n[STRIPE-TODO] would have actioned the following Stripe ops:`);
  if (target.setupDelta > 0) {
    console.log(
      `  charge customer=${prospect.email} amount=£${target.setupDelta} idempotencyKey=mc-${target.id}-setup`,
    );
  } else if (target.setupDelta < 0) {
    console.log(
      `  refund customer=${prospect.email} amount=£${Math.abs(target.setupDelta)} idempotencyKey=mc-${target.id}-refund`,
    );
  }
  if (target.monthlyDelta !== 0) {
    console.log(
      `  subscription-update customer=${prospect.email} new-monthly=£${recomputed.monthly} delta=£${target.monthlyDelta > 0 ? "+" : ""}${target.monthlyDelta} idempotencyKey=mc-${target.id}-sub`,
    );
  }

  console.log(`\nApplying via resolveModuleChange...`);
  await resolveModuleChange(prospect.pageId, target.id, {
    status: "applied",
    appliedSelection: target.toModules,
    appliedFees: { setup: recomputed.setup, monthly: recomputed.monthly },
    resolutionNote:
      "Manual apply 2026-05-14 — pre-immediate-apply-fix backlog. " +
      "Stripe ops still pending in Stripe Dashboard (no real Stripe " +
      "integration yet — see docs/STRIPE-PHASE-2.md).",
  });

  // Send the customer the same applied email the live endpoint
  // would have sent. Fail-soft so the Notion write isn't blocked
  // on email infra.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const accountUrl = `${baseUrl}/account/${token}`;
  const env = getServerEnv();
  try {
    await sendCustomerEmail(env, prospect.email, "module-change-applied", {
      customerName: firstName(prospect.name),
      addedSummary: pickAdded(target.fromModules, target.toModules) || "(none)",
      removedSummary:
        pickRemoved(target.fromModules, target.toModules) || "(none)",
      chargeOrRefundLine: setupHeadline(target.setupDelta),
      monthlyDeltaLine: monthlyHeadline(target.monthlyDelta),
      newSetupTotal: recomputed.setup,
      newMonthlyTotal: recomputed.monthly,
      accountUrl,
    });
    console.log("✓ Customer email sent (module-change-applied)");
  } catch (e) {
    console.warn(
      `⚠ Customer email failed (Notion write succeeded): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Verify by re-reading.
  const after = await getProspectByToken(token);
  console.log(`\nAfter:`);
  console.log(`  modules:      ${after?.moduleSelections.join(", ")}`);
  console.log(`  setup:        £${after?.setupFeeCalculated ?? "—"}`);
  console.log(`  monthly:      £${after?.monthlyFeeCalculated ?? "—"}`);
  console.log(`\n✓ Done. Refresh the customer's Hub to see the new module set.`);
}

function firstName(s: string): string {
  return s.split(/\s+/)[0] || "there";
}
function pickAdded(from: string[], to: string[]): string {
  return to.filter((m) => !from.includes(m)).join(", ");
}
function pickRemoved(from: string[], to: string[]): string {
  return from.filter((m) => !to.includes(m)).join(", ");
}
function setupHeadline(delta: number): string {
  if (delta > 0)
    return `a £${delta} charge will land on your card for the new module setup`;
  if (delta < 0)
    return `a £${Math.abs(delta)} refund is on its way (typically 3-5 business days to your card)`;
  return "no money moves (the new module costs the same as the old)";
}
function monthlyHeadline(delta: number): string {
  if (delta > 0)
    return `your subscription goes up by £${delta}/month from next billing cycle`;
  if (delta < 0)
    return `your subscription drops by £${Math.abs(delta)}/month from next billing cycle`;
  return "no monthly change";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
