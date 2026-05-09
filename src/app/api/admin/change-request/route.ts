// PATCH /api/admin/change-request — operator endpoint for updating a
// customer's change request status / reply.
//
// Auth: Basic Auth via src/middleware.ts (matcher includes
// /api/admin/:path*). By the time this route runs, Ben is
// authenticated.
//
// Side effect: when the status flips into a TERMINAL state
// (resolved or rejected) for the first time, we send the customer
// an email containing the operator's reply verbatim. Re-saving an
// already-terminal request does NOT re-send the email — guarded by
// the `transitionedToTerminal` flag returned by updateChangeRequest.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateChangeRequest,
} from "@/lib/notion-prospects";
import { site } from "@/lib/site";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  changeRequestId: z.string().min(1),
  status: z.enum(["pending", "in-progress", "resolved", "rejected"]),
  reply: z.string().trim().max(5000).optional(),
});

export async function PATCH(request: Request) {
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
  const { token, changeRequestId, status, reply } = parsed.data;

  // Block resolution / rejection without a reply — customer always
  // gets a human-readable explanation when their request closes.
  if ((status === "resolved" || status === "rejected") && !reply) {
    return NextResponse.json(
      {
        error:
          "Resolving or rejecting requires a reply — that's what the customer sees on their dashboard and email.",
      },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  let updateResult;
  try {
    updateResult = await updateChangeRequest(prospect.pageId, changeRequestId, {
      status,
      reply,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/admin/change-request] Notion update error:", msg);
    return NextResponse.json(
      { error: msg.startsWith("Change request") ? msg : "Update failed." },
      { status: msg.startsWith("Change request") ? 404 : 500 },
    );
  }

  // Customer email on first transition into a terminal state.
  // Limited to operator-driven outcomes (resolved / rejected) — a
  // defensive "retracted" set from this route would NOT email the
  // customer (they themselves retracted, no need for confirmation).
  //
  // Routes through the branded HTML wrapper (sendCustomerEmail)
  // for visual parity with all other customer-facing emails.
  let emailErr: string | null = null;
  const operatorTerminal = status === "resolved" || status === "rejected";
  if (updateResult.transitionedToTerminal && operatorTerminal && reply) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
    const templateId =
      status === "resolved"
        ? "change-request-resolved"
        : "change-request-rejected";
    try {
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        templateId,
        {
          customerName: firstName(prospect.name),
          originalMessage: updateResult.updated.message,
          reply,
          accountUrl: `${baseUrl}/account/${token}`,
        },
      );
    } catch (e) {
      emailErr = e instanceof Error ? e.message : String(e);
      console.warn(
        `[api/admin/change-request] Notion updated but customer email failed: ${emailErr}`,
      );
    }
  }

  return NextResponse.json({
    success: true,
    request: updateResult.updated,
    customerNotified:
      updateResult.transitionedToTerminal && !emailErr,
    emailWarning: emailErr,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use PATCH." },
    { status: 405, headers: { Allow: "PATCH" } },
  );
}

/** "Alex Smith" → "Alex". Fallback to "there" on empty. */
function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}
