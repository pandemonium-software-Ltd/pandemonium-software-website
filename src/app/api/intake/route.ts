// POST /api/intake — Phase 3 partial save and final submission handler.
//
// Body shape:
//   { token, isFinal: boolean, ...sections }
//
// On every call:
//   1. Validate token + look up prospect (must be Phase 2 Accepted or
//      already in Phase 3 progress)
//   2. Merge incoming partial into existing Phase 3 Data (so a section
//      save doesn't wipe what's been saved before)
//   3. Persist to Notion via updateProspectPhase3
//
// On final submit (isFinal: true):
//   4. Validate the merged data with phase3Schema (full)
//   5. Calculate setup + monthly fees from the modules section
//   6. Update Notion with fees + Phase 3 Submitted At + status
//   7. Send Ben buildPhase3Notification with the calculated fees
//   8. Send customer the templated phase3-thanks-fees-and-payment-coming
//      email — receipt with module-aware breakdown (Low risk tier
//      per §11.2 — fees from deterministic engine, no LLM)
//   9. AUTO-FLIP status to "Paid" — temporary Stripe shortcut while
//      Stage 2A Part 2 (real Stripe Checkout) isn't built. When
//      Stripe lands: remove the auto-flip + phase4 send from here
//      and trigger them from /api/stripe/webhook on
//      checkout.session.completed instead.
//  10. Send phase4-onboarding-hub-ready email with the hub URL
//      (the call-to-action that gets the customer into Cowork's
//      onboarding flow)
//  11. Return { success, redirect: "/onboarding/<token>" } — direct
//      to onboarding, skipping the /payment placeholder

import { NextResponse } from "next/server";
import {
  phase3Schema,
  phase3PartialSchema,
  type Phase3Partial,
} from "@/lib/schemas";
import {
  getProspectByToken,
  updateProspectPhase3,
  markProspectAsPaid,
} from "@/lib/notion-prospects";
import { calculateFees, buildModuleListMarkdown } from "@/lib/fees";
import {
  buildPhase3Notification,
  sendInternalNotification,
} from "@/lib/email";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { reportError } from "@/lib/sentry";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ELIGIBLE_FOR_INTAKE = new Set([
  "Phase 2 Accepted",
  "Phase 3 In Progress",
  "Phase 3 Complete", // allow re-edit until paid
]);

type RawBody = { token?: unknown; isFinal?: unknown } & Record<string, unknown>;

