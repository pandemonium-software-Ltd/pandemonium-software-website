// GET /api/prospect/[token] — prospect lookup by Phase 1 token.
//
// Used by the qualification page (and later the intake page) to render
// the prospect's name/business in the header. Returns only the safe
// fields — never the full ProspectRecord because that includes
// internal compatibility reasoning, blocker IDs etc. that the prospect
// shouldn't see.

import { NextResponse } from "next/server";
import { getProspectByToken } from "@/lib/notion-prospects";

export const runtime = "nodejs";

// UUID v4 shape: 8-4-4-4-12 hex chars. Defends against path-traversal
// and obviously-malformed tokens before we hit Notion.
const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Invalid token." },
      { status: 400 },
    );
  }

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/prospect] Notion error:", msg);
    return NextResponse.json(
      { error: "Could not look up your enquiry. Please try again." },
      { status: 500 },
    );
  }

  if (!prospect) {
    return NextResponse.json(
      { error: "Link not found." },
      { status: 404 },
    );
  }

  // Sanitised payload — just enough for the qualify/intake pages to
  // confirm to the prospect they're in the right place and pre-fill
  // their name/business in the header.
  return NextResponse.json({
    name: prospect.name,
    email: prospect.email,
    business: prospect.business,
    businessType: prospect.businessType,
    status: prospect.status,
  });
}
