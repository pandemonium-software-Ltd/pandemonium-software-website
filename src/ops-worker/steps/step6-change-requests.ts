// Step 6 — Change-request automation.
//
// Stage 2C C5.7 Phase B v2 — for each prospect's pending change
// request OR pre-commit Hub Step 5 review edit, classify with
// Haiku and either:
//   IN-SCOPE + safe target + confidence ≥ AUTO_APPLY_CONFIDENCE
//     → apply the patch to onboardingData (with previousValue
//       captured for revert)
//     → dispatch customer-site-build:
//         POST-COMMIT (live customer): mode=preview (uploads a
//           Cloudflare Worker version WITHOUT replacing live;
//           customer approves to promote)
//         PRE-COMMIT (Hub Step 5, customer hasn't gone live):
//           mode=live (replaces the customer's preview Worker
//           directly — there's nothing to protect; the whole
//           Step 5 IS the approval gate)
//   OTHERWISE (out_of_scope / ambiguous / classifier failure /
//             apply failure / dispatch failure)
//     → email Ben a richer escalation with the model's reasoning
//       (or just "couldn't classify, please look") + one-click
//       reply link
//     → stamp coworkEscalatedAt latch
//
// Trust + safety:
//   - Post-commit: customer is ALWAYS the gate before any change
//     goes live. Even high-confidence in-scope patches sit as
//     preview versions until the customer clicks Approve.
//   - Pre-commit: rebuild deploys directly to the customer's
//     preview Worker. No customer-approval gate because the
//     customer hasn't committed to the site yet — the whole
//     Step 5 review process IS the gate. Worst case Cowork
//     misclassifies, the customer sees the change in their
//     preview, asks Ben to revert (manual escape hatch).
//   - All applies stamp coworkPatch.previousValue so the reject
//     handler can roll back the data layer before re-opening the
//     request.
//   - Daily per-customer cap (MAX_CLASSIFICATIONS_PER_DAY) blocks
//     a single customer from generating runaway API costs.
//   - SAFE_PATCH_TARGETS is the defensive whitelist; the classifier
//     prompt restricts to it AND the applier rejects any target
//     outside it.

import type { Step } from "../types";
import {
  markChangeRequestEscalated,
  patchChangeRequest,
  patchReviewEdit,
  type ChangeRequest,
  type ProspectRecord,
} from "../../lib/notion-prospects";
import {
  sendInternalNotification,
  type NotificationPayload,
} from "../../lib/email";
import {
  classifyChangeRequest,
  type SafeTarget,
} from "../../lib/haiku/classify-change-request";
import { applyChangeRequestPatch } from "../../lib/change-requests/apply-patch";
import { dispatchRepositoryEvent, GithubApiError } from "../../lib/github";

/** Auto-apply confidence threshold. Below this we escalate to
 *  Ben even if the model said in-scope. The customer-approval
 *  gate (post-commit) and Step 5 review process (pre-commit)
 *  provide a second safety net so we can be moderately
 *  aggressive here; tune up if false-positives become a problem. */
const AUTO_APPLY_CONFIDENCE = 0.75;

/** Min age before we even classify a request. Gives the customer
 *  ~5 minutes to retract a hasty submission before Cowork starts
 *  paying for an API call to classify it. */
const MIN_AGE_BEFORE_CLASSIFY_MS = 5 * 60 * 1000;

/** Per-customer daily classification cap. At max 5/day, worst-
 *  case spend is 5 × £0.001 (Haiku) per customer = £0.005/day. */
const MAX_CLASSIFICATIONS_PER_DAY = 5;

/** Cap escalations per cron tick to prevent inbox flooding. */
const MAX_ESCALATIONS_PER_TICK = 5;

/** Discriminated union — step6 handles both kinds uniformly. */
type Actionable =
  | { kind: "post-commit"; request: ChangeRequest }
  | { kind: "pre-commit"; edit: ReviewEditWithCowork };

/** Local view of a Hub Step 5 review edit with the cowork audit
 *  fields pulled out. The schema in src/lib/onboarding.ts is the
 *  truth; this is just for type ergonomics here. */
type ReviewEditWithCowork = {
  id: string;
  submittedAt: string;
  message: string;
  status: "submitted" | "applied" | "rejected";
  coworkClassification?: "in_scope" | "out_of_scope" | "ambiguous";
  coworkEscalatedAt?: string;
  coworkPatchAppliedAt?: string;
};

