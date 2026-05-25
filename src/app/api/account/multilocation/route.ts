// POST /api/account/multilocation — customer dashboard's
// "add/remove an extra location" handler. Post-launch only.
//
// Sister endpoint to /api/account/module-change. The customer
// adjusts their `extraLocations` count via the dashboard's +/-
// stepper; this records a `multilocation-change` pending entry
// with effectiveDate = 1st of next month UTC. Operator (or, post
// task #56, the Stripe webhook) applies on the effective date.
//
// Diff vs module-change route:
//   - target is a number, not a module flag
//   - £15 per extra location, no monthly contribution
//   - same effective-date rule + same email flow
//   - same no-double-pending guard
//
// Request body:
//   { token, newExtraLocations: number }
//
// Idempotent: if newExtraLocations === current and there's no
// pending change, returns 409 (no-op).

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendPendingChange,
  getProspectByToken,
  type ModuleChangeLogEntry,
} from "@/lib/notion-prospects";
import {
  calculateModuleDelta,
  canChangePostLaunch,
  nextBillingDate,
} from "@/lib/billing/module-policy";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cap matches the intake schema's max (schemas.ts → 50).
// Realistically a customer with 50 locations is a different
// commercial conversation than self-serve £15-per-loc.
const MAX_EXTRA_LOCATIONS = 50;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  newExtraLocations: z
    .number()
    .int("Pick a whole number.")
    .min(0, "Can't go below 0.")
    .max(MAX_EXTRA_LOCATIONS, "That's a lot — drop me an email instead."),
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
      { error: "Request did not validate.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { token, newExtraLocations } = parsed.data;

  const auth = await requireCustomerSession(request, token);
  if (!auth.ok) return auth.response;

  const prospect = await getProspectByToken(token);
  if (!prospect) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 },
    );
  }

  const eligible = canChangePostLaunch(prospect);
  if (!eligible.allowed) {
    return NextResponse.json(
      { error: eligible.message, reason: eligible.reason },
      { status: 403 },
    );
  }

  const currentExtra = prospect.extraLocations;
  if (newExtraLocations === currentExtra) {
    return NextResponse.json(
      {
        error: `You already have ${currentExtra} extra location${currentExtra === 1 ? "" : "s"}.`,
      },
      { status: 409 },
    );
  }

  // Build a from/to module-list snapshot so the delta uses the
  // same "Multi-location" flag rules as everything else. The
  // flag is present whenever extraLocations > 0.
  const baseModules = prospect.moduleSelections.filter(
    (m) => m !== "Multi-location",
  );
  const fromModules = [
    ...baseModules,
    ...(currentExtra > 0 ? ["Multi-location"] : []),
  ].sort();
  const toModules = [
    ...baseModules,
    ...(newExtraLocations > 0 ? ["Multi-location"] : []),
  ].sort();

  const delta = calculateModuleDelta({
    fromModules,
    toModules,
    foundingMember: prospect.foundingMember,
    fromExtraLocations: currentExtra,
    toExtraLocations: newExtraLocations,
  });

  // No-double-pending guard — if there's already a pending
  // multilocation-change targeting the same `toExtraLocations`,
  // refuse the duplicate.
  const alreadyPending = prospect.moduleChangeLog.find(
    (e) =>
      e.status === "pending-stripe" &&
      e.kind === "multilocation-change" &&
      e.toExtraLocations === newExtraLocations,
  );
  if (alreadyPending) {
    return NextResponse.json(
      {
        error: `You already have a pending change to ${newExtraLocations} extra location${newExtraLocations === 1 ? "" : "s"}, effective ${alreadyPending.effectiveDate}.`,
      },
      { status: 409 },
    );
  }

  const entry: ModuleChangeLogEntry = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    fromModules: delta.fromModules,
    toModules: delta.toModules,
    setupDelta: delta.setupDelta,
    monthlyDelta: delta.monthlyDelta, // always 0 for this kind
    newSetupTotal: delta.toFees.setup,
    newMonthlyTotal: delta.toFees.monthly,
    status: "pending-stripe",
    kind: "multilocation-change",
    effectiveDate: nextBillingDate(),
    fromExtraLocations: currentExtra,
    toExtraLocations: newExtraLocations,
  };
  await appendPendingChange(prospect.pageId, entry);

  // Customer confirmation — reuses the module-scheduled template
  // with a "Multi-location (N → M)" moduleName so the customer
  // sees a coherent record alongside their other changes. Money
  // panel reflects setupDelta only (no monthly impact).
  try {
    const env = getServerEnv();
    const isAdding = newExtraLocations > currentExtra;
    await sendCustomerEmail(env, prospect.email, "module-scheduled", {
      customerName: prospect.name,
      moduleName: `Multi-location (${currentExtra} → ${newExtraLocations} extra location${newExtraLocations === 1 ? "" : "s"})`,
      effectiveDate: entry.effectiveDate ?? nextBillingDate(),
      accountUrl: `${site.url}/account/${token}`,
      added: isAdding,
      removed: !isAdding,
      paidSetupSoFar: prospect.setupFeeCalculated ?? 0,
      currentMonthly: delta.fromFees.monthly,
      newMonthly: delta.toFees.monthly,
      extraSetupCharge: isAdding ? delta.setupDelta : 0,
    });
  } catch (e) {
    console.error(
      `[api/account/multilocation] confirmation email failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({ ok: true, entry });
}
