import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  patchChangeRequest,
  markPreviewBuildTriggered,
} from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { site } from "@/lib/site";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";
import { classifyChangeRequest } from "@/lib/haiku/classify-change-request";
import { applyChangeRequestPatches } from "@/lib/change-requests/apply-patch";
import { buildSiteSnapshot } from "@/lib/change-requests/site-snapshot";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  changeRequestId: z.string().min(1),
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

  const { token, changeRequestId } = parsed.data;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const cr = prospect.changeRequests.find((r) => r.id === changeRequestId);
  if (!cr) {
    return NextResponse.json(
      { error: "Change request not found" },
      { status: 404 },
    );
  }

  if (
    cr.status === "resolved" ||
    cr.status === "rejected" ||
    cr.status === "retracted"
  ) {
    return NextResponse.json(
      { error: `Cannot push through a ${cr.status} request — unlock it first` },
      { status: 400 },
    );
  }

  if (cr.coworkPatchAppliedAt) {
    return NextResponse.json(
      { error: "Patches already applied — just resolve it" },
      { status: 400 },
    );
  }

  const env = getServerEnv();

  let classification;
  try {
    classification = await classifyChangeRequest({
      message: cr.message,
      snapshot: buildSiteSnapshot(prospect),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Haiku classification failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    );
  }

  if (!classification) {
    return NextResponse.json(
      { error: "Classifier returned null (Haiku unreachable or malformed)" },
      { status: 502 },
    );
  }

  await patchChangeRequest(prospect.pageId, changeRequestId, {
    coworkClassification: classification.classification,
    coworkConfidence: classification.confidence,
    coworkReasoning: classification.reasoning,
  });

  const eligible =
    classification.classification === "in_scope" &&
    classification.confidence >= 0.75;
  const hasPatches =
    !!classification.patches && classification.patches.length > 0;
  const isRebuildOnly = eligible && !!classification.rebuildOnly;

  if (!eligible) {
    await patchChangeRequest(prospect.pageId, changeRequestId, {
      coworkEscalatedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      outcome: "escalated",
      classification: classification.classification,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      message: `Haiku classified as ${classification.classification} (${(classification.confidence * 100).toFixed(0)}% confidence) — needs manual handling`,
    });
  }

  if (!hasPatches && !isRebuildOnly) {
    await patchChangeRequest(prospect.pageId, changeRequestId, {
      coworkEscalatedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      outcome: "escalated",
      classification: classification.classification,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      message:
        "In-scope but no patches or rebuild signal — needs manual handling",
    });
  }

  let appliedCount = 0;
  const appliedTargets: string[] = [];
  const skippedPatches = classification.skippedPatches ?? [];

  if (hasPatches) {
    const apply = await applyChangeRequestPatches({
      prospect,
      patches: classification.patches!,
    });
    if (!apply.ok) {
      await patchChangeRequest(prospect.pageId, changeRequestId, {
        coworkEscalatedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        outcome: "apply-failed",
        classification: classification.classification,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        message: `Patches failed to apply: ${apply.reason}`,
      });
    }
    appliedCount = apply.applied.length;
    appliedTargets.push(...apply.applied.map((p) => p.target));

    await patchChangeRequest(prospect.pageId, changeRequestId, {
      coworkPatches: apply.applied.map((p) => ({
        target: p.target,
        newValue: p.newValue,
        previousValue: p.previousValue,
      })),
      coworkPatchAppliedAt: new Date().toISOString(),
    });
  } else {
    await patchChangeRequest(prospect.pageId, changeRequestId, {
      coworkPatches: [],
      coworkPatchAppliedAt: new Date().toISOString(),
    });
  }

  const customerDomain = (
    (prospect.onboardingData ?? {}) as {
      domain?: { domain?: string };
    }
  ).domain?.domain;
  const siteUrl = customerDomain
    ? `https://${customerDomain}/`
    : "https://your-site.example/";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;

  const autoReply =
    appliedCount > 0
      ? `Done — we've updated ${appliedTargets.join(", ")} on your site. Refresh to see it live.`
      : "Done — your site is being rebuilt with your latest uploads. Refresh shortly to see it live.";

  await patchChangeRequest(prospect.pageId, changeRequestId, {
    status: "resolved",
    reply: autoReply,
    resolvedAt: new Date().toISOString(),
  });

  let buildDispatched = false;
  let buildError: string | null = null;
  if (
    env.GITHUB_TOKEN &&
    env.GITHUB_OWNER &&
    env.GITHUB_REPO &&
    prospect.workerName &&
    prospect.cloudflareAccountId
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
          trigger: "admin-cowork-apply",
        },
      });
      buildDispatched = true;
      await markPreviewBuildTriggered(prospect.pageId).catch(() => {});
    } catch (e) {
      buildError =
        e instanceof GithubApiError
          ? `${e.message} (HTTP ${e.status})`
          : e instanceof Error
            ? e.message
            : String(e);
    }
  }

  let emailSent = false;
  let emailError: string | null = null;
  try {
    await sendCustomerEmail(env, prospect.email, "change-request-resolved", {
      customerName: firstName(prospect.name),
      originalMessage: cr.message,
      reply: autoReply,
      siteUrl,
      accountUrl: `${baseUrl.replace(/\/$/, "")}/account/${token}`,
    });
    emailSent = true;
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  try {
    const lines: string[] = [];
    lines.push("Action: PUSH THROUGH (admin-triggered classify + apply)");
    lines.push(`Change request: ${changeRequestId.slice(0, 8)}…`);
    lines.push(`Customer: ${prospect.name} <${prospect.email}>`);
    lines.push(`Original message:\n  "${cr.message}"`);
    lines.push(
      `\nHaiku: ${classification.classification} (${(classification.confidence * 100).toFixed(0)}%)`,
    );
    lines.push(`Reasoning: ${classification.reasoning}`);
    if (appliedCount > 0) {
      lines.push(`Applied ${appliedCount} patch(es): ${appliedTargets.join(", ")}`);
    }
    if (isRebuildOnly && !hasPatches) {
      lines.push("Rebuild-only (asset refresh, no text patches)");
    }
    if (skippedPatches.length > 0) {
      lines.push(
        `⚠ ${skippedPatches.length} patch(es) skipped: ${skippedPatches.map((s) => s.reason).join("; ")}`,
      );
    }
    lines.push(`Reply sent: "${autoReply}"`);
    lines.push(
      buildDispatched
        ? "Build: dispatched"
        : `Build: ${buildError ?? "skipped (missing config or worker)"}`,
    );
    lines.push(
      emailSent
        ? "Customer emailed (change-request-resolved)"
        : `Customer email FAILED: ${emailError}`,
    );
    lines.push("");
    lines.push(
      adminFooter({
        prospectName: prospect.name,
        prospectToken: token,
        anchor: `cr-${changeRequestId.slice(0, 8)}`,
      }),
    );
    await notifyAdmin(env, {
      subject: `Pushed through CR — ${prospect.name} (${appliedCount} patches applied)`,
      body: lines.join("\n"),
      category: "change-request",
    });
  } catch {
    // admin notify is best-effort
  }

  return NextResponse.json({
    success: true,
    outcome: "applied",
    classification: classification.classification,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    appliedCount,
    appliedTargets,
    skippedPatches: skippedPatches.length > 0 ? skippedPatches : undefined,
    rebuildOnly: isRebuildOnly && !hasPatches,
    buildDispatched,
    buildError,
    emailSent,
    emailError,
    autoReply,
  });
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}
