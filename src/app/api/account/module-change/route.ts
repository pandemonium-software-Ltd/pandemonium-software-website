// POST /api/account/module-change — customer dashboard's
// "add/remove a module" handler. Post-launch only.
//
// Distinct from /api/onboarding/module-change which is the
// pre-launch one-round-per-customer flow that fires immediately.
// This endpoint:
//   - allows UNLIMITED changes (no round cap)
//   - records a `pending-stripe` entry with effectiveDate = 1st of
//     next month UTC
//   - does NOT touch the live Module Selections / Setup Fee /
//     Monthly Fee — the operator (or, once task #56 lands, the
//     Stripe webhook) flips those on the effective date
//
// What the customer sees:
//   - Dashboard refreshes with a "pending change — effective
//     <date>" banner
//   - Module list still shows current state, NOT the requested
//     change, until the operator applies it
//   - We email them a confirmation echoing the effective date
//     and pricing impact
//
// Request body:
//   { token, module: <MODULE_OPTION>, action: "add" | "remove" }
// Body intentionally single-module — keeps the UX honest about
// what is being changed, and matches the dashboard UI where you
// click one Add / one Remove at a time.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendPendingChange,
  getProspectByToken,
  type ModuleChangeLogEntry,
} from "@/lib/notion-prospects";
import {
  MODULE_OPTIONS,
  calculateModuleDelta,
  canChangePostLaunch,
  nextBillingDate,
} from "@/lib/billing/module-policy";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  module: z.enum(MODULE_OPTIONS),
  action: z.enum(["add", "remove"]),
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
  const { token, module: moduleName, action } = parsed.data;

  // Session check FIRST — denies an attacker with a leaked token
  // but no cookie before we leak existence via 404.
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

  // Compose the target selection. Idempotent on add (already-
  // present is a no-op rejection); idempotent on remove (not-
  // present is a no-op rejection). UI should not surface a
  // disallowed button, but we double-check server-side.
  const current = new Set(prospect.moduleSelections);
  const isPresent = current.has(moduleName);
  if (action === "add" && isPresent) {
    return NextResponse.json(
      { error: `${moduleName} is already part of your subscription.` },
      { status: 409 },
    );
  }
  if (action === "remove" && !isPresent) {
    return NextResponse.json(
      { error: `${moduleName} isn't currently part of your subscription.` },
      { status: 409 },
    );
  }
  const target = new Set(current);
  if (action === "add") target.add(moduleName);
  if (action === "remove") target.delete(moduleName);

  const delta = calculateModuleDelta({
    fromModules: [...current].sort(),
    toModules: [...target].sort(),
    foundingMember: prospect.foundingMember,
  });

  // Also reject any same-tick duplicate: if there's an existing
  // pending entry that already targets the same outcome, returning
  // a clear "you already requested this" message is friendlier
  // than silently appending a second pending log row.
  const alreadyPending = prospect.moduleChangeLog.find(
    (e) =>
      e.status === "pending-stripe" &&
      e.kind === "modules-post-launch" &&
      arrayEquals([...e.toModules].sort(), [...target].sort()),
  );
  if (alreadyPending) {
    return NextResponse.json(
      {
        error: `You already have a pending change to ${action === "add" ? "add" : "remove"} ${moduleName}, effective ${alreadyPending.effectiveDate}.`,
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
    monthlyDelta: delta.monthlyDelta,
    newSetupTotal: delta.toFees.setup,
    newMonthlyTotal: delta.toFees.monthly,
    status: "pending-stripe",
    kind: "modules-post-launch",
    effectiveDate: nextBillingDate(),
  };
  await appendPendingChange(prospect.pageId, entry);

  return NextResponse.json({ ok: true, entry });
}

function arrayEquals(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
