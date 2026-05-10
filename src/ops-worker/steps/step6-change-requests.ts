// Step 6 — Change-request automation.
//
// Stage 2C C5.7 Phase B v2 — for each prospect's pending change
// request, classify with Haiku and either:
//   IN-SCOPE + safe target + confidence ≥ AUTO_APPLY_CONFIDENCE
//     → apply the patch to onboardingData (with previousValue
//       captured for revert)
//     → dispatch customer-site-build with mode=preview (uploads
//       a Cloudflare Worker version WITHOUT replacing live)
//     → callback emails the customer the preview URL +
//       approve/reject CTAs
//   OTHERWISE (out_of_scope / ambiguous / classifier failure /
//             apply failure / dispatch failure)
//     → email Ben a richer escalation with the model's reasoning
//       (or just "couldn't classify, please look") + one-click
//       reply link
//     → stamp coworkEscalatedAt latch
//
// Trust + safety:
//   - Customer is ALWAYS the gate before any change goes live.
//     Even high-confidence in-scope patches sit as preview
//     versions until the customer clicks Approve. So a Haiku
//     misclassification ends in an unwanted preview the customer
//     rejects, NOT a broken live site.
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
 *  gate provides a second safety net so we can be moderately
 *  aggressive here; tune up if false-positives become a problem. */
const AUTO_APPLY_CONFIDENCE = 0.75;

/** Min age before we even classify a request. Gives the customer
 *  ~5 minutes to retract a hasty submission before Cowork starts
 *  paying for an API call to classify it. */
const MIN_AGE_BEFORE_CLASSIFY_MS = 5 * 60 * 1000;

/** Per-customer daily classification cap. At max 5/day, worst-
 *  case spend is 5 × £0.001 (Haiku) per customer = £0.005/day —
 *  comfortably under the GBP-monthly £2 if we ever bundle this
 *  with the GBP module's pricing. */
const MAX_CLASSIFICATIONS_PER_DAY = 5;

/** Cap escalations per cron tick to prevent inbox flooding. Same
 *  rationale as Phase B v1 — if there are 10+ open requests on
 *  one tick, that's a "Ben needs a focused session" signal. */
const MAX_ESCALATIONS_PER_TICK = 5;

