// POST /api/account/change-request — customer dashboard's "Need a
// change?" form handler.
//
// Three layers of validation before the request is saved:
//   1. Schema (zod): token format, message length
//   2. Multi-item detector: numbered/bulleted lists, "Also,",
//      multiple "Please" — declined with 422 + "split into separate
//      requests" message
//   3. Monthly cap: MONTHLY_CHANGE_REQUEST_LIMIT (3) per calendar
//      month; rejected requests don't count toward the cap (those
//      are typically out-of-scope items quoted separately)
//
// Multi-item heuristic is intentionally a brittle-but-conservative
// regex pattern. Cowork (Stage 2C) will graduate this to LLM-based
// classification once it's online.
//
// Access gated to active customer statuses (Paid onwards).
// Cancelled customers can't submit new requests — the dashboard
// hides the form for them, but we double-check server-side.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendChangeRequest,
  countActiveChangeRequestsThisMonth,
  getProspectByToken,
  MONTHLY_CHANGE_REQUEST_LIMIT,
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

  // Multi-item check: each request must be a single item. Detected
  // patterns get a polite "split into separate requests" reply.
  // Doesn't burn the cap — nothing's saved.
  if (looksLikeMultipleItems(message)) {
    return NextResponse.json(
      {
        error:
          "Looks like you've sent multiple changes in one request. Please split them into separate change requests — one item per request — so each can be tracked and applied cleanly.",
        suggestion: "split-into-separate-requests",
      },
      { status: 422 },
    );
  }

  // Monthly cap check: count requests submitted this calendar month
  // that aren't rejected (out-of-scope items quoted separately don't
  // count). Reset is on the 1st of each month, UTC.
  const usedThisMonth = countActiveChangeRequestsThisMonth(
    prospect.changeRequests,
  );
  if (usedThisMonth >= MONTHLY_CHANGE_REQUEST_LIMIT) {
    const nextReset = nextMonthStartIso();
    return NextResponse.json(
      {
        error: `You've used your ${MONTHLY_CHANGE_REQUEST_LIMIT} change requests for this month. Allowance resets on ${formatDateNice(nextReset)}. For anything bigger or more urgent, email me directly and I'll quote it separately.`,
        remaining: 0,
        resetsOn: nextReset,
      },
      { status: 429 },
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

  const remainingAfter =
    MONTHLY_CHANGE_REQUEST_LIMIT - (usedThisMonth + 1);
  return NextResponse.json({
    success: true,
    request: newRequest,
    remaining: remainingAfter,
  });
}

// ---------- Multi-item detector ----------
//
// Conservative heuristic — flags obvious multi-item submissions
// without being noisy on single-item-with-multiple-data-points
// requests like "update opening hours: Mon-Fri 8-6, Sat 9-12".
// Any one of the rules below triggers a decline:
//   1. Numbered list with 2+ items
//   2. Bullet list with 2+ items
//   3. Explicit conjunctive markers ("Also,", "and also",
//      "additionally", "secondly", "thirdly")
//   4. "Please" appearing 2+ times — typically each "Please X" is
//      a separate ask
//
// Stage 2C (Cowork's LLM classifier) will replace this regex with
// proper semantic classification.

function looksLikeMultipleItems(message: string): boolean {
  // Numbered list: lines like "1." "1)" "(1)" with content after
  const numbered = (
    message.match(/(?:^|\n)\s*\(?\d+[.)]\s+\S/g) ?? []
  ).length;
  if (numbered >= 2) return true;

  // Bullet list: lines starting with -, *, • with content after
  const bullets = (
    message.match(/(?:^|\n)\s*[-*•]\s+\S/g) ?? []
  ).length;
  if (bullets >= 2) return true;

  // Sentence-starting conjunctive markers ("Also,", "Additionally,",
  // "Secondly,", etc. — anywhere a new sentence begins). Restricting
  // to sentence start avoids false-positives on filler "also" mid-
  // sentence ("I have also uploaded the new file" should NOT match).
  if (
    /(?:^|[.!?\n]\s*)(?:also|additionally|secondly|thirdly|second:|third:)\b[,.\s]/i.test(
      message,
    )
  ) {
    return true;
  }
  // "and also" anywhere — that's a compound conjunction joining two
  // distinct asks ("change X and also do Y"), not filler.
  if (/\band\s+also\b/i.test(message)) {
    return true;
  }

  // 2+ "Please" instances — each typically heads a separate ask
  const pleases = (message.match(/(?:^|\W)please\b/gi) ?? []).length;
  if (pleases >= 2) return true;

  return false;
}

// ---------- Date helpers ----------

function nextMonthStartIso(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return next.toISOString();
}

function formatDateNice(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