export const step6ChangeRequests: Step = {
  id: "step6",
  shouldRun(prospect) {
    const actionable = findActionable(prospect);
    if (
      prospect.changeRequests.length > 0 ||
      readReviewEdits(prospect).length > 0
    ) {
      const crBreakdown = prospect.changeRequests
        .map((c) => formatBreakdown(c, "post"))
        .join(", ");
      const reBreakdown = readReviewEdits(prospect)
        .map((e) => formatBreakdown(e, "pre"))
        .join(", ");
      console.log(
        `[step6:${prospect.token.slice(0, 8)}] post-commit=${prospect.changeRequests.length} pre-commit=${readReviewEdits(prospect).length} actionable=${actionable.length} | post:[${crBreakdown}] pre:[${reBreakdown}]`,
      );
    }
    return actionable.length > 0;
  },
  async run(prospect, env) {
    const actionable = findActionable(prospect).slice(
      0,
      MAX_ESCALATIONS_PER_TICK,
    );
    if (actionable.length === 0) {
      return { status: "skip", reason: "No actionable items" };
    }

    // Per-customer daily classification cap counts BOTH kinds so a
    // burst of pre-commit edits + a post-commit request doesn't
    // double-charge.
    const recentClassified = countRecentClassifications(prospect);
    let remainingBudget = Math.max(
      0,
      MAX_CLASSIFICATIONS_PER_DAY - recentClassified,
    );

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://modu-forge.co.uk";

    const summary: string[] = [];
    const failures: string[] = [];

    for (const item of actionable) {
      const itemId =
        item.kind === "post-commit" ? item.request.id : item.edit.id;
      const itemMessage =
        item.kind === "post-commit" ? item.request.message : item.edit.message;
      const itemSubmitted =
        item.kind === "post-commit"
          ? item.request.submittedAt
          : item.edit.submittedAt;
      const tag = `${item.kind === "post-commit" ? "cr" : "re"}=${itemId.slice(0, 8)}`;

      if (remainingBudget <= 0) {
        await escalateOnly({
          prospect,
          item,
          baseUrl,
          reasonForBen:
            "Daily classification cap reached for this customer; please review.",
        }).catch((e) => failures.push(`${tag} cap-escalate failed: ${e}`));
        summary.push(`${tag} cap-escalated`);
        continue;
      }

      const classification = await classifyChangeRequest({
        message: itemMessage,
        snapshot: buildSiteSnapshot(prospect),
      });
      remainingBudget -= 1;

      // Audit-stamp on the right entry (post-commit OR pre-commit).
      await stampClassification({
        prospect,
        item,
        classification,
      }).catch(() => {
        /* best-effort */
      });

      const isHighConfidenceInScopePatch =
        classification &&
        classification.classification === "in_scope" &&
        classification.confidence >= AUTO_APPLY_CONFIDENCE &&
        classification.patch;

      if (!isHighConfidenceInScopePatch) {
        const reason = classification
          ? `Cowork classified as ${classification.classification} (confidence ${classification.confidence.toFixed(2)}): ${classification.reasoning}` +
            (classification.patch
              ? `\nSuggested patch (NOT applied — confidence below ${AUTO_APPLY_CONFIDENCE} threshold):\n  Target: ${classification.patch.target}\n  New value: ${classification.patch.newValue}`
              : "")
          : "Cowork couldn't classify — please reply manually.";
        await escalateOnly({
          prospect,
          item,
          baseUrl,
          reasonForBen: reason,
        }).catch((e) => failures.push(`${tag} escalate failed: ${e}`));
        summary.push(
          `${tag} escalated (${classification?.classification ?? "no-classify"})`,
        );
        continue;
      }

      // High-confidence in-scope branch.
      const result = await tryAutoApply({
        prospect,
        item,
        target: classification.patch!.target,
        newValue: classification.patch!.newValue,
        env,
        reasoning: classification.reasoning,
      });
      if (result.kind === "ok") {
        summary.push(
          `${tag} auto-applied (${classification.patch!.target})`,
        );
      } else {
        failures.push(`${tag} ${result.reason}`);
        await escalateOnly({
          prospect,
          item,
          baseUrl,
          reasonForBen: `Cowork tried to auto-apply but failed: ${result.reason}. Please review + decide manually.`,
        }).catch(() => {
          /* nothing more we can do */
        });
        summary.push(`${tag} escalated (apply-failed)`);
      }
      // Suppress unused-var warning on itemSubmitted (kept for
      // future use if we add age-based summary lines).
      void itemSubmitted;
    }

    if (summary.length === 0 && failures.length > 0) {
      throw new Error(
        `All step6 actions failed: ${failures.join("; ")}`,
      );
    }
    return { status: "ok", notes: summary.join("; ") };
  },
};

