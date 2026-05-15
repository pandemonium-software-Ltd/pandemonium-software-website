// POST /api/admin/grant-allowance — operator-only endpoint that
// extends a customer's monthly allowance for one of three things:
//
//   - changeRequests: extra free-text CRs above MONTHLY_CHANGE_REQUEST_LIMIT
//   - offers:         extra offer updates above MONTHLY_OFFER_UPDATE_LIMIT
//   - newsletters:    extra newsletter sends above NEWSLETTER_MONTHLY_SEND_LIMIT
//
// Each call adds `delta` (default 1) to the bonus counter for the
// CURRENT calendar month. Resets at month rollover (next month's
// counter reads back as 0). Operator can pass negative delta to
// take back a grant they just gave (clamped to 0 floor).
//
// Auth: Basic Auth via src/middleware.ts (matcher includes
// /api/admin/:path*). By the time this handler runs, Ben is
// authenticated.

import { NextResponse } from "next/server";
import { z } from "zod";
import { addAdminGrant } from "@/lib/admin-grants";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";
import { getServerEnv } from "@/lib/env";
import { getProspectByToken } from "@/lib/notion-prospects";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  kind: z.enum(["changeRequests", "offers", "newsletters"]),
  /** Bonus to add. Default 1. Positive grants additional allowance;
   *  negative takes back (clamped to 0). Capped at ±10/call to stop
   *  fat-finger giant grants — operator can re-call if they really
   *  meant +50. */
  delta: z.number().int().min(-10).max(10).default(1),
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
  const { token, kind, delta } = parsed.data;

  const result = await addAdminGrant({ token, kind, delta });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "prospect not found" ? 404 : 500 },
    );
  }

  // Audit: notify Ben that the grant was made (paper trail in
  // inbox). Fail-soft.
  try {
    const prospect = await getProspectByToken(token).catch(() => null);
    if (prospect) {
      await notifyAdmin(getServerEnv(), {
        category: "change-request",
        subject: `Allowance granted (${kind} +${delta}) — ${prospect.name}`,
        body:
          `Action: granted ${delta > 0 ? "+" : ""}${delta} ${kind} for ${prospect.name}.\n\n` +
          `New ${kind} bonus for ${result.monthKey}: ${result.newTotal}\n\n` +
          adminFooter({
            prospectName: prospect.name,
            prospectToken: token,
          }),
      });
    }
  } catch (e) {
    console.warn(
      `[grant-allowance] admin notify failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({
    success: true,
    kind,
    delta,
    newTotal: result.newTotal,
    monthKey: result.monthKey,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
