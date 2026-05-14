// POST /api/onboarding/module-change — customer-initiated module
// re-selection from Hub Step 3.
//
// Single-shot operation per customer (1 round ever). Hard gates here:
//   - Token valid + prospect exists
//   - canChangeModules() returns allowed (status, no commit, round
//     not yet used)
//   - newModules is a valid subset of MODULE_OPTIONS
//   - newModules differs from current selection (no-op rejected — we
//     don't burn the round on accidental no-op confirms)
//
// Side effects on success (immediate-apply, 2026-05-14 — Stripe
// placeholder mode):
//   - Append an `applied` row to Module Change Log (atomically
//     stamping resolvedAt = submittedAt, since there's no operator
//     gap)
//   - Stamp Module Change Round Used At (locks the round)
//   - IMMEDIATELY flip Module Selections + Setup Fee + Monthly Fee
//     to the new totals (same Notion PATCH as the log write — see
//     submitModuleChange's applyImmediately option)
//   - Log a Stripe placeholder line for each money movement that
//     would happen if Stripe were wired (charge for added modules,
//     refund for removed). The placeholder is a console.warn line
//     visible in `wrangler tail` so the operator can manually
//     reconcile until Stripe lands.
//   - Email Ben with the diff + reconciliation reminder
//   - Email customer "applied — here's what's new" via the
//     module-change-applied template
//
// FUTURE — when Stripe Phase 2 lands (see docs/STRIPE-PHASE-2.md):
// revert this back to the operator-driven pending-stripe → applied
// two-step flow. The atomic-apply path is a temporary shortcut that
// trades reconciliation safety for customer immediacy.
//
// On failure: returns 400/403/404 with a customer-friendly reason.
// Email failures are logged but don't fail the response — the row
// is in Notion either way and Ben can re-trigger emails manually.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  submitModuleChange,
  type ModuleChangeLogEntry,
} from "@/lib/notion-prospects";
import {
  canChangeModules,
  calculateModuleDelta,
  isValidModuleList,
  MODULE_OPTIONS,
} from "@/lib/billing/module-policy";
import {
  buildModuleChangeNotification,
  sendInternalNotification,
} from "@/lib/email";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE, "Missing or invalid token."),
  newModules: z
    .array(z.enum(MODULE_OPTIONS))
    .max(MODULE_OPTIONS.length, "Too many modules selected."),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { token, newModules } = parsed.data;
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  // Defence in depth — schema already enforces enum, but a future
  // schema relaxation shouldn't silently let arbitrary strings
  // through to the fee calculator.
  if (!isValidModuleList(newModules)) {
    return NextResponse.json(
      { error: "One or more module names are not recognised." },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  // Eligibility — uses the same policy module the UI uses to render
  // the disabled / enabled state. Single source of truth.
  const elig = canChangeModules(prospect);
  if (!elig.allowed) {
    return NextResponse.json(
      { error: elig.message, reason: elig.reason },
      { status: 403 },
    );
  }

  // Calculate the delta. Uses the prospect's founding-member flag so
  // founding rates are respected.
  const delta = calculateModuleDelta({
    fromModules: prospect.moduleSelections,
    toModules: newModules,
    foundingMember: prospect.foundingMember,
  });

  if (delta.isNoOp) {
    return NextResponse.json(
      {
        error:
          "No change detected — the selection matches what you already have. Tweak it before confirming so we don't burn your one allowed change.",
      },
      { status: 400 },
    );
  }

  // Build the change log entry. Use crypto.randomUUID so the id is
  // also useful as a Stripe idempotency key suffix.
  // 2026-05-14: status starts as "applied" (not "pending-stripe")
  // because the immediate-apply shortcut writes Module Selections
  // + fees in the same Notion PATCH. resolvedAt = submittedAt
  // since there's no operator gap.
  const submittedAt = new Date().toISOString();
  const entry: ModuleChangeLogEntry = {
    id: crypto.randomUUID(),
    submittedAt,
    fromModules: delta.fromModules,
    toModules: delta.toModules,
    setupDelta: delta.setupDelta,
    monthlyDelta: delta.monthlyDelta,
    newSetupTotal: delta.toFees.setup,
    newMonthlyTotal: delta.toFees.monthly,
    status: "applied",
    resolutionNote: "Auto-applied (Stripe Phase 1 placeholder mode)",
    resolvedAt: submittedAt,
  };

  // ============================================================
  // STRIPE PLACEHOLDER (2026-05-14)
  // ============================================================
  // When Stripe Phase 2 lands (see docs/STRIPE-PHASE-2.md), replace
  // this block with the actual charge/refund/sub-update operations.
  // For now: we emit a structured log line that the operator can
  // grep out of `wrangler tail` to manually reconcile each money
  // movement until Stripe is wired.
  //
  // Three money movements possible per change:
  //   1. setupDelta > 0  → ONE-OFF charge for added module setup fees
  //   2. setupDelta < 0  → ONE-OFF refund for removed module setup fees
  //   3. monthlyDelta != 0 → SUBSCRIPTION update (proration handled by
  //                          Stripe automatically when sub items change)
  // ============================================================
  if (delta.setupDelta > 0) {
    console.warn(
      `[STRIPE-TODO] charge customer=${prospect.email} amount=£${delta.setupDelta} reason="module-add setup fee" idempotencyKey=mc-${entry.id}-setup`,
    );
  } else if (delta.setupDelta < 0) {
    console.warn(
      `[STRIPE-TODO] refund customer=${prospect.email} amount=£${Math.abs(delta.setupDelta)} reason="module-remove setup-fee refund" idempotencyKey=mc-${entry.id}-refund`,
    );
  }
  if (delta.monthlyDelta !== 0) {
    console.warn(
      `[STRIPE-TODO] subscription-update customer=${prospect.email} new-monthly=£${delta.toFees.monthly} delta=£${delta.monthlyDelta > 0 ? "+" : ""}${delta.monthlyDelta} reason="module-change proration" idempotencyKey=mc-${entry.id}-sub`,
    );
  }

  try {
    await submitModuleChange(prospect.pageId, entry, {
      // The atomic immediate-apply: Module Selections + fees flip
      // in the same Notion PATCH as the log entry. See submitModule-
      // Change in src/lib/notion-prospects.ts. Drop this argument
      // when reverting to the operator-driven flow post-Stripe.
      appliedSelection: delta.toModules,
      appliedFees: { setup: delta.toFees.setup, monthly: delta.toFees.monthly },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding/module-change] Notion update error:", msg);
    return NextResponse.json(
      { error: "Couldn't save your change just now. Please try again." },
      { status: 500 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const tokenShort = token.slice(0, 8);
  const accountUrl = `${baseUrl}/account/${token}`;
  const adminDetailUrl = `${baseUrl}/admin/${token}`;

  // Internal Ben email — fail-soft.
  const internal = buildModuleChangeNotification({
    prospectName: prospect.name,
    business: prospect.business ?? "",
    tokenShort,
    changeId: entry.id,
    fromModules: delta.fromModules,
    toModules: delta.toModules,
    added: delta.added,
    removed: delta.removed,
    setupDelta: delta.setupDelta,
    monthlyDelta: delta.monthlyDelta,
    newSetupTotal: delta.toFees.setup,
    newMonthlyTotal: delta.toFees.monthly,
    notionUrl: prospect.notionUrl,
    adminDetailUrl,
  });
  const internalErr = await sendInternalNotification(internal);
  if (internalErr) {
    console.warn(
      `[api/onboarding/module-change] internal email failed: ${internalErr}`,
    );
  }

  // Customer confirmation email — fail-soft. Translate the deltas
  // into customer-friendly headline copy. Template switched
  // 2026-05-14 from "module-change-pending" to "module-change-
  // applied" to match the immediate-apply behaviour. When Stripe
  // Phase 2 lands, swap back to "-pending".
  const env = getServerEnv();
  try {
    await sendCustomerEmail(
      env,
      prospect.email,
      "module-change-applied",
      {
        customerName: firstName(prospect.name),
        addedSummary: delta.added.length ? delta.added.join(", ") : "(none)",
        removedSummary: delta.removed.length
          ? delta.removed.join(", ")
          : "(none)",
        chargeOrRefundLine: setupHeadlineForCustomer(delta.setupDelta),
        monthlyDeltaLine: monthlyHeadlineForCustomer(delta.monthlyDelta),
        newSetupTotal: delta.toFees.setup,
        newMonthlyTotal: delta.toFees.monthly,
        accountUrl,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[api/onboarding/module-change] customer email failed: ${msg}`,
    );
  }

  return NextResponse.json({
    success: true,
    changeId: entry.id,
    delta: {
      added: delta.added,
      removed: delta.removed,
      setupDelta: delta.setupDelta,
      monthlyDelta: delta.monthlyDelta,
      newSetupTotal: delta.toFees.setup,
      newMonthlyTotal: delta.toFees.monthly,
    },
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

// --- Helpers ---

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

// Customer-facing headline copy. Phrased in PAST tense to match the
// immediate-apply UX (the change is already live by the time they
// read this). When Stripe Phase 2 lands and there's an actual gap
// between confirm and charge-completion, swap to future tense.
function setupHeadlineForCustomer(setupDelta: number): string {
  if (setupDelta > 0) {
    return `a £${setupDelta} charge will land on your card for the new module setup`;
  }
  if (setupDelta < 0) {
    return `a £${Math.abs(setupDelta)} refund is on its way (typically 3-5 business days to your card)`;
  }
  return "no money moves (the new module costs the same as the old)";
}

function monthlyHeadlineForCustomer(monthlyDelta: number): string {
  if (monthlyDelta > 0) {
    return `your subscription goes up by £${monthlyDelta}/month from next billing cycle`;
  }
  if (monthlyDelta < 0) {
    return `your subscription drops by £${Math.abs(monthlyDelta)}/month from next billing cycle`;
  }
  return "no monthly change";
}
