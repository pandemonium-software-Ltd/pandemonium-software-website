// POST /api/account/cancel — customer-initiated full account
// cancellation from the dashboard's Billing section.
//
// Two modes:
//   - "end-of-period"      → subscription ends at the next billing
//     date. Customer keeps full access until then. No refund.
//   - "immediate-prorated" → subscription cancels NOW. We refund a
//     prorated portion of the current month based on how many days
//     are unused. Site goes offline today.
//
// Both record a `pending-stripe` entry in the module change log
// with a new `kind` value distinguishing them from module-add/
// remove changes. The operator (or, post task #56, the Stripe
// webhook) is responsible for:
//   - end-of-period: scheduling sub cancellation at effectiveDate
//   - immediate-prorated: cancelling sub + issuing refund + taking
//     the site offline (flipping Status to "Cancelled")
//
// The active Module Selections / Setup Fee / Monthly Fee fields
// are NOT touched here — the operator flips Status to "Cancelled"
// when they action it. Until then the customer still has access.
//
// Request body:
//   { token, mode: "end-of-period" | "immediate-prorated",
//     lastChargedAt?: string }
// `lastChargedAt` is optional for now (we don't have Stripe-sourced
// payment data yet) — when present, we compute the prorated refund
// figure server-side so the customer's dashboard receipt matches
// what the operator will refund.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendPendingChange,
  getProspectByToken,
  type ModuleChangeLogEntry,
} from "@/lib/notion-prospects";
import {
  canChangePostLaunch,
  nextBillingDate,
  proratedRefundPounds,
} from "@/lib/billing/module-policy";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  mode: z.enum(["end-of-period", "immediate-prorated"]),
  lastChargedAt: z.string().datetime().optional(),
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
  const { token, mode, lastChargedAt } = parsed.data;

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

  // Reject if a cancellation is already pending — avoids the
  // operator seeing two contradictory pending rows for the same
  // customer.
  const alreadyPending = prospect.moduleChangeLog.find(
    (e) =>
      e.status === "pending-stripe" &&
      (e.kind === "cancel-end-of-period" ||
        e.kind === "cancel-immediate-prorated"),
  );
  if (alreadyPending) {
    return NextResponse.json(
      {
        error: `A cancellation is already pending (effective ${alreadyPending.effectiveDate}). Email support if you've changed your mind.`,
      },
      { status: 409 },
    );
  }

  const monthlyFee = prospect.monthlyFeeCalculated ?? 0;
  const proratedRefund =
    mode === "immediate-prorated" && lastChargedAt
      ? proratedRefundPounds({
          monthlyFeePounds: monthlyFee,
          lastChargedAt,
        })
      : undefined;

  const entry: ModuleChangeLogEntry = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    // Cancellation removes ALL modules + base. fromModules
    // reflects the snapshot at cancellation time; toModules empty
    // signals the operator that EVERYTHING comes off.
    fromModules: [...prospect.moduleSelections].sort(),
    toModules: [],
    setupDelta: 0,
    monthlyDelta: -monthlyFee,
    newSetupTotal: prospect.setupFeeCalculated ?? 0,
    newMonthlyTotal: 0,
    status: "pending-stripe",
    kind:
      mode === "end-of-period"
        ? "cancel-end-of-period"
        : "cancel-immediate-prorated",
    effectiveDate:
      mode === "end-of-period"
        ? nextBillingDate()
        : new Date().toISOString().slice(0, 10),
    proratedRefund,
  };
  await appendPendingChange(prospect.pageId, entry);

  // Customer confirmation — best-effort, errors logged not
  // returned. The two cancellation paths share one template,
  // varying via `modeLabel`, `modeBody`, and `refundLine` slots
  // so the email reads as a single coherent message either way.
  try {
    const env = getServerEnv();
    const isImmediate = mode === "immediate-prorated";
    const modeLabel = isImmediate
      ? `site offline today${proratedRefund !== undefined ? ` + £${proratedRefund} refund` : ""}`
      : `ends ${entry.effectiveDate}`;
    const modeBody = isImmediate
      ? `Your site goes offline today. We are processing the\nrefund to the card on file — usually visible in your\nstatement within 5-10 working days.`
      : `Your site stays live until ${entry.effectiveDate}. On that\ndate it goes offline, billing stops, and you will get a\nfinal receipt by email.`;
    const refundLine = isImmediate
      ? `  • ${proratedRefund !== undefined ? `Prorated refund of £${proratedRefund} — that is the unused\n    portion of this month's monthly subscription` : "Prorated refund for the unused portion of this month's\n    monthly subscription (exact figure on your final receipt)"}.`
      : `  • No refund — you keep your site running until\n    ${entry.effectiveDate}, which is what you have already paid for.`;
    await sendCustomerEmail(env, prospect.email, "cancel-scheduled", {
      customerName: prospect.name,
      effectiveDate: entry.effectiveDate ?? "",
      modeLabel,
      modeBody,
      refundLine,
      accountUrl: `${site.url}/account/${token}`,
    });
  } catch (e) {
    console.error(
      `[api/account/cancel] confirmation email failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({ ok: true, entry });
}
