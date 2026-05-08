// POST /api/account/change-request — customer dashboard's "Need a
// change?" form handler.
//
// Validates the token and message, generates a ChangeRequest record,
// appends it to the customer's Notion Change Requests Inbox, and
// notifies Ben so he can act on it (or in Stage 2C, Cowork classifies
// + drafts first).
//
// Access gated to active customer statuses (Paid onwards). Cancelled
// customers can't submit new requests — the dashboard hides the form
// for them, but we double-check server-side.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  appendChangeRequest,
  type ChangeRequest,
} from "@/lib/notion-prospects";
import {
  sendInternalNotification,
  type NotificationPayload,
} from "@/lib/email";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE, "Missing or invalid token."),
  message: z
    .string()
    .trim()
    .min(5, "Please describe the change in at least a few words.")
    .max(5000, "That's a lot for one message — please split it up."),
});

const ELIGIBLE_STATUSES = new Set([
  "Paid",
  "Onboarding Started",
  "Onboarding Complete",
  "Build Started",
  "Live",
]);

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
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }
  const { token, message } = parsed.data;

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/account/change-request] Notion lookup error:", msg);
    return NextResponse.json(
      { error: "Couldn't look up your account. Please try again." },
      { status: 500 },
    );
  }
  if (!prospect) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 },
    );
  }
  if (!ELIGIBLE_STATUSES.has(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Change requests are paused on this account. Email me directly if it's urgent.",
      },
      { status: 403 },
    );
  }

  const newRequest: ChangeRequest = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    message,
    status: "pending",
  };

  try {
    await appendChangeRequest(prospect.pageId, newRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/account/change-request] Notion write error:", msg);
    return NextResponse.json(
      {
        error:
          "Couldn't save your request just now. Please try again, or email me directly.",
      },
      { status: 500 },
    );
  }

  // Internal notification — fail-soft, never blocks the user response.
  const notif: NotificationPayload = {
    subject: `[CHANGE REQUEST] ${prospect.name}${prospect.business ? ` (${prospect.business})` : ""}`,
    body:
      `New change request from ${prospect.name}${prospect.business ? ` at ${prospect.business}` : ""}.\n\n` +
      `--- Their request ---\n${message}\n--- End ---\n\n` +
      `Status: ${prospect.status}\n` +
      `Notion: ${prospect.notionUrl}\n` +
      `Admin detail: ${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pandemonium-software-website.benpandher.workers.dev"}/admin/${token}\n\n` +
      `— Cowork`,
  };
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    console.warn(
      `[api/account/change-request] Notion saved but email failed: ${emailErr}`,
    );
  }

  return NextResponse.json({ success: true, request: newRequest });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
