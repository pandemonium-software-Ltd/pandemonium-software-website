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
  readCoworkPatches,
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

  // INLINE CLASSIFY + APPLY: when the operator hits Approve before
  // the cron has had a chance to process the edit (cron has a 5-min
  // wait so customers can retract), we'd otherwise dispatch a build
  // against unchanged Notion data. Run the classifier inline so the
  // operator's "Approve & deploy" actually deploys the change, not
  // just an empty build.
  //
  // Skipped when the edit already has Cowork audit data (cron got
  // there first) or when the edit isn't approve (no point classifying
  // a reject). Confidence threshold mirrors step6's auto-apply gate
  // — below it, we still flip status (operator's decision is final)
  // but warn that nothing was applied.
  const editAny = edit as Record<string, unknown>;
  const existingPatches = readCoworkPatches(
    editAny as { coworkPatches?: unknown; coworkPatch?: unknown },
  );
  const alreadyClassified = !!editAny.coworkClassification;
  const inlineClassifySkipped =
    action !== "approve" || alreadyClassified || existingPatches.length > 0;

  let inlineApply: {
    attempted: boolean;
    appliedPatches?: Array<{ target: string; newValue: unknown }>;
    classification?: "in_scope" | "out_of_scope" | "ambiguous";
    confidence?: number;
    reasoning?: string;
    skippedReason?: string;
  } = { attempted: false };

  if (!inlineClassifySkipped) {
    try {
      const classification = await classifyChangeRequest({
        message: edit.message,
        snapshot: buildSiteSnapshot(prospect),
      });
      if (!classification) {
        inlineApply = {
          attempted: true,
          skippedReason:
            "Classifier returned null (Haiku unreachable / malformed JSON). Approving without auto-apply — apply manually in Notion.",
        };
      } else {
        // Stamp classification regardless so the audit trail is
        // populated even if we don't auto-apply.
        await patchReviewEdit(prospect.pageId, editId, {
          coworkClassification: classification.classification,
          coworkConfidence: classification.confidence,
          coworkReasoning: classification.reasoning,
        }).catch(() => {});

        const baseEligible =
          classification.classification === "in_scope" &&
          classification.confidence >= 0.75;
        const hasPatches =
          !!classification.patches && classification.patches.length > 0;
        const isRebuildOnly =
          baseEligible && !!classification.rebuildOnly;
        // patches + rebuildOnly are ADDITIVE — a multi-intent
        // request can have both (text change AND asset refresh).
        // Eligible if EITHER signal is present + classification is
        // in-scope above the confidence threshold.
        const eligible = baseEligible && (hasPatches || isRebuildOnly);
        if (!eligible) {
          inlineApply = {
            attempted: true,
            classification: classification.classification,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            skippedReason: hasPatches
              ? `Confidence ${classification.confidence.toFixed(2)} below 0.75 — patches NOT applied. Apply manually in Notion if you want them deployed.`
              : `Cowork couldn't propose patches (${classification.classification}). ${classification.reasoning}`,
          };
        } else if (hasPatches) {
          // Has patches (possibly also rebuildOnly) — run the applier.
          // The build dispatches further down regardless, so the
          // rebuildOnly side of multi-intent requests gets honoured
          // as a side effect of dispatching a fresh build.
          const apply = await applyChangeRequestPatches({
            prospect,
            patches: classification.patches!,
          });
          if (!apply.ok) {
            inlineApply = {
              attempted: true,
              classification: classification.classification,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              skippedReason: `Apply failed: ${apply.reason}. Approve still went through but Notion is unchanged.`,
            };
          } else {
            // Persist patches on the edit so reject can revert + UI
            // can display them. Status flip below stamps appliedAt.
            await patchReviewEdit(prospect.pageId, editId, {
              coworkPatches: apply.applied.map((p) => ({
                target: p.target,
                newValue: p.newValue as unknown,
                previousValue: p.previousValue,
              })),
              coworkPatch: undefined,
              coworkPatchAppliedAt: new Date().toISOString(),
            }).catch(() => {});
            inlineApply = {
              attempted: true,
              classification: classification.classification,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              appliedPatches: apply.applied.map((p) => ({
                target: p.target,
                newValue: p.newValue,
              })),
            };
          }
        } else {
          // rebuildOnly ONLY (no patches). Stamp audit + fall through
          // to build dispatch.
          await patchReviewEdit(prospect.pageId, editId, {
            coworkPatches: [],
            coworkPatch: undefined,
            coworkPatchAppliedAt: new Date().toISOString(),
          }).catch(() => {});
          inlineApply = {
            attempted: true,
            classification: classification.classification,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            // Empty appliedPatches but a non-null inlineApply so the
            // UI knows the classifier DID run (vs the "skipped /
            // already classified" branch).
            appliedPatches: [],
          };
        }
      }
    } catch (e) {
      console.warn(
        `[api/admin/review-edit] inline classify+apply error: ${e instanceof Error ? e.message : String(e)}`,
      );
      inlineApply = {
        attempted: true,
        skippedReason: `Inline classify failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Update Notion — same fail-soft pattern as the change-
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

  // Always notify admin of the action — even ones the operator
  // themselves performed. Provides a paper trail in the inbox so
  // multi-device / multi-tab usage doesn't lose context, and
  // confirms downstream side effects (build dispatched, customer
  // emailed) without having to refresh /admin.
  try {
    const subject =
      action === "approve"
        ? `Approved Lucas-style edit — build ${buildStatus?.dispatched ? "dispatched" : "SKIPPED"}`
        : `Rejected pre-commit edit`;
    const lines: string[] = [];
    lines.push(`Action: ${action.toUpperCase()}`);
    lines.push(`Edit: ${editId.slice(0, 8)}…`);
    lines.push(`Customer: ${prospect.name} <${prospect.email}>`);
    lines.push(`Original message:\n  "${edit.message}"`);
    if (reply) lines.push(`Your reply:\n  "${reply}"`);
    if (action === "approve") {
      if (buildStatus?.dispatched) {
        lines.push(
          `Build: dispatched. Customer will get the "review-edit-applied" email when the build callback fires.`,
        );
      } else if (buildStatus && !buildStatus.dispatched) {
        lines.push(`Build SKIPPED: ${buildStatus.reason}`);
      }
      // Surface what the inline classifier did (or didn't) do —
      // operator picked up "Approve & deploy" before knowing what
      // would happen, so always tell them in the email.
      if (inlineApply.attempted) {
        if (inlineApply.appliedPatches?.length) {
          const patchLines = inlineApply.appliedPatches
            .map((p) => `  - ${p.target} → "${String(p.newValue)}"`)
            .join("\n");
          lines.push(
            `\nCowork ran inline (operator approved before cron got there) and applied ${inlineApply.appliedPatches.length} patch${inlineApply.appliedPatches.length === 1 ? "" : "es"}:\n${patchLines}\nReasoning: ${inlineApply.reasoning ?? "(none)"}`,
          );
        } else if (
          inlineApply.appliedPatches &&
          inlineApply.appliedPatches.length === 0 &&
          !inlineApply.skippedReason
        ) {
          // Rebuild-only outcome — Cowork ran successfully but
          // had no patches to apply (asset refresh). Make sure the
          // operator sees this is a deliberate success, not a
          // no-op confusion.
          lines.push(
            `\nCowork ran inline and classified this as a rebuild-only request (customer re-uploaded an asset via Hub Step 4). No patches to apply — the build will ship whatever's currently in their data.\nReasoning: ${inlineApply.reasoning ?? "(none)"}`,
          );
        } else if (inlineApply.skippedReason) {
          lines.push(
            `\n⚠️  Inline classify ran but didn't apply: ${inlineApply.skippedReason}`,
          );
          if (inlineApply.classification) {
            lines.push(
              `Cowork said: ${inlineApply.classification} (confidence ${(inlineApply.confidence ?? 0).toFixed(2)}) — "${inlineApply.reasoning ?? ""}"`,
            );
          }
          lines.push(
            `→ The build was still dispatched. Apply the change manually in Notion or it won't appear on the live site.`,
          );
        }
      } else {
        // Cowork already classified before approve (typical cron
        // path) — patches stamped at apply time. Just confirm.
        const classifiedPatches = readCoworkPatches(
          edit as { coworkPatches?: unknown; coworkPatch?: unknown },
        );
        if (classifiedPatches.length > 0) {
          lines.push(
            `\nCowork had already applied ${classifiedPatches.length} patch${classifiedPatches.length === 1 ? "" : "es"} via cron before you approved.`,
          );
        } else {
          lines.push(
            `\n⚠️  No patches were applied by Cowork (vague / mixed scope / unsupported targets) and the inline classifier was skipped (already classified). Apply manually in Notion if needed.`,
          );
        }
      }
    } else {
      // Reject
      lines.push(
        emailWarning
          ? `Customer email FAILED: ${emailWarning}`
          : `Customer emailed (change-request-rejected template).`,
      );
    }
    lines.push("");
    lines.push(adminFooter({
      prospectName: prospect.name,
      prospectToken: token,
      anchor: `re-${editId.slice(0, 8)}`,
    }));
    await notifyAdmin(env, {
      subject,
      body: lines.join("\n"),
      category: "review-edit",
    });
  } catch (e) {
    console.warn(
      `[api/admin/review-edit] admin notify failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({
    success: true,
    action,
    build: buildStatus,
    customerNotified: action === "reject" ? !emailWarning : null,
    emailWarning,
    // Surface what the inline classifier did (if it ran) so the
    // admin UI can show the operator a tangible "applied X, Y, Z"
    // confirmation rather than just "Approved." which was hiding
    // whether anything actually changed.
    inlineApply: inlineApply.attempted
      ? {
          appliedPatchCount: inlineApply.appliedPatches?.length ?? 0,
          appliedTargets:
            inlineApply.appliedPatches?.map((p) => p.target) ?? [],
          classification: inlineApply.classification,
          confidence: inlineApply.confidence,
          skippedReason: inlineApply.skippedReason,
        }
      : null,
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
