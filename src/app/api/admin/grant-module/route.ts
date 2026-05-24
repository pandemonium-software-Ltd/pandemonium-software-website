// POST /api/admin/grant-module — operator endpoint to add (or
// remove) a module to a prospect's active selection and re-calc
// their setup + monthly fees in one shot. Bypasses the customer-
// initiated one-round-per-customer module-change cap because this
// is an out-of-band operator action (e.g. "I missed GBP at intake
// and want to add it now without burning the customer's change
// round").
//
// Why bypass the module-change flow: the change-log + Stripe
// reconciliation pipeline is built around customer self-service
// (per src/lib/billing). For operator-driven corrections we just
// want to write the new selection + the new fees directly. No
// change-log entry is written — that pipeline is for customer-
// initiated changes only. Audit trail lives in the Notion
// property's revision history.
//
// Auth: middleware Basic Auth on /api/admin/*.
//
// Request body:
//   { token: string, module: <MODULE_OPTIONS>, action: "add" | "remove" }
//
// Side effects:
//   - Module Selections multi-select updated (idempotent: adding a
//     module already present is a no-op).
//   - Setup Fee Calculated + Monthly Fee Calculated recomputed
//     from the new selection (using calculateFees, honouring the
//     Founding Member flag).
//
// Returns the new selection + the recomputed fees so the admin
// page can refresh in place without a full reload.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProspectByToken } from "@/lib/notion-prospects";
import { notionFetch } from "@/lib/notion";
import { MODULE_OPTIONS } from "@/lib/schemas";
import { calculateFees } from "@/lib/fees";

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
      {
        error: "Request did not validate.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { token, module: moduleName, action } = parsed.data;

  const prospect = await getProspectByToken(token);
  if (!prospect) {
    return NextResponse.json(
      { error: `No prospect with token ${token}.` },
      { status: 404 },
    );
  }

  const current = new Set(prospect.moduleSelections);
  if (action === "add") current.add(moduleName);
  if (action === "remove") current.delete(moduleName);
  const nextModules = [...current].sort();

  // Recompute fees from the new selection. Founding-member flag
  // overrides the per-module pricing exactly the same way it does
  // at intake — we honour the existing flag rather than letting
  // operator actions accidentally flip pricing tier.
  const fees = calculateFees(
    {
      moduleBooking: current.has("Online Booking"),
      moduleEnquiry: current.has("Enquiry Form"),
      moduleNewsletter: current.has("Newsletter"),
      moduleOffers: current.has("Offers"),
      gbpAddon: current.has("Google Business Profile Setup/Audit"),
    },
    prospect.foundingMember,
  );

  // Single PATCH so the three properties land atomically.
  await notionFetch(`/pages/${prospect.pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Module Selections": {
          multi_select: nextModules.map((name) => ({ name })),
        },
        "Setup Fee Calculated": { number: fees.setup },
        "Monthly Fee Calculated": { number: fees.monthly },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    token,
    action,
    module: moduleName,
    modules: nextModules,
    setup: fees.setup,
    monthly: fees.monthly,
    founding: fees.founding,
  });
}