function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (typeof base !== "object" || base === null) return patch as T;
  if (typeof patch !== "object" || patch === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v as Partial<unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export async function POST(request: Request) {
  let raw: RawBody;
  try {
    raw = (await request.json()) as RawBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const token = typeof raw.token === "string" ? raw.token : "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid token." },
      { status: 400 },
    );
  }
  const isFinal = raw.isFinal === true;

  // Strip metadata keys before validating against the schema.
  const { token: _t, isFinal: _f, ...sectionData } = raw;
  void _t;
  void _f;

  // Validate the partial. Even on final submit, the body may only
  // include changes — we merge with stored data first, then re-validate
  // against the full schema below.
  const partialParsed = phase3PartialSchema.safeParse(sectionData);
  if (!partialParsed.success) {
    return NextResponse.json(
      {
        error:
          "Some of your answers didn't validate. Please review and try again.",
        issues: partialParsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const incomingPartial = partialParsed.data;

  // Look up prospect.
  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    reportError("api/intake:lookup", e);
    return NextResponse.json(
      { error: "Could not load your intake. Please try again." },
      { status: 500 },
    );
  }
  if (!prospect) {
    return NextResponse.json(
      { error: "Link not found." },
      { status: 404 },
    );
  }
  if (!ELIGIBLE_FOR_INTAKE.has(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Your enquiry isn't ready for the intake form yet. Wait for my email confirming acceptance.",
      },
      { status: 409 },
    );
  }

  // Merge with previously-saved partial.
  const existing = (prospect.phase3Data ?? {}) as Phase3Partial;
  const merged = deepMerge(existing, incomingPartial);

  if (!isFinal) {
    // Just a section save. Persist and return.
    try {
      await updateProspectPhase3(prospect.pageId, merged, false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportError("api/intake:partial-save", e);
      return NextResponse.json(
        { error: "Could not save your progress. Please try again." },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, isFinal: false });
  }

  // Final submission — validate the merged data against the strict
  // schema. If the prospect tries to submit before all sections are
  // complete, we 400 with field-level errors.
  const finalParsed = phase3Schema.safeParse(merged);
  if (!finalParsed.success) {
    return NextResponse.json(
      {
        error:
          "Some sections aren't complete yet. Go back and fill them in before submitting.",
        issues: finalParsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const phase3 = finalParsed.data;

  // Calculate fees from module selection.
  const fees = calculateFees(
    {
      moduleBooking: phase3.modules.moduleBooking,
      moduleEnquiry: phase3.modules.moduleEnquiry,
      moduleNewsletter: phase3.modules.moduleNewsletter,
      moduleOffers: phase3.modules.moduleOffers,
      gbpAddon: phase3.modules.gbpAddon,
      extraLocations: phase3.modules.extraLocations,
    },
    prospect.foundingMember,
  );

  try {
    await updateProspectPhase3(
      prospect.pageId,
      phase3,
      true,
      fees,
      phase3.modules.extraLocations,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    reportError("api/intake:final-save", e);
    return NextResponse.json(
      {
        error:
          "I couldn't save your final submission. Please try again, or email me directly.",
      },
      { status: 500 },
    );
  }

  // Notify Ben — failure logged but not fatal.
  const notif = buildPhase3Notification(
    prospect.name,
    prospect.email,
    fees,
    prospect.notionUrl,
  );
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    console.warn(
      `[api/intake] Notion saved but email failed: ${emailErr}`,
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://pandemonium-software-website.benpandher.workers.dev";
  const moduleSelection = {
    moduleBooking: phase3.modules.moduleBooking,
    moduleEnquiry: phase3.modules.moduleEnquiry,
    moduleNewsletter: phase3.modules.moduleNewsletter,
    moduleOffers: phase3.modules.moduleOffers,
    gbpAddon: phase3.modules.gbpAddon,
    extraLocations: phase3.modules.extraLocations,
  };
  const moduleList = buildModuleListMarkdown(moduleSelection);

  // Customer-facing receipt with the calculated fees + module-by-
  // module breakdown of what they're getting.
  try {
    await sendCustomerEmail(
      getServerEnv(),
      prospect.email,
      "phase3-thanks-fees-and-payment-coming",
      {
        customerName: firstName(prospect.name),
        setupFee: fees.setup,
        monthlyFee: fees.monthly,
        moduleList,
        foundingMember: prospect.foundingMember,
      },
    );
  } catch (e) {
    console.warn(
      `[api/intake] Customer fees email failed for ${prospect.email}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ---------- Stripe placeholder: auto-flip to Paid + send phase4 ----------
  // TODO(Stage 2A Part 2): remove this block once /api/stripe/webhook
  // is wired up. The Stripe webhook handler will own the Paid flip
  // and the phase4 onboarding email. Until then, /api/intake fakes
  // payment so the customer can complete the end-to-end onboarding
  // flow in testing.

  try {
    await markProspectAsPaid(prospect.pageId);
  } catch (e) {
    console.warn(
      `[api/intake] markProspectAsPaid failed (status flip): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    await sendCustomerEmail(
      getServerEnv(),
      prospect.email,
      "phase4-onboarding-hub-ready",
      {
        customerName: firstName(prospect.name),
        onboardingUrl: `${baseUrl}/onboarding/${token}`,
      },
    );
  } catch (e) {
    console.warn(
      `[api/intake] Customer onboarding-hub email failed for ${prospect.email}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({
    success: true,
    isFinal: true,
    redirect: `/onboarding/${token}`,
  });
}

/** Extract first name (or full string if it's a single word) for the
 * "Hi X," greeting. Defensive: trims, falls back to "there" on empty. */
function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
