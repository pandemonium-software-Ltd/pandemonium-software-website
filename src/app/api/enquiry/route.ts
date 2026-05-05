// POST /api/enquiry — Phase 1 submission handler.
//
// Flow:
//   1. Parse body with phase1Schema (zod)
//   2. Reject if honeypot field is filled (bots only)
//   3. Generate UUID v4 token (links the email → /qualify/[token] URL)
//   4. Create Notion Prospects record (status "Phase 1 Complete")
//   5. Send internal notification to Ben with qualification link
//   6. Return { success: true }
//
// Token NEVER goes back to the browser — it's only emailed to Ben so
// he can paste the qualify link into the L1 reply he sends manually.

import { NextResponse } from "next/server";
import { phase1Schema } from "@/lib/schemas";
import { createProspect } from "@/lib/notion-prospects";
import {
  buildPhase1Notification,
  sendInternalNotification,
} from "@/lib/email";

// Force Node runtime (OpenNext on Cloudflare Workers serves this via
// nodejs_compat). Notion + Resend SDKs both need real fetch + Buffer
// shims that nodejs_compat provides.
export const runtime = "nodejs";

// Parse honeypot off the body before zod runs. Real phase1 schema
// doesn't include it.
type RawBody = Record<string, unknown> & { company_website?: unknown };

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

  // Honeypot check — silently accept-and-discard so bots don't learn.
  if (typeof raw.company_website === "string" && raw.company_website.length > 0) {
    return NextResponse.json({ success: true });
  }

  const parsed = phase1Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Some details didn't validate. Please check the form and try again.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Generate token. crypto.randomUUID is available on Workers and
  // Node 19+, so we don't need a uuid package.
  const token = crypto.randomUUID();

  let pageId: string;
  let notionUrl: string;
  try {
    const result = await createProspect(data, token);
    pageId = result.pageId;
    notionUrl = result.notionUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/enquiry] Notion error:", msg);
    return NextResponse.json(
      {
        error:
          "I couldn't save your enquiry just now — please try again in a minute, or email me directly.",
      },
      { status: 500 },
    );
  }

  // Notification to Ben. Failures here are logged but don't fail the
  // request — the prospect's data is already in Notion, so a missed
  // email is recoverable from the admin dashboard.
  const notif = buildPhase1Notification(data, token, notionUrl);
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    console.warn(
      `[api/enquiry] Notion saved (page ${pageId}) but email failed: ${emailErr}`,
    );
  }

  return NextResponse.json({ success: true });
}

// Other methods get a 405. Defensive — Next would 404 anyway, but a
// 405 is more helpful for anyone hitting the URL by hand.
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
