import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  patchChangeRequest,
  patchReviewEdit,
} from "@/lib/notion-prospects";
import { classifyChangeRequest, type SafeTarget } from "@/lib/haiku/classify-change-request";
import { applyChangeRequestPatches } from "@/lib/change-requests/apply-patch";
import { buildSiteSnapshot } from "@/lib/change-requests/site-snapshot";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { site } from "@/lib/site";

const schema = z.object({
  token: z.string().min(1),
  itemId: z.string().min(1),
  itemKind: z.enum(["cr", "re"]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { token, itemId, itemKind } = parsed.data;

  const prospect = await getProspectByToken(token);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  let message: string;
  if (itemKind === "cr") {
    const cr = prospect.changeRequests.find((r) => r.id === itemId);
    if (!cr) {
      return NextResponse.json({ error: "Change request not found" }, { status: 404 });
    }
    if (cr.status === "resolved" || cr.status === "rejected" || cr.status === "retracted") {
      return NextResponse.json(
        { error: `Cannot retry a ${cr.status} request — unlock it first` },
        { status: 400 },
      );
    }
    message = cr.message;
  } else {
    const ob = (prospect.onboardingData ?? {}) as {
      review?: { edits?: Array<{ id: string; message: string; status: string }> };
    };
    const edit = (ob.review?.edits ?? []).find((e) => e.id === itemId);
    if (!edit) {
      return NextResponse.json({ error: "Review edit not found" }, { status: 404 });
    }
    message = edit.message;
  }

  // Reset classification fields first
  const resetFields = {
    coworkClassification: undefined,
    coworkConfidence: undefined,
    coworkReasoning: undefined,
    coworkEscalatedAt: undefined,
    coworkRetriedAt: undefined,
    coworkPatches: undefined,
    coworkPatch: undefined,
    coworkPatchAppliedAt: undefined,
  };

  if (itemKind === "cr") {
    await patchChangeRequest(prospect.pageId, itemId, {
      ...resetFields,
      status: "pending" as const,
    });
  } else {
    await patchReviewEdit(prospect.pageId, itemId, {
      ...resetFields,
      status: "submitted",
    });
  }

  // Run classification + apply inline (same as cowork-apply)
  let classification;
  try {
    classification = await classifyChangeRequest({
      message,
      snapshot: buildSiteSnapshot(prospect),
    });
  } catch (e) {
    return NextResponse.json({
      success: true,
      outcome: "classify-failed",
      message: `Haiku unreachable: ${e instanceof Error ? e.message : String(e)}. Request reset to pending — cron will retry.`,
    });
  }

  if (!classification) {
    return NextResponse.json({
      success: true,
      outcome: "classify-failed",
      message: "Haiku returned null. Request reset to pending — cron will retry.",
    });
  }

  // Stamp classification
  const classFields = {
    coworkClassification: classification.classification,
    coworkConfidence: classification.confidence,
    coworkReasoning: classification.reasoning,
  };
  if (itemKind === "cr") {
    await patchChangeRequest(prospect.pageId, itemId, classFields).catch(() => {});
  } else {
    await patchReviewEdit(prospect.pageId, itemId, classFields).catch(() => {});
  }

  const eligible =
    classification.classification === "in_scope" &&
    classification.confidence >= 0.75;
  const hasPatches = !!classification.patches && classification.patches.length > 0;
  const isRebuildOnly = eligible && !!classification.rebuildOnly;

  if (!eligible || (!hasPatches && !isRebuildOnly)) {
    // Escalate
    const escalateFields = { coworkEscalatedAt: new Date().toISOString() };
    if (itemKind === "cr") {
      await patchChangeRequest(prospect.pageId, itemId, escalateFields).catch(() => {});
    } else {
      await patchReviewEdit(prospect.pageId, itemId, escalateFields).catch(() => {});
    }
    return NextResponse.json({
      success: true,
      outcome: "escalated",
      classification: classification.classification,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      patches: classification.patches,
      message: `Haiku: ${classification.classification} (${(classification.confidence * 100).toFixed(0)}%). ${classification.reasoning}`,
    });
  }

  // Apply patches
  let appliedCount = 0;
  const appliedTargets: string[] = [];

  if (hasPatches) {
    const freshProspect = await getProspectByToken(token);
    if (!freshProspect) {
      return NextResponse.json({ error: "Prospect disappeared" }, { status: 500 });
    }
    const apply = await applyChangeRequestPatches({
      prospect: freshProspect,
      patches: classification.patches!,
    });
    if (!apply.ok) {
      const escalateFields = { coworkEscalatedAt: new Date().toISOString() };
      if (itemKind === "cr") {
        await patchChangeRequest(prospect.pageId, itemId, escalateFields).catch(() => {});
      } else {
        await patchReviewEdit(prospect.pageId, itemId, escalateFields).catch(() => {});
      }
      return NextResponse.json({
        success: true,
        outcome: "apply-failed",
        classification: classification.classification,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        patches: classification.patches,
        message: `Patches failed: ${apply.reason}`,
      });
    }
    appliedCount = apply.applied.length;
    appliedTargets.push(...apply.applied.map((p) => p.target));

    const patchAudit = apply.applied.map((p) => ({
      target: p.target,
      newValue: p.newValue,
      previousValue: p.previousValue,
    }));

    if (itemKind === "cr") {
      await patchChangeRequest(prospect.pageId, itemId, {
        coworkPatches: patchAudit,
        coworkPatchAppliedAt: new Date().toISOString(),
      });
    } else {
      await patchReviewEdit(prospect.pageId, itemId, {
        coworkPatches: patchAudit,
        coworkPatchAppliedAt: new Date().toISOString(),
      });
    }
  } else {
    // Rebuild-only
    if (itemKind === "cr") {
      await patchChangeRequest(prospect.pageId, itemId, {
        coworkPatches: [],
        coworkPatchAppliedAt: new Date().toISOString(),
      });
    } else {
      await patchReviewEdit(prospect.pageId, itemId, {
        coworkPatches: [],
        coworkPatchAppliedAt: new Date().toISOString(),
      });
    }
  }

  // Resolve + dispatch build
  const autoReply = appliedCount > 0
    ? `Done — updated ${appliedTargets.join(", ")}. Refresh your site shortly to see it live.`
    : "Done — your site is being rebuilt. Refresh shortly to see it live.";

  if (itemKind === "cr") {
    await patchChangeRequest(prospect.pageId, itemId, {
      status: "resolved" as const,
      reply: autoReply,
      resolvedAt: new Date().toISOString(),
    });
  } else {
    await patchReviewEdit(prospect.pageId, itemId, {
      status: "applied",
      resolvedAt: new Date().toISOString(),
    });
  }

  // Dispatch build
  let buildDispatched = false;
  let buildError: string | null = null;
  const env = getServerEnv();
  if (
    env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO &&
    prospect.workerName && prospect.cloudflareAccountId
  ) {
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
          ...(itemKind === "cr"
            ? { changeRequestId: itemId, trigger: "admin-cowork-retry" }
            : { reviewEditId: itemId, trigger: "admin-cowork-retry" }),
        },
      });
      buildDispatched = true;
    } catch (e) {
      buildError = e instanceof GithubApiError
        ? `${e.message} (HTTP ${e.status})`
        : e instanceof Error ? e.message : String(e);
    }
  }

  // Customer email
  let emailSent = false;
  if (itemKind === "cr") {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
      const customerDomain = ((prospect.onboardingData ?? {}) as {
        domain?: { domain?: string };
      }).domain?.domain;
      const siteUrl = customerDomain ? `https://${customerDomain}/` : "https://your-site.example/";
      await sendCustomerEmail(env, prospect.email, "change-request-resolved", {
        customerName: prospect.name.split(/\s+/)[0] || "there",
        originalMessage: message,
        reply: autoReply,
        siteUrl,
        accountUrl: `${baseUrl.replace(/\/$/, "")}/account/${token}`,
      });
      emailSent = true;
    } catch { /* best-effort */ }
  }

  // Admin FYI
  try {
    await notifyAdmin(env, {
      category: itemKind === "cr" ? "change-request" : "review-edit",
      subject: `Retry applied — ${prospect.name} (${appliedCount} patches)`,
      body:
        `Cowork retry (admin-triggered) succeeded for ${prospect.name}.\n\n` +
        `Customer's message:\n  "${message}"\n\n` +
        (appliedCount > 0
          ? `Applied: ${appliedTargets.join(", ")}\n`
          : "Rebuild-only.\n") +
        `Haiku: ${classification.classification} (${(classification.confidence * 100).toFixed(0)}%)\n` +
        `Build: ${buildDispatched ? "dispatched" : buildError ?? "skipped"}\n` +
        `Customer emailed: ${emailSent ? "yes" : "no"}\n\n` +
        adminFooter({ prospectName: prospect.name, prospectToken: token, anchor: `${itemKind === "cr" ? "cr" : "re"}-${itemId.slice(0, 8)}` }),
    });
  } catch { /* best-effort */ }

  return NextResponse.json({
    success: true,
    outcome: "applied",
    classification: classification.classification,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    appliedCount,
    appliedTargets,
    buildDispatched,
    buildError,
    emailSent,
    autoReply,
  });
}