export const step6ChangeRequests: Step = {
  id: "step6",
  shouldRun(prospect) {
    return findActionable(prospect).length > 0;
  },
  async run(prospect, env) {
    const actionable = findActionable(prospect).slice(
      0,
      MAX_ESCALATIONS_PER_TICK,
    );
    if (actionable.length === 0) {
      return { status: "skip", reason: "No actionable requests" };
    }

    // Per-customer daily classification cap. Counts requests
    // already classified in the last 24h regardless of outcome.
    const recentClassified = prospect.changeRequests.filter(
      (cr) =>
        cr.coworkClassification &&
        cr.coworkEscalatedAt &&
        Date.now() - Date.parse(cr.coworkEscalatedAt) <
          24 * 60 * 60 * 1000,
    ).length;
    let remainingBudget = Math.max(
      0,
      MAX_CLASSIFICATIONS_PER_DAY - recentClassified,
    );

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://modu-forge.co.uk";

    const summary: string[] = [];
    const failures: string[] = [];

    for (const cr of actionable) {
      if (remainingBudget <= 0) {
        // Soft-escalate the rest as "over daily cap" so Ben sees
        // there's a backlog. Stamp escalation so we don't re-email
        // tomorrow either.
        await escalateOnly(prospect, cr, baseUrl, "Daily classification cap reached for this customer; please review.").catch((e) => failures.push(`cr=${cr.id.slice(0, 8)} cap-escalate failed: ${e}`));
        summary.push(`cr=${cr.id.slice(0, 8)} cap-escalated`);
        continue;
      }

      const classification = await classifyChangeRequest({
        message: cr.message,
        snapshot: buildSiteSnapshot(prospect),
      });
      remainingBudget -= 1;

      // Stamp classification regardless of outcome — gives the audit
      // trail + lets the admin UI show "Cowork thought: out_of_scope
      // (0.85): ..." per request.
      await patchChangeRequest(prospect.pageId, cr.id, {
        coworkClassification: classification?.classification ?? "ambiguous",
        coworkConfidence: classification?.confidence ?? 0,
        coworkReasoning:
          classification?.reasoning ??
          "Cowork couldn't classify (model unavailable or returned malformed JSON).",
      }).catch(() => {
        // Stamping is best-effort; main flow continues
      });

      // Decide branch.
      const isHighConfidenceInScopePatch =
        classification &&
        classification.classification === "in_scope" &&
        classification.confidence >= AUTO_APPLY_CONFIDENCE &&
        classification.patch;

      if (!isHighConfidenceInScopePatch) {
        const reason =
          !classification
            ? "Cowork couldn't classify — please reply manually."
            : `Cowork classified as ${classification.classification} (confidence ${classification.confidence.toFixed(2)}): ${classification.reasoning}` +
              (classification.patch
                ? `\nSuggested patch (NOT applied — confidence below ${AUTO_APPLY_CONFIDENCE} threshold):\n  Target: ${classification.patch.target}\n  New value: ${classification.patch.newValue}`
                : "");
        await escalateOnly(prospect, cr, baseUrl, reason).catch((e) =>
          failures.push(`cr=${cr.id.slice(0, 8)} escalate failed: ${e}`),
        );
        summary.push(
          `cr=${cr.id.slice(0, 8)} escalated (${classification?.classification ?? "no-classify"})`,
        );
        continue;
      }

      // High-confidence in-scope branch: apply + dispatch preview build.
      const result = await tryAutoApply({
        prospect,
        cr,
        target: classification.patch!.target,
        newValue: classification.patch!.newValue,
        env,
        baseUrl,
        reasoning: classification.reasoning,
        confidence: classification.confidence,
      });
      if (result.kind === "ok") {
        summary.push(
          `cr=${cr.id.slice(0, 8)} auto-applied (${classification.patch!.target})`,
        );
      } else {
        failures.push(`cr=${cr.id.slice(0, 8)} ${result.reason}`);
        // Apply or dispatch failed — escalate with the technical
        // reason so Ben can decide manually.
        await escalateOnly(
          prospect,
          cr,
          baseUrl,
          `Cowork tried to auto-apply but failed: ${result.reason}. ` +
            `Please review + decide manually.`,
        ).catch(() => {});
        summary.push(`cr=${cr.id.slice(0, 8)} escalated (apply-failed)`);
      }
    }

    if (summary.length === 0 && failures.length > 0) {
      throw new Error(
        `All step6 actions failed: ${failures.join("; ")}`,
      );
    }
    return {
      status: "ok",
      notes: summary.join("; "),
    };
  },
};

// ---------- Branch helpers ----------

type AutoApplyResult =
  | { kind: "ok" }
  | { kind: "fail"; reason: string };