// ---------- Auto-apply branch (per kind) ----------

type AutoApplyResult = { kind: "ok" } | { kind: "fail"; reason: string };

async function tryAutoApply(args: {
  prospect: ProspectRecord;
  item: Actionable;
  target: SafeTarget;
  newValue: string;
  env: Parameters<Step["run"]>[1];
  reasoning: string;
}): Promise<AutoApplyResult> {
  const apply = await applyChangeRequestPatch({
    prospect: args.prospect,
    target: args.target,
    newValue: args.newValue,
  });
  if (!apply.ok) {
    return { kind: "fail", reason: `apply failed: ${apply.reason}` };
  }

  const patchPayload = {
    target: args.target,
    newValue: args.newValue as unknown,
    previousValue: apply.previousValue,
  };

  // Generate per-build preview-access token (set as
  // PREVIEW_ACCESS_TOKEN var on the customer-site Worker version,
  // checked by its middleware to gate access). Generated for both
  // kinds even though pre-commit builds technically replace the
  // live Worker — keeping the architecture symmetric makes it
  // easy to add gate-on-pre-commit later if we ever want to.
  const previewAccessToken = randomHex(32);

  if (args.item.kind === "post-commit") {
    // Generate per-request approval token; customer's email link
    // requires it before promoting.
    const approvalToken = randomHex(32);
    await patchChangeRequest(args.prospect.pageId, args.item.request.id, {
      status: "in-progress",
      coworkPatch: patchPayload,
      coworkPatchAppliedAt: new Date().toISOString(),
      customerApprovalToken: approvalToken,
      previewAccessToken,
    });
  } else {
    // Pre-commit: no approval token; the rebuild updates the
    // preview Worker directly.
    await patchReviewEdit(args.prospect.pageId, args.item.edit.id, {
      status: "applied",
      coworkPatch: patchPayload,
      coworkPatchAppliedAt: new Date().toISOString(),
    });
  }

  // Dispatch the build. Mode differs by kind.
  if (
    !args.env.GITHUB_TOKEN ||
    !args.env.GITHUB_OWNER ||
    !args.env.GITHUB_REPO
  ) {
    return {
      kind: "fail",
      reason:
        "GitHub creds not configured — patch applied but no build dispatched",
    };
  }
  if (!args.prospect.workerName || !args.prospect.cloudflareAccountId) {
    return {
      kind: "fail",
      reason:
        "Customer has no per-customer Worker yet — build dispatch skipped",
    };
  }
  const mode = args.item.kind === "post-commit" ? "preview" : "live";
  const itemIdField =
    args.item.kind === "post-commit"
      ? { changeRequestId: args.item.request.id }
      : {
          // Pre-commit edits don't have a separate post-commit
          // changeRequestId, but we thread the edit id through
          // for the callback's audit log.
          reviewEditId: args.item.edit.id,
        };
  try {
    await dispatchRepositoryEvent({
      token: args.env.GITHUB_TOKEN,
      owner: args.env.GITHUB_OWNER,
      repo: args.env.GITHUB_REPO,
      eventType: "customer-site-build",
      clientPayload: {
        token: args.prospect.token,
        prospectName: args.prospect.name,
        businessName: args.prospect.business ?? "",
        mode,
        // Threaded through to wrangler versions upload --var so the
        // customer-site middleware accepts the iframe embed. Only
        // meaningful in preview mode but harmless on live.
        previewAccessToken,
        ...itemIdField,
      },
    });
  } catch (e) {
    const msg =
      e instanceof GithubApiError
        ? `${e.message} (HTTP ${e.status})`
        : e instanceof Error
          ? e.message
          : String(e);
    // Loud log to wrangler tail — repository_dispatch failures are
    // typically a token-scope problem, and silent failures here lead
    // to applied-but-not-built rows in the inbox + confusing UX.
    console.error(
      `[step6:${args.prospect.token.slice(0, 8)}] dispatchRepositoryEvent FAILED: ${msg}. ` +
        `Token scope check: classic PAT needs 'repo'; fine-grained needs 'Actions: write' + 'Contents: read'. ` +
        `Owner=${args.env.GITHUB_OWNER} Repo=${args.env.GITHUB_REPO}`,
    );
    return { kind: "fail", reason: `dispatch failed: ${msg}` };
  }
  return { kind: "ok" };
}

