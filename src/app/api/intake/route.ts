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
//   8. Return { success, redirect: "/payment/<token>" }

import { NextResponse } from "next/server";
import {
  phase3Schema,
  phase3PartialSchema,
  type Phase3Partial,
} from "@/lib/schemas";
import {
  getProspectByToken,
  updateProspectPhase3,
} from "@/lib/notion-prospects";
import { calculateFees } from "@/lib/fees";
import {
  buildPhase3Notification,
  sendInternalNotification,
} from "@/lib/email";

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
    console.error("[api/intake] Notion lookup error:", msg);
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
      console.error("[api/intake] Notion partial-save error:", msg);
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
      gbpAddon: phase3.modules.gbpAddon,
    },
    prospect.foundingMember,
  );

  try {
    await updateProspectPhase3(prospect.pageId, phase3, true, fees);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/intake] Notion final-save error:", msg);
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

  return NextResponse.json({
    success: true,
    isFinal: true,
    redirect: `/payment/${token}`,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