async function tryAutoApply(args: {
  prospect: ProspectRecord;
  cr: ChangeRequest;
  target: SafeTarget;
  newValue: string;
  env: Parameters<Step["run"]>[1];
  baseUrl: string;
  reasoning: string;
  confidence: number;
}): Promise<AutoApplyResult> {
  // Apply the patch first. If apply fails, abort without dispatching
  // a wasted build.
  const apply = await applyChangeRequestPatch({
    prospect: args.prospect,
    target: args.target,
    newValue: args.newValue,
  });
  if (!apply.ok) {
    return { kind: "fail", reason: `apply failed: ${apply.reason}` };
  }

  // Generate the per-request approval token customer-side approve
  // / reject pages will check.
  const approvalToken = randomHex(32);

  await patchChangeRequest(args.prospect.pageId, args.cr.id, {
    status: "in-progress",
    coworkPatch: {
      target: args.target,
      newValue: args.newValue,
      previousValue: apply.previousValue,
    },
    coworkPatchAppliedAt: new Date().toISOString(),
    customerApprovalToken: approvalToken,
  });

  // Dispatch preview build.
  if (
    !args.env.GITHUB_TOKEN ||
    !args.env.GITHUB_OWNER ||
    !args.env.GITHUB_REPO
  ) {
    return {
      kind: "fail",
      reason: "GitHub creds not configured — patch applied but no preview built",
    };
  }
  if (!args.prospect.workerName || !args.prospect.cloudflareAccountId) {
    return {
      kind: "fail",
      reason: "Customer has no per-customer Worker yet — preview build skipped",
    };
  }
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
        mode: "preview",
        changeRequestId: args.cr.id,
      },
    });
  } catch (e) {
    const msg =
      e instanceof GithubApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      kind: "fail",
      reason: `dispatch failed: ${msg}`,
    };
  }
  return { kind: "ok" };
}

async function escalateOnly(
  prospect: ProspectRecord,
  cr: ChangeRequest,
  baseUrl: string,
  reasonForBen: string,
): Promise<void> {
  const ageH = Math.floor(
    (Date.now() - Date.parse(cr.submittedAt)) / (60 * 60 * 1000),
  );
  const adminDeepLink = `${baseUrl}/admin/${prospect.token}#cr-${cr.id}`;
  const notif: NotificationPayload = {
    subject: `[CHANGE REQUEST · needs you] ${prospect.name}${prospect.business ? ` (${prospect.business})` : ""} · ${ageH}h old`,
    body:
      `A change request from ${prospect.name}${prospect.business ? ` at ${prospect.business}` : ""} needs your eye.\n\n` +
      `--- Their request ---\n${cr.message}\n--- End ---\n\n` +
      `Cowork's take:\n${reasonForBen}\n\n` +
      `Reply with one click:\n${adminDeepLink}\n\n` +
      `— Cowork`,
  };
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    throw new Error(`email failed: ${emailErr}`);
  }
  await markChangeRequestEscalated(prospect.pageId, cr.id);
}

// ---------- Predicates + builders ----------

/** Pull change requests this tick should classify-or-escalate.
 *  Skips:
 *   - non-pending (closed / retracted / mid-promote)
 *   - too young (give the customer a chance to retract)
 *   - already escalated AND classified (audit done)
 *   - in-progress with a preview already built (waiting on
 *     customer approval; nothing for us to do until their click) */
function findActionable(prospect: ProspectRecord): ChangeRequest[] {
  const now = Date.now();
  return prospect.changeRequests
    .filter((cr) => {
      if (cr.status !== "pending" && cr.status !== "in-progress") return false;
      // Once classified + escalated, stop processing — admin has it.
      if (cr.coworkClassification && cr.coworkEscalatedAt) return false;
      // If we already applied + built a preview, the customer's
      // click drives the next action, not the cron.
      if (cr.coworkPatchAppliedAt && cr.previewVersionId) return false;
      const submitted = Date.parse(cr.submittedAt);
      if (!Number.isFinite(submitted)) return false;
      if (now - submitted < MIN_AGE_BEFORE_CLASSIFY_MS) return false;
      return true;
    })
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}

/** Build the SiteSnapshot the classifier reads. Pulled from the
 *  same place the adapter reads — content step preferred, prospect
 *  record fallback. Same precedence the live site uses, so the
 *  snapshot reflects what the customer is looking at when they
 *  submit a request. */
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

/** Random hex string of `bytes` characters. Used for the per-
 *  request customer approval token. crypto.getRandomValues is
 *  available in both Workers and Node 20+. */
function randomHex(chars: number): string {
  const arr = new Uint8Array(Math.ceil(chars / 2));
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < arr.length; i++) {
    s += arr[i]!.toString(16).padStart(2, "0");
  }
  return s.slice(0, chars);
}
