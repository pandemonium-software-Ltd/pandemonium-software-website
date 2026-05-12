// POST /api/admin/dictate-patch — operator endpoint for forcing a
// patch through the standard applier when Cowork couldn't classify
// the request automatically (out-of-scope, ambiguous, mixed scope).
//
// Use case: a customer asks for something Cowork rejected ("change
// my opening hours Mon-Fri 9-6, closed weekends"). Ben sees the
// escalation, knows it's actually patchable, opens the admin UI,
// picks the target, types the new value, hits Apply.
//
// What this does:
//   1. Re-uses applyChangeRequestPatches — the SAME applier
//      Cowork uses on the happy path. Same validation, same
//      schema check, same atomic write.
//   2. Stamps coworkPatches on the edit so the audit trail looks
//      like the auto-apply path (with `dictatedByAdmin: true`
//      on each entry so admins can tell them apart later).
//   3. Dispatches a live build via the standard customer-site-build
//      workflow with reviewEditId threaded through.
//   4. Optionally sends the customer the "review-edit-applied"
//      email (caller controls whether to suppress).
//
// Currently supports REVIEW EDITS (pre-commit). Post-commit change
// requests should use /api/admin/change-request with a similar
// dictate flag (added separately if needed).

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  patchReviewEdit,
} from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { site } from "@/lib/site";
import {
  applyChangeRequestPatches,
  type IncomingPatch,
} from "@/lib/change-requests/apply-patch";
import {
  SAFE_PATCH_TARGETS,
  type SafeTarget,
} from "@/lib/haiku/classify-change-request";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchInputSchema = z.object({
  target: z.enum(SAFE_PATCH_TARGETS),
  newValue: z.string().min(1).max(20_000),
  serviceName: z.string().max(200).optional(),
  faqQuestion: z.string().max(300).optional(),
  testimonialName: z.string().max(100).optional(),
});

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  editId: z.string().min(1),
  patches: z.array(patchInputSchema).min(1).max(10),
  /** Optional reply included in the customer email. If unset, the
   *  customer-side email is skipped — operator can communicate
   *  separately. */
  reply: z.string().trim().max(2000).optional(),
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
  const { token, editId, patches } = parsed.data;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found." },
      { status: 404 },
    );
  }

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

  // Run the patches through the standard applier. Atomic — any
  // failure leaves Notion at the pre-call state.
  const incoming: IncomingPatch[] = patches.map((p) => ({
    target: p.target as SafeTarget,
    newValue: p.newValue,
    serviceName: p.serviceName,
    faqQuestion: p.faqQuestion,
    testimonialName: p.testimonialName,
  }));
  const apply = await applyChangeRequestPatches({
    prospect,
    patches: incoming,
  });
  if (!apply.ok) {
    return NextResponse.json(
      { error: `Apply failed: ${apply.reason}` },
      { status: 400 },
    );
  }

  // Stamp the edit so the audit trail shows the dictated patches
  // (same shape as Cowork auto-apply) + flip status to "applied".
  // dictatedByAdmin flag distinguishes these in /admin so it's
  // clear who made the call.
  try {
    await patchReviewEdit(prospect.pageId, editId, {
      status: "applied",
      resolvedAt: new Date().toISOString(),
      adminReply: parsed.data.reply,
      coworkPatches: apply.applied.map((p) => ({
        target: p.target,
        newValue: p.newValue as unknown,
        previousValue: p.previousValue,
        dictatedByAdmin: true,
      })),
      coworkPatch: undefined,
      coworkPatchAppliedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[api/admin/dictate-patch] patches applied to Notion but edit-stamp failed: ${msg}`,
    );
    // Don't return error — Notion DATA is correct, only the audit
    // entry is missing. Operator can re-stamp manually if needed.
  }

  // Dispatch a live build so the changes ship.
  let buildStatus:
    | { dispatched: true }
    | { dispatched: false; reason: string };
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    buildStatus = {
      dispatched: false,
      reason:
        "GitHub creds not configured — patches applied to Notion but no build dispatched.",
    };
  } else if (!prospect.workerName || !prospect.cloudflareAccountId) {
    buildStatus = {
      dispatched: false,
      reason:
        "Customer has no per-customer Worker yet — patches applied but no build dispatched.",
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
        reason: `GitHub dispatch failed: ${msg}`,
      };
    }
  }

  // Paper trail for the inbox — clearly mark this as a DICTATED
  // patch so future-Ben can grep these out from the cron-auto-apply
  // stream.
  try {
    const patchLines = apply.applied
      .map((p) => `  - ${p.target} → "${String(p.newValue)}"`)
      .join("\n");
    await notifyAdmin(env, {
      category: "review-edit",
      subject: `Dictated ${apply.applied.length} patch${apply.applied.length === 1 ? "" : "es"} — ${prospect.name}`,
      body:
        `You dictated patches via the /admin override for an edit Cowork couldn't classify.\n\n` +
        `Edit: ${editId.slice(0, 8)}…\n` +
        `Customer's request:\n  "${edit.message}"\n\n` +
        `Patches:\n${patchLines}\n\n` +
        (buildStatus.dispatched
          ? `Build dispatched — customer will get the "applied" email when it completes.\n\n`
          : `Build SKIPPED: ${buildStatus.reason}\n\n`) +
        adminFooter({
          prospectName: prospect.name,
          prospectToken: token,
          anchor: `re-${editId.slice(0, 8)}`,
        }),
    });
  } catch (e) {
    console.warn(
      `[api/admin/dictate-patch] admin notify failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({
    success: true,
    applied: apply.applied.map((p) => ({
      target: p.target,
      newValue: p.newValue,
    })),
    build: buildStatus,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

// site import kept for ESLint (used implicitly by adminFooter via
// the env baseUrl resolution).
void site;
