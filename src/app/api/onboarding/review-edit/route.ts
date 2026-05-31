// POST /api/onboarding/review-edit — Hub Step 5 revision submission.
//
// Strict cap: a customer may submit at most MAX_REVIEW_EDITS rounds
// of pre-launch revisions. The client-side UI also enforces this, but
// this route is the source of truth — it counts the existing edits
// in the prospect's Onboarding Data and rejects any submission that
// would push the count past the cap.
//
// Side effects on success:
//   - Append the new edit (status: "submitted") to data.review.edits
//   - Save back to Notion via mergeStepData + updateProspectOnboarding
//   - Email Ben so he can route into the build pipeline
//
// Out-of-scope detection is deferred to Stage 2C (Cowork's
// classifier). For Stage 2B MVP, every submission counts. Operator
// can mark a submitted edit `rejected` from /admin/[token] (later
// D2) without burning the customer's allowance.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import {
  isOnboardingMutable,
  isOnboardingUnlocked,
  MAX_REVIEW_EDITS,
  mergeStepData,
  onboardingDataSchema,
  type OnboardingData,
  type ReviewEdit,
} from "@/lib/onboarding";
import { effectiveMonthlyCap } from "@/lib/admin-grants";
import {
  buildReviewEditNotification,
  sendInternalNotification,
} from "@/lib/email";
import { site } from "@/lib/site";
import {
  looksLikeMultipleItems,
  MULTI_ITEM_DECLINE_MESSAGE,
} from "@/lib/multi-item-detector";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import { applyChangeRequestPatches } from "@/lib/change-requests/apply-patch";
import { classifyChangeRequest, SAFE_PATCH_TARGETS, type SafeTarget } from "@/lib/haiku/classify-change-request";
import { parseFormMessage } from "@/lib/change-requests/build-form-patches";
import { buildSiteSnapshot } from "@/lib/change-requests/site-snapshot";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const formPatchSchema = z.object({
  target: z.string().min(1),
  newValue: z.string(),
  serviceName: z.string().optional(),
  faqQuestion: z.string().optional(),
  testimonialName: z.string().optional(),
  locationName: z.string().optional(),
});

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE, "Missing or invalid token."),
  message: z
    .string()
    .trim()
    .min(5, "Tell me a bit more about what you'd like changed.")
    .max(2000, "Please split that into separate edits if it's a lot."),
  patches: z.array(formPatchSchema).optional(),
  rebuildOnly: z.boolean().optional(),
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
  const { token, message, patches: formPatches, rebuildOnly } = parsed.data;
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  if (!isOnboardingUnlocked(prospect.status)) {
    return NextResponse.json(
      { error: "Your onboarding link isn't active yet." },
      { status: 403 },
    );
  }
  if (!isOnboardingMutable(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Your onboarding is signed off — pre-launch revisions are closed. For any change requests, use the 'Need a change?' form on your account dashboard.",
      },
      { status: 403 },
    );
  }

  // Multi-item check — skipped for structured form submissions
  // (they have pre-computed patches). Free-text only.
  if (!formPatches && looksLikeMultipleItems(message)) {
    return NextResponse.json(
      {
        error: MULTI_ITEM_DECLINE_MESSAGE,
        suggestion: "split-into-separate-requests",
      },
      { status: 422 },
    );
  }

  // Validate structured patches if provided
  if (formPatches && formPatches.length > 0) {
    for (const p of formPatches) {
      if (!(SAFE_PATCH_TARGETS as readonly string[]).includes(p.target)) {
        return NextResponse.json(
          { error: `Invalid patch target: ${p.target}` },
          { status: 400 },
        );
      }
    }
  }

  // Read existing review slice + count current edits.
  const parsedData = onboardingDataSchema.safeParse(
    prospect.onboardingData ?? {},
  );
  const baseData: OnboardingData = parsedData.success ? parsedData.data : {};
  const reviewSlice = (baseData.review ?? {}) as {
    edits?: ReviewEdit[];
    [k: string]: unknown;
  };
  const existingEdits = Array.isArray(reviewSlice.edits)
    ? reviewSlice.edits
    : [];
  const activeEdits = existingEdits.filter((e) => e.status !== "rejected");
  const cap = effectiveMonthlyCap({
    prospect,
    defaultCap: MAX_REVIEW_EDITS,
    kind: "reviewEdits",
  });

  if (activeEdits.length >= cap) {
    return NextResponse.json(
      {
        error: `You've used all ${cap} pre-launch edits. Anything else needs to wait for the post-launch monthly allowance, or be quoted separately if it's bigger.`,
        remaining: 0,
      },
      { status: 400 },
    );
  }

  const hasStructuredPatches = formPatches && formPatches.length > 0;

  // ---- Structured path: auto-apply patches immediately ----
  let appliedPatches: Array<{ target: string; newValue: unknown; previousValue: unknown }> | null = null;
  if (hasStructuredPatches) {
    const typedPatches = formPatches!.map((p) => ({
      target: p.target as SafeTarget,
      newValue: p.newValue,
      serviceName: p.serviceName,
      faqQuestion: p.faqQuestion,
      testimonialName: p.testimonialName,
      locationName: p.locationName,
    }));
    const apply = await applyChangeRequestPatches({
      prospect,
      patches: typedPatches,
    });
    if (!apply.ok) {
      console.error(
        `[api/onboarding/review-edit] auto-apply failed for ${prospect.token.slice(0, 8)}: ${apply.reason}`,
      );
      return NextResponse.json(
        { error: `Couldn't apply that change: ${apply.reason}. Please try again.` },
        { status: 400 },
      );
    }
    appliedPatches = apply.applied.map((p) => ({
      target: p.target,
      newValue: p.newValue as unknown,
      previousValue: p.previousValue,
    }));
  }

  // ---- Inline classification for free-text (no structured patches) ----
  let inlineFreeTextResult: {
    applied: boolean;
    patches?: Array<{ target: string; newValue: unknown; previousValue: unknown }>;
    reasoning?: string;
    confidence?: number;
    rebuildOnly?: boolean;
  } | null = null;

  if (!hasStructuredPatches && !rebuildOnly) {
    // Layer 1: deterministic regex parse
    const deterministicPatches = parseFormMessage(message);
    if (deterministicPatches !== null && deterministicPatches.length > 0) {
      const apply = await applyChangeRequestPatches({
        prospect,
        patches: deterministicPatches.map((p) => ({
          target: p.target as SafeTarget,
          newValue: p.newValue,
          serviceName: p.serviceName,
          faqQuestion: p.faqQuestion,
          testimonialName: p.testimonialName,
          locationName: p.locationName,
        })),
      });
      if (apply.ok) {
        inlineFreeTextResult = {
          applied: true,
          patches: apply.applied.map((p) => ({
            target: p.target,
            newValue: p.newValue as unknown,
            previousValue: p.previousValue,
          })),
          reasoning: "Deterministic parse of form-formatted message.",
          confidence: 1.0,
        };
      }
    }

    // Layer 2: Haiku classification
    if (!inlineFreeTextResult) {
      try {
        const classification = await classifyChangeRequest({
          message,
          snapshot: buildSiteSnapshot(prospect),
        });
        if (classification) {
          const eligible =
            classification.classification === "in_scope" &&
            classification.confidence >= 0.75;
          const hasPatches = !!classification.patches && classification.patches.length > 0;
          const isRebuild = eligible && !!classification.rebuildOnly;

          if (eligible && (hasPatches || isRebuild)) {
            if (hasPatches) {
              const apply = await applyChangeRequestPatches({
                prospect,
                patches: classification.patches!,
              });
              if (apply.ok) {
                inlineFreeTextResult = {
                  applied: true,
                  patches: apply.applied.map((p) => ({
                    target: p.target,
                    newValue: p.newValue as unknown,
                    previousValue: p.previousValue,
                  })),
                  reasoning: classification.reasoning,
                  confidence: classification.confidence,
                };
              }
            } else {
              inlineFreeTextResult = {
                applied: true,
                patches: [],
                reasoning: classification.reasoning,
                confidence: classification.confidence,
                rebuildOnly: true,
              };
            }
          }
        }
      } catch (e) {
        console.warn(
          `[api/onboarding/review-edit] inline classify failed, falling back to cron: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  const isDirectApply = hasStructuredPatches || rebuildOnly || !!inlineFreeTextResult?.applied;

  // Merge applied patches from whichever path succeeded
  if (inlineFreeTextResult?.applied && inlineFreeTextResult.patches && inlineFreeTextResult.patches.length > 0) {
    appliedPatches = inlineFreeTextResult.patches;
  }

  const nowIso = new Date().toISOString();
  const newEdit: ReviewEdit = {
    id: crypto.randomUUID(),
    submittedAt: nowIso,
    message,
    status: isDirectApply ? "applied" : "submitted",
    ...(isDirectApply ? {
      coworkClassification: "in_scope" as const,
      coworkPatchAppliedAt: nowIso,
      ...(appliedPatches ? { coworkPatches: appliedPatches } : {}),
    } : {}),
  };

  // Re-read prospect data if patches were applied (data changed in Notion)
  let freshData = baseData;
  if (appliedPatches) {
    const freshProspect = await getProspectByToken(token).catch(() => null);
    if (freshProspect) {
      const fp = onboardingDataSchema.safeParse(freshProspect.onboardingData ?? {});
      if (fp.success) freshData = fp.data;
    }
  }

  const freshReviewSlice = (freshData.review ?? {}) as {
    edits?: ReviewEdit[];
    [k: string]: unknown;
  };
  const freshEdits = Array.isArray(freshReviewSlice.edits)
    ? freshReviewSlice.edits
    : existingEdits;

  const nextSlice = {
    ...freshReviewSlice,
    edits: [...freshEdits, newEdit],
  };
  const mergedData = mergeStepData(freshData, "review", nextSlice);

  try {
    await updateProspectOnboarding(prospect.pageId, { data: mergedData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding/review-edit] Notion update error:", msg);
    return NextResponse.json(
      { error: "Couldn't save just now. Please try again." },
      { status: 500 },
    );
  }

  const remaining = cap - (activeEdits.length + 1);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;

  // ---- Dispatch build for structured auto-apply ----
  let buildWarning: string | null = null;
  if (isDirectApply && prospect.workerName && prospect.cloudflareAccountId) {
    const env = getServerEnv();
    if (env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO) {
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
            reviewEditId: newEdit.id,
          },
        });
      } catch (e) {
        const msg =
          e instanceof GithubApiError
            ? `${e.message} (HTTP ${e.status})`
            : e instanceof Error
              ? e.message
              : String(e);
        buildWarning = msg;
        console.warn(
          `[api/onboarding/review-edit] auto-applied but build dispatch failed: ${msg}`,
        );
      }
    }
  }

  // Internal notification — fail-soft.
  if (isDirectApply) {
    try {
      const env = getServerEnv();
      await notifyAdmin(env, {
        category: "review-edit",
        subject: `Edit auto-applied (pre-commit) — ${prospect.name}`,
        body:
          `${prospect.name}${prospect.business ? ` (${prospect.business})` : ""} submitted a structured pre-launch edit. Auto-applied + build dispatched.\n\n` +
          (appliedPatches
            ? `Patches (${appliedPatches.length}):\n${appliedPatches.map((p) => `  - ${p.target} → "${p.newValue}"`).join("\n")}\n`
            : "Pure asset rebuild — no data patches.\n") +
          (buildWarning
            ? `\n⚠️  Build dispatch FAILED: ${buildWarning}\n`
            : `\nBuild should be live within ~2 minutes.\n`) +
          `\n` +
          adminFooter({
            prospectName: prospect.name,
            prospectToken: token,
            anchor: `re-${newEdit.id.slice(0, 8)}`,
          }),
      });
    } catch (e) {
      console.warn(
        `[api/onboarding/review-edit] admin FYI failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    const notif = buildReviewEditNotification({
      prospectName: prospect.name,
      business: prospect.business ?? "",
      editNumber: existingEdits.length + 1,
      remaining,
      message,
      notionUrl: prospect.notionUrl,
      adminDetailUrl: `${baseUrl}/admin/${token}`,
    });
    const emailErr = await sendInternalNotification(notif);
    if (emailErr) {
      console.warn(
        `[api/onboarding/review-edit] Notion saved but email failed: ${emailErr}`,
      );
    }
  }

  return NextResponse.json({
    success: true,
    edit: newEdit,
    remaining,
    autoApplied: isDirectApply,
    buildWarning,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
