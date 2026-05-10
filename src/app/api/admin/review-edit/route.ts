// PATCH /api/admin/review-edit — operator endpoint for actioning a
// pre-commit (Hub Step 5) review edit.
//
// Symmetric to /api/admin/change-request but for the pre-commit
// flow. Two actions:
//   - approve: flip status to "applied" + dispatch a fresh LIVE
//     build to deploy the patch (which step6 may or may not have
//     already applied to Notion). Customer gets the
//     review-edit-applied email.
//   - reject: flip status to "rejected" + leave Notion unchanged.
//     Customer's allowance increments back since the edit didn't
//     actually consume a slot.
//
// Both actions stamp coworkEscalatedAt/resolvedAt as appropriate
// so the cron stops re-processing.
//
// Auth: middleware Basic Auth on /api/admin/*. By the time this
// route runs, Ben is authenticated.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  patchReviewEdit,
} from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  editId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  /** Operator's note — included in the customer email for context.
   *  Optional on approve (default copy used), required on reject
   *  (customer needs to know why). */
  reply: z.string().trim().max(2000).optional(),
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
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { token, editId, action, reply } = parsed.data;

  // Reject requires a reply — customer needs to know why.
  if (action === "reject" && !reply) {
    return NextResponse.json(
      {
        error:
          "Rejecting requires a reply — that's what the customer sees on their dashboard.",
      },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found." },
      { status: 404 },
    );
  }

  // Verify the edit exists in Lucas's onboardingData.review.edits[].
  const ob = (prospect.onboardingData ?? {}) as {
    review?: { edits?: { id: string; message: string }[] };
  };
  const edit = (ob.review?.edits ?? []).find((e) => e.id === editId);
  if (!edit) {
    return NextResponse.json(
      { error: "Review edit not found on this prospect." },
      { status: 404 },
    );
  }

  const env = getServerEnv();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;

  // Update Notion first — same fail-soft pattern as the change-
  // request handler. If Notion fails we abort; if downstream
  // (build dispatch, email) fails we surface a warning but the
  // status is already in the right place.
  try {
    await patchReviewEdit(prospect.pageId, editId, {
      status: action === "approve" ? "applied" : "rejected",
      resolvedAt: new Date().toISOString(),
      adminReply: reply,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[api/admin/review-edit] Notion update failed: ${msg}`,
    );
    return NextResponse.json(
      { error: "Couldn't save just now." },
      { status: 500 },
    );
  }

  // On approve: dispatch a fresh live build so the patch (which
  // step6 likely already applied to Notion) actually deploys.
  // On reject: no build needed.
  let buildStatus:
    | { dispatched: true }
    | { dispatched: false; reason: string }
    | null = null;
  if (action === "approve") {
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      buildStatus = {
        dispatched: false,
        reason:
          "GitHub creds not configured — Notion + email applied but build skipped.",
      };
    } else if (!prospect.workerName || !prospect.cloudflareAccountId) {
      buildStatus = {
        dispatched: false,
        reason:
          "Customer has no Worker yet (Hub steps 1-2 incomplete) — build skipped.",
      };
    } else {
      try {
        await dispatchRepositoryEvent({
          token: env.GITHUB_TOKEN,
          owner: env.GITHUB_OWNER,
          repo: env.GITHUB_REPO,
          eventType: "customer-site-build",
          clientPayload: {
            token,
            prospectName: prospect.name,
            businessName: prospect.business ?? "",
            mode: "live",
            reviewEditId: editId,
          },
        });
        buildStatus = { dispatched: true };
      } catch (e) {
        const msg =
          e instanceof GithubApiError
            ? `${e.message} (HTTP ${e.status})`
            : e instanceof Error
              ? e.message
              : String(e);
        buildStatus = {
          dispatched: false,
          reason: `GitHub dispatch failed: ${msg}.`,
        };
      }
    }
  }

  // Customer email — fail-soft.
  let emailWarning: string | null = null;
  if (action === "approve") {
    // The build callback will email the customer once the build
    // completes (review-edit-applied). For now don't pre-email,
    // saves a duplicate notification.
  } else {
    // Reject: send a "your edit was rejected" using the existing
    // change-request-rejected template. Same shape: original
    // message + reply.
    try {
      const accountUrl = `${baseUrl.replace(/\/$/, "") || site.url}/account/${token}`;
      await sendCustomerEmail(
        env,
        prospect.email,
        "change-request-rejected",
        {
          customerName: firstName(prospect.name),
          originalMessage: edit.message,
          reply: reply ?? "",
          accountUrl,
        },
      );
    } catch (e) {
      emailWarning = e instanceof Error ? e.message : String(e);
      console.warn(
        `[api/admin/review-edit] reject email failed: ${emailWarning}`,
      );
    }
  }

  return NextResponse.json({
    success: true,
    action,
    build: buildStatus,
    customerNotified: action === "reject" ? !emailWarning : null,
    emailWarning,
  });
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use PATCH." },
    { status: 405, headers: { Allow: "PATCH" } },
  );
}