async function escalateOnly(args: {
  prospect: ProspectRecord;
  item: Actionable;
  baseUrl: string;
  reasonForBen: string;
}): Promise<void> {
  const { prospect, item, baseUrl, reasonForBen } = args;
  const submittedAt =
    item.kind === "post-commit"
      ? item.request.submittedAt
      : item.edit.submittedAt;
  const message =
    item.kind === "post-commit" ? item.request.message : item.edit.message;
  const itemId =
    item.kind === "post-commit" ? item.request.id : item.edit.id;
  const ageH = Math.floor(
    (Date.now() - Date.parse(submittedAt)) / (60 * 60 * 1000),
  );
  const adminDeepLink = `${baseUrl}/admin/${prospect.token}#${item.kind === "post-commit" ? "cr" : "re"}-${itemId}`;
  const tagLabel =
    item.kind === "post-commit"
      ? "[CHANGE REQUEST · needs you]"
      : "[STEP 5 REVIEW EDIT · needs you]";
  const notif: NotificationPayload = {
    subject: `${tagLabel} ${prospect.name}${prospect.business ? ` (${prospect.business})` : ""} · ${ageH}h old`,
    body:
      `${item.kind === "post-commit" ? "A change request" : "A pre-launch review edit"} from ${prospect.name}${prospect.business ? ` at ${prospect.business}` : ""} needs your eye.\n\n` +
      `--- Their request ---\n${message}\n--- End ---\n\n` +
      `Cowork's take:\n${reasonForBen}\n\n` +
      `Reply with one click:\n${adminDeepLink}\n\n` +
      `— Cowork`,
  };
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    throw new Error(`email failed: ${emailErr}`);
  }
  if (item.kind === "post-commit") {
    await markChangeRequestEscalated(prospect.pageId, itemId);
  } else {
    await patchReviewEdit(prospect.pageId, itemId, {
      coworkEscalatedAt: new Date().toISOString(),
    });
  }
}

async function stampClassification(args: {
  prospect: ProspectRecord;
  item: Actionable;
  classification: Awaited<ReturnType<typeof classifyChangeRequest>>;
}): Promise<void> {
  const fields = {
    coworkClassification:
      args.classification?.classification ?? "ambiguous",
    coworkConfidence: args.classification?.confidence ?? 0,
    coworkReasoning:
      args.classification?.reasoning ??
      "Cowork couldn't classify (model unavailable or returned malformed JSON).",
  };
  if (args.item.kind === "post-commit") {
    await patchChangeRequest(
      args.prospect.pageId,
      args.item.request.id,
      fields,
    );
  } else {
    await patchReviewEdit(args.prospect.pageId, args.item.edit.id, fields);
  }
}

// ---------- Predicates + builders ----------

/** Combined actionable list across post-commit + pre-commit kinds.
 *  Sorted oldest-first so Ben sees the most-overdue at the top of
 *  any batched escalation summary. */
