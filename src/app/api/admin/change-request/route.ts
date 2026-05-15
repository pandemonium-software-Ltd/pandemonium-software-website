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
  markPreviewBuildTriggered,
} from "@/lib/notion-prospects";
import { site } from "@/lib/site";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";
import { revertChangeRequestPatches } from "@/lib/change-requests/revert-patches";

/** Anti-spam latch — same window step5-review uses. If a build
 *  was triggered in the last 15 minutes, skip rather than queue
 *  another one. Resolve actions usually pair with a single change
 *  + a single rebuild; bursts are typos in the operator's reply. */
const REBUILD_COOLDOWN_MS = 15 * 60 * 1000;

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  changeRequestId: z.string().min(1),
  status: z.enum(["pending", "in-progress", "resolved", "rejected"]),
  reply: z.string().trim().max(5000).optional(),
  /** Operator-only meta-actions (added 2026-05-15):
   *    "unlock"  re-opens a terminal CR back to pending/in-progress
   *              without requiring a customer reply or sending an
   *              email. Audit-stamps unlockedAt + unlockedBy.
   *    "revert"  forces status=rejected, walks the CR's
   *              coworkPatches in reverse and writes each
   *              previousValue back to onboardingData, dispatches
   *              a fresh live build, sends the customer the
   *              "rejected" email with an auto-generated reply
   *              about the revert. */
  action: z.enum(["unlock", "revert"]).optional(),
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
  const { token, changeRequestId, status, reply, action } = parsed.data;

  // Block resolution / rejection without a reply — customer always
  // gets a human-readable explanation when their request closes.
  // The "unlock" action is exempt because the CR is RE-OPENING, not
  // closing — no customer-facing reason needed yet. The "revert"
  // action is also exempt because we auto-generate the reply text
  // about the revert.
  const needsReply =
    (status === "resolved" || status === "rejected") && action !== "unlock" && action !== "revert";
  if (needsReply && !reply) {
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

  // ----- Action: REVERT (admin reverts an applied change) -----
  // Walks the CR's coworkPatches in reverse and writes each
  // previousValue back to onboardingData, then dispatches a fresh
  // live build to deploy the reverted state. Status is forced to
  // "rejected" with an auto-generated reply.
  let revertReport: {
    revertedCount: number;
    skipped: { target: string; reason: string }[];
  } | null = null;
  if (action === "revert") {
    const cr = prospect.changeRequests.find((c) => c.id === changeRequestId);
    if (!cr) {
      return NextResponse.json(
        { error: `Change request ${changeRequestId} not found on prospect.` },
        { status: 404 },
      );
    }
    if (!cr.coworkPatches || cr.coworkPatches.length === 0) {
      return NextResponse.json(
        {
          error:
            "This change request has no captured patches to revert (was never auto-applied by Cowork).",
        },
        { status: 400 },
      );
    }
    const result = await revertChangeRequestPatches({
      prospect,
      patches: cr.coworkPatches,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: `Revert failed: ${result.reason}` },
        { status: 500 },
      );
    }
    revertReport = {
      revertedCount: result.revertedCount,
      skipped: result.skipped,
    };
  }

  // For "revert", overwrite incoming status to "rejected" + auto-
  // generate a customer-facing reply explaining the revert. Operator
  // doesn't need to type anything; the action implies the message.
  // Skipped fields (if any) are mentioned so the customer knows to
  // check their dashboard if something didn't fully unwind.
  const effectiveStatus = action === "revert" ? "rejected" : status;
  const effectiveReply =
    action === "revert"
      ? reply ??
        (revertReport && revertReport.skipped.length === 0
          ? "We've reverted this change. Your site is back to how it was before."
          : `We've reverted what we could of this change (${revertReport?.revertedCount ?? 0} of ${(revertReport?.revertedCount ?? 0) + (revertReport?.skipped.length ?? 0)} fields). Anything that didn't unwind cleanly is flagged in your dashboard — let us know if it needs another pass.`)
      : reply;

  let updateResult;
  try {
    updateResult = await updateChangeRequest(prospect.pageId, changeRequestId, {
      status: effectiveStatus,
      reply: effectiveReply,
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
  // Unlock skips the email — re-opening a CR shouldn't notify the
  // customer (the operator is mid-investigation, not closing).
  // Revert sends the rejected-template email with the auto-generated
  // reply about the revert.
  const operatorTerminal =
    effectiveStatus === "resolved" || effectiveStatus === "rejected";
  const skipCustomerEmail = action === "unlock";
  if (
    !skipCustomerEmail &&
    updateResult.transitionedToTerminal &&
    operatorTerminal &&
    effectiveReply
  ) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
    const templateId =
      effectiveStatus === "resolved"
        ? "change-request-resolved"
        : "change-request-rejected";
    // siteUrl is required by the resolved template (primary CTA).
    // We resolve it from the prospect's onboarding domain — same
    // resolution as the build-callback's applied-live email so both
    // post-commit confirmations point at the same URL. Falls back
    // to a placeholder when the domain isn't yet captured (rare;
    // the customer is post-launch by this point in the flow).
    const customerDomain = ((prospect.onboardingData ?? {}) as {
      domain?: { domain?: string };
    }).domain?.domain;
    const siteUrl = customerDomain
      ? `https://${customerDomain}/`
      : "https://your-site.example/";
    try {
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        templateId,
        {
          customerName: firstName(prospect.name),
          originalMessage: updateResult.updated.message,
          reply: effectiveReply ?? "",
          siteUrl,
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

  // Auto-rebuild on FIRST resolve transition. The operator's
  // implied workflow is: customer asks for X → operator goes and
  // changes X in Notion / the Hub → operator marks resolved here
  // → email goes out → site rebuilds reflecting X. We trigger the
  // rebuild AT resolve time so the customer's "your change is
  // live" email isn't a lie by the time they click through.
  //
  // Skipped (with a structured reason in the response) when:
  //   - status isn't `resolved` (rejected = no change to ship)
  //   - this isn't the first terminal transition (no double builds
  //     when the operator re-saves an already-resolved request)
  //   - prospect has no workerName yet (Hub Step 5 hasn't run, no
  //     site to rebuild)
  //   - GitHub creds aren't configured (dev env)
  //   - cooldown latch — already triggered in the last 15 min
  let rebuildStatus:
    | { dispatched: true; via: "change-request-resolve" }
    | { dispatched: false; reason: string }
    | null = null;
  // Rebuild on first resolve transition (existing behaviour) AND
  // on revert (so the reverted state actually deploys to the live
  // site — without this the data revert lands in Notion but the
  // built site keeps showing the old applied value).
  const shouldRebuild =
    (effectiveStatus === "resolved" && updateResult.transitionedToTerminal) ||
    action === "revert";
  if (shouldRebuild) {
    rebuildStatus = await maybeDispatchRebuild(prospect);
  }

  // Always notify admin of the action — paper trail in inbox.
  try {
    const env = getServerEnv();
    const lines: string[] = [];
    const actionLabel =
      action === "unlock"
        ? `UNLOCK → ${effectiveStatus.toUpperCase()} (re-opened)`
        : action === "revert"
          ? `REVERT → ${effectiveStatus.toUpperCase()} (${revertReport?.revertedCount ?? 0} field(s) reverted${revertReport && revertReport.skipped.length > 0 ? `; ${revertReport.skipped.length} skipped` : ""})`
          : `status → ${effectiveStatus.toUpperCase()}`;
    lines.push(`Action: ${actionLabel}`);
    lines.push(`Change request: ${changeRequestId.slice(0, 8)}…`);
    lines.push(`Customer: ${prospect.name} <${prospect.email}>`);
    lines.push(`Original message:\n  "${updateResult.updated.message}"`);
    if (effectiveReply) lines.push(`Reply:\n  "${effectiveReply}"`);
    if (revertReport && revertReport.skipped.length > 0) {
      lines.push(`Revert skipped:`);
      for (const s of revertReport.skipped) {
        lines.push(`  • ${s.target}: ${s.reason}`);
      }
    }
    if (effectiveStatus === "resolved") {
      if (rebuildStatus?.dispatched) {
        lines.push(`Rebuild: dispatched (${rebuildStatus.via}).`);
      } else if (rebuildStatus && !rebuildStatus.dispatched) {
        lines.push(`Rebuild SKIPPED: ${rebuildStatus.reason}`);
      }
      if (updateResult.transitionedToTerminal && reply) {
        lines.push(
          emailErr
            ? `Customer email FAILED: ${emailErr}`
            : `Customer emailed (change-request-resolved template).`,
        );
      }
    } else if (effectiveStatus === "rejected") {
      if (rebuildStatus?.dispatched) {
        lines.push(`Rebuild: dispatched (${rebuildStatus.via}).`);
      } else if (rebuildStatus && !rebuildStatus.dispatched) {
        lines.push(`Rebuild SKIPPED: ${rebuildStatus.reason}`);
      }
      if (updateResult.transitionedToTerminal && effectiveReply) {
        lines.push(
          emailErr
            ? `Customer email FAILED: ${emailErr}`
            : `Customer emailed (change-request-rejected template).`,
        );
      }
    } else if (action === "unlock") {
      lines.push(`Customer NOT emailed (unlock action — internal only).`);
    }
    lines.push("");
    lines.push(adminFooter({
      prospectName: prospect.name,
      prospectToken: token,
      anchor: `cr-${changeRequestId.slice(0, 8)}`,
    }));
    await notifyAdmin(env, {
      subject: `${action === "unlock" ? "Unlocked" : action === "revert" ? "Reverted" : effectiveStatus === "resolved" ? "Resolved" : effectiveStatus === "rejected" ? "Rejected" : "Updated"} change request — ${prospect.name}`,
      body: lines.join("\n"),
      category: "change-request",
    });
  } catch (e) {
    console.warn(
      `[api/admin/change-request] admin notify failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({
    success: true,
    request: updateResult.updated,
    customerNotified:
      updateResult.transitionedToTerminal && !emailErr,
    emailWarning: emailErr,
    rebuild: rebuildStatus,
  });
}

/**
 * Fire a customer-site-build workflow_dispatch and stamp the
 * cooldown latch. All failure paths return a structured reason
 * rather than throwing — this is best-effort plumbing on top of
 * an already-successful change-request update + customer email.
 *
 * The operator can re-trigger manually via the Re-build button on
 * /admin/[token] if this leg fails.
 */
async function maybeDispatchRebuild(
  prospect: { token: string; pageId: string; name: string; business?: string;
    workerName?: string; cloudflareAccountId?: string;
    previewBuildTriggeredAt?: string },
):
  | Promise<
      | { dispatched: true; via: "change-request-resolve" }
      | { dispatched: false; reason: string }
    > {
  const env = getServerEnv();
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return {
      dispatched: false,
      reason:
        "GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not all configured — site rebuild skipped, you'll need to trigger one manually.",
    };
  }
  if (!prospect.workerName || !prospect.cloudflareAccountId) {
    return {
      dispatched: false,
      reason:
        "Customer has no Worker yet (Hub Step 2 + 5 haven't run). Resolve was applied to Notion but no site exists to rebuild.",
    };
  }
  if (prospect.previewBuildTriggeredAt) {
    const last = Date.parse(prospect.previewBuildTriggeredAt);
    if (Number.isFinite(last) && Date.now() - last < REBUILD_COOLDOWN_MS) {
      const minsLeft = Math.ceil(
        (REBUILD_COOLDOWN_MS - (Date.now() - last)) / 60_000,
      );
      return {
        dispatched: false,
        reason: `Recent build still in flight (cooldown: ${minsLeft} min). The next manual rebuild will pick up this change.`,
      };
    }
  }
  try {
    await dispatchRepositoryEvent({
      token: env.GITHUB_TOKEN,
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      eventType: "customer-site-build",
      clientPayload: {
        token: prospect.token,
        prospectName: prospect.name,
        businessName: prospect.business ?? "",
        // Surfaces in the GitHub Action's run name so logs show
        // "triggered by change-request-resolve" rather than just
        // "triggered by repository_dispatch".
        trigger: "change-request-resolve",
      },
    });
  } catch (e) {
    const msg =
      e instanceof GithubApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn(
      `[api/admin/change-request] dispatchRepositoryEvent failed: ${msg}`,
    );
    return {
      dispatched: false,
      reason: `GitHub dispatch failed: ${msg}. Customer email + Notion update still went through; you'll need to trigger a rebuild manually.`,
    };
  }
  // Stamp the latch — best effort, don't fail the whole leg if it
  // doesn't write. Worst case the next resolve in the cooldown
  // window also dispatches (fine, it's idempotent on GitHub's side).
  try {
    await markPreviewBuildTriggered(prospect.pageId);
  } catch (e) {
    console.warn(
      `[api/admin/change-request] dispatch fired but latch write failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return { dispatched: true, via: "change-request-resolve" };
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
