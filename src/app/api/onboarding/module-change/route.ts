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
// Side effects on success (immediate-apply via Stripe — 2026-05-26):
//   1. STRIPE: for every added module, add a recurring sub item +
//      one-off setup invoice item. For every removed module, drop
//      the sub item (no refund — policy). Idempotency keys derived
//      from entry.id so retries are safe.
//   2. NOTION: submitModuleChange writes the log entry (status=
//      applied) AND flips Module Selections + Setup Fee + Monthly
//      Fee atomically.
//   3. EMAIL: Ben (diff + reconciliation reminder) + customer
//      ("applied — here's what's new" via module-change-applied).
//
// If Stripe fails (network blip, sub already cancelled, etc.) we
// 502 BEFORE the Notion write so the customer can retry. Half-
// applied state is the worst outcome — guard against it by failing
// loud rather than letting Notion drift from Stripe.
//
// On failure: returns 400/403/404/502 with a customer-friendly
// reason. Email failures are logged but don't fail the response —
// the row is in Notion either way and Ben can re-trigger emails
// manually.

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
import {
  addModuleToSubscription,
  addOneOffInvoiceItem,
  isStripeConfigured,
  removeModuleFromSubscription,
} from "@/lib/stripe";
import { STRIPE_MODULE_PRICE_IDS } from "@/lib/stripe-products";
import {
  MODULE_BOOKING_SETUP_GBP,
  MODULE_ENQUIRY_SETUP_GBP,
  MODULE_NEWSLETTER_SETUP_GBP,
  MODULE_OFFERS_SETUP_GBP,
  GBP_ADDON_ONE_OFF_GBP,
} from "@/lib/fees";
import { reportError } from "@/lib/sentry";

// Per-module setup-fee map (pence). Duplicated against the same map
// in apply-pending.ts — both flows charge the same setup fee, the
// dedup is on the cleanup list but not blocking. Multi-location is
// excluded (it's not selectable from the Hub Step 3 re-selector).
const MODULE_SETUP_PENCE: Readonly<Record<string, number>> = {
  "Online Booking": MODULE_BOOKING_SETUP_GBP * 100,
  "Enquiry Form": MODULE_ENQUIRY_SETUP_GBP * 100,
  Newsletter: MODULE_NEWSLETTER_SETUP_GBP * 100,
  Offers: MODULE_OFFERS_SETUP_GBP * 100,
  "Google Business Profile Setup/Audit": GBP_ADDON_ONE_OFF_GBP * 100,
};

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
  // status starts as "applied" + resolvedAt = submittedAt because
  // we run Stripe + Notion synchronously inside this request. By
  // the time the response returns, the change is fully landed
  // (Stripe + Notion + emails).
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
    kind: "modules-pre-launch",
    resolutionNote: "Auto-applied via Stripe (one-shot re-selector)",
    resolvedAt: submittedAt,
  };

  // ============================================================
  // STRIPE — real money movements (2026-05-26)
  // ============================================================
  // Run BEFORE the Notion write so a Stripe failure doesn't leave
  // us with Notion drifting from Stripe. Idempotency keys are
  // derived from entry.id so a retried request (same entry.id)
  // no-ops on every Stripe call.
  //
  // Three movements possible per change:
  //   1. Added modules     → sub item add + one-off setup invoice item
  //   2. Removed modules   → sub item remove (NO refund — policy:
  //                          setup paid for site build, monthly is
  //                          the next-cycle drop)
  //   3. Net monthly delta → handled automatically by Stripe when
  //                          sub items change (next renewal picks
  //                          up the new total)
  // ============================================================
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Payments aren't configured on this deployment. Email Ben directly to make this change.",
      },
      { status: 503 },
    );
  }
  if (!prospect.stripeCustomerId || !prospect.stripeSubscriptionId) {
    return NextResponse.json(
      {
        error:
          "We can't find your Stripe subscription on file — that usually means your first payment hasn't synced. Email Ben and he'll sort it.",
      },
      { status: 409 },
    );
  }
  try {
    // Add recurring price for each added module
    for (const m of delta.added) {
      const priceId = STRIPE_MODULE_PRICE_IDS[m];
      if (!priceId) continue;
      await addModuleToSubscription({
        subscriptionId: prospect.stripeSubscriptionId,
        priceId,
        idempotencyKey: `mc-${entry.id}-add:${m}`,
      });
    }
    // Drop recurring price for each removed module
    for (const m of delta.removed) {
      const priceId = STRIPE_MODULE_PRICE_IDS[m];
      if (!priceId) continue;
      await removeModuleFromSubscription({
        subscriptionId: prospect.stripeSubscriptionId,
        priceId,
        idempotencyKey: `mc-${entry.id}-rm:${m}`,
      });
    }
    // One-off setup-fee invoice items for each added module. Lands
    // on the customer's next invoice (their first renewal, since
    // they just paid Checkout to get into Paid/Onboarding status).
    for (const m of delta.added) {
      const pence = MODULE_SETUP_PENCE[m];
      if (!pence) continue;
      await addOneOffInvoiceItem({
        customerId: prospect.stripeCustomerId,
        subscriptionId: prospect.stripeSubscriptionId,
        amountPence: pence,
        description: `${m} module setup`,
        idempotencyKey: `mc-${entry.id}-setup:${m}`,
      });
    }
    // Removals: no refund. Policy alignment — setup fee paid for
    // site build (delivered work); monthly drop kicks in at the
    // next billing cycle automatically when the sub item is gone.
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    reportError("api/onboarding/module-change:stripe", e);
    console.error(
      `[api/onboarding/module-change] Stripe failure for ${prospect.email}: ${msg}`,
    );
    return NextResponse.json(
      {
        error:
          "Couldn't update your payment plan just now. Try again in a minute, and if it keeps failing email Ben.",
      },
      { status: 502 },
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