function findActionable(prospect: ProspectRecord): Actionable[] {
  const now = Date.now();
  const post: Actionable[] = prospect.changeRequests
    .filter((cr) => {
      if (cr.status !== "pending" && cr.status !== "in-progress") return false;
      if (cr.coworkClassification && cr.coworkEscalatedAt) return false;
      if (cr.coworkPatchAppliedAt && cr.previewVersionId) return false;
      const submitted = Date.parse(cr.submittedAt);
      if (!Number.isFinite(submitted)) return false;
      if (now - submitted < MIN_AGE_BEFORE_CLASSIFY_MS) return false;
      return true;
    })
    .map((cr): Actionable => ({ kind: "post-commit", request: cr }));

  const pre: Actionable[] = readReviewEdits(prospect)
    .filter((re) => {
      // Pre-commit edits are "submitted" until applied or rejected.
      // We process anything still "submitted" that's not been
      // classified+escalated yet AND not already applied.
      if (re.status !== "submitted") return false;
      if (re.coworkClassification && re.coworkEscalatedAt) return false;
      if (re.coworkPatchAppliedAt) return false;
      const submitted = Date.parse(re.submittedAt);
      if (!Number.isFinite(submitted)) return false;
      if (now - submitted < MIN_AGE_BEFORE_CLASSIFY_MS) return false;
      return true;
    })
    .map((re): Actionable => ({ kind: "pre-commit", edit: re }));

  return [...post, ...pre].sort((a, b) => {
    const aSub = Date.parse(
      a.kind === "post-commit" ? a.request.submittedAt : a.edit.submittedAt,
    );
    const bSub = Date.parse(
      b.kind === "post-commit" ? b.request.submittedAt : b.edit.submittedAt,
    );
    return aSub - bSub;
  });
}

/** Read the Hub Step 5 review edits as ReviewEditWithCowork[].
 *  Defensive on every read — onboardingData may be malformed. */
function readReviewEdits(prospect: ProspectRecord): ReviewEditWithCowork[] {
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const review = (ob.review ?? {}) as Record<string, unknown>;
  const edits = Array.isArray(review.edits) ? review.edits : [];
  return edits
    .filter(
      (e): e is Record<string, unknown> =>
        !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string",
    )
    .map((e) => e as unknown as ReviewEditWithCowork);
}

/** Combined daily classification count across both kinds. */
function countRecentClassifications(prospect: ProspectRecord): number {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const post = prospect.changeRequests.filter(
    (cr) =>
      cr.coworkClassification &&
      cr.coworkEscalatedAt &&
      Date.parse(cr.coworkEscalatedAt) > cutoff,
  ).length;
  const pre = readReviewEdits(prospect).filter(
    (re) =>
      re.coworkClassification &&
      re.coworkEscalatedAt &&
      Date.parse(re.coworkEscalatedAt) > cutoff,
  ).length;
  return post + pre;
}

function formatBreakdown(
  item: { id: string; status: string; submittedAt: string } & {
    coworkClassification?: string;
    coworkEscalatedAt?: string;
    coworkPatchAppliedAt?: string;
    previewVersionId?: string;
  },
  prefix: "pre" | "post",
): string {
  const ageMin = Math.floor(
    (Date.now() - Date.parse(item.submittedAt)) / 60_000,
  );
  return `${prefix}:${item.id.slice(0, 8)}[${item.status},${ageMin}min,classified=${!!item.coworkClassification},escalated=${!!item.coworkEscalatedAt},applied=${!!item.coworkPatchAppliedAt}${"previewVersionId" in item ? `,preview=${!!item.previewVersionId}` : ""}]`;
}

/** Build the SiteSnapshot the classifier reads. Pulled from the
 *  same place the adapter reads — content step preferred, prospect
 *  record fallback. */
function buildSiteSnapshot(prospect: ProspectRecord): {
  business: {
    name: string;
    type: string;
    location: string;
    contactName?: string;
    phoneDisplay?: string;
    publicEmail?: string;
    address?: string;
    serviceArea?: string;
  };
  copy: { tagline?: string; aboutBlurb?: string };
} {
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const business = (content.business ?? {}) as Record<string, unknown>;
  return {
    business: {
      name: prospect.business ?? "",
      type: prospect.businessType ?? "",
      location: prospect.location ?? "",
      contactName: optionalString(business.contactName),
      phoneDisplay: optionalString(business.phoneDisplay) ?? prospect.phone,
      publicEmail: optionalString(business.publicEmail) ?? prospect.email,
      address: optionalString(business.address),
      serviceArea: optionalString(business.serviceArea),
    },
    copy: {
      tagline: optionalString(content.tagline),
      aboutBlurb: optionalString(content.aboutBlurb),
    },
  };
}

function optionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function randomHex(chars: number): string {
  const arr = new Uint8Array(Math.ceil(chars / 2));
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < arr.length; i++) {
    s += arr[i]!.toString(16).padStart(2, "0");
  }
  return s.slice(0, chars);
}
