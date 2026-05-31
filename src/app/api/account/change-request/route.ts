// POST /api/account/change-request — customer dashboard's "Need a
// change?" form handler.
//
// Three layers of validation before the request is saved:
//   1. Schema (zod): token format, message length
//   2. Multi-item detector: numbered/bulleted lists, "Also,",
//      multiple "Please" — declined with 422 + "split into separate
//      requests" message
//   3. Monthly cap: MONTHLY_CHANGE_REQUEST_LIMIT (2) per calendar
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
  countActiveChangeRequestsByKind,
  getProspectByToken,
  MONTHLY_CHANGE_REQUEST_LIMIT,
  MONTHLY_OFFER_UPDATE_LIMIT,
  updateChangeRequest,
  type ChangeRequest,
} from "@/lib/notion-prospects";
import {
  sendInternalNotification,
  type NotificationPayload,
} from "@/lib/email";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { effectiveMonthlyCap } from "@/lib/admin-grants";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";
import {
  looksLikeMultipleItems,
  MULTI_ITEM_DECLINE_MESSAGE,
} from "@/lib/multi-item-detector";
import {
  OFFER_HEADLINE_MAX,
  OFFER_BODY_MAX,
  OFFER_CTA_LABEL_MAX,
  OFFER_CTA_URL_MAX,
} from "@/lib/offers/limits";
import { applyChangeRequestPatches } from "@/lib/change-requests/apply-patch";
import { classifyChangeRequest, SAFE_PATCH_TARGETS, type SafeTarget } from "@/lib/haiku/classify-change-request";
import { parseFormMessage } from "@/lib/change-requests/build-form-patches";
import { buildSiteSnapshot } from "@/lib/change-requests/site-snapshot";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Optional structured offer payload — sent by the dashboard
 *  OfferCard composer. When present, the server constructs a
 *  pre-baked `coworkPatches` on the change-request targeting
 *  `content.offers.current`. Cowork's classifier is bypassed
 *  for these — the customer provided structured data via the
 *  form, no ambiguity. */
const offerPayloadSchema = z.object({
  headline: z
    .string()
    .trim()
    .min(1, "Add a headline.")
    .max(
      OFFER_HEADLINE_MAX,
      `Keep the headline ≤ ${OFFER_HEADLINE_MAX} chars so it fits the strip.`,
    ),
  body: z
    .string()
    .trim()
    .max(
      OFFER_BODY_MAX,
      `Keep the body ≤ ${OFFER_BODY_MAX} chars so it doesn't wrap badly.`,
    )
    .optional(),
  ctaLabel: z
    .string()
    .trim()
    .max(
      OFFER_CTA_LABEL_MAX,
      `Keep the button label ≤ ${OFFER_CTA_LABEL_MAX} chars so the pill stays compact.`,
    )
    .optional(),
  ctaUrl: z.string().trim().max(OFFER_CTA_URL_MAX).optional(),
  startsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  endsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
});

/** Structured patch from the form — bypasses Haiku entirely. */
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
    .min(5, "Please describe the change in at least a few words.")
    .max(5000, "That's a lot for one message — please split it up."),
  /** Optional discriminator. "offer-update" = structured offer form.
   *  "direct-edit" = structured form (edit/add/remove) with pre-built
   *  patches. Absent = legacy free-text (Haiku-classified). */
  kind: z.enum(["offer-update", "direct-edit"]).optional(),
  /** Required when kind="offer-update". Server validates dates +
   *  embeds the resulting OfferEntry on the change-request. */
  offer: offerPayloadSchema.optional(),
  /** Pre-computed patches from the structured form. When present,
   *  skips Haiku classification entirely — applies immediately.
   *  Only accepted when kind="direct-edit". */
  patches: z.array(formPatchSchema).optional(),
  /** When true AND patches is empty/absent, signals a pure asset
   *  rebuild (photo re-upload). No data to patch — just dispatch
   *  a fresh build. */
  rebuildOnly: z.boolean().optional(),
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
  const { token, message, kind, offer, patches: formPatches, rebuildOnly } = parsed.data;
  // Session gate — defence-in-depth on top of body-token validation.
  // Token regex is enforced by the zod schema above; this verifies
  // the caller's signed session cookie matches that token. Security
  // audit 2026-05-13 (M1).
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;
  // Offer-update sanity checks (server side) — offer must be
  // present when kind=offer-update, end ≥ start.
  if (kind === "offer-update") {
    if (!offer) {
      return NextResponse.json(
        { error: "Missing offer details." },
        { status: 400 },
      );
    }
    if (offer.endsAt < offer.startsAt) {
      return NextResponse.json(
        { error: "End date can't be before start date." },
        { status: 400 },
      );
    }
    if (offer.ctaLabel && !offer.ctaUrl) {
      return NextResponse.json(
        {
          error:
            "If you set a button label, add a link too (or clear the label).",
        },
        { status: 400 },
      );
    }
  }

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

  // Direct-edit validation: every target must be in the safe whitelist.
  if (kind === "direct-edit") {
    if (!formPatches || formPatches.length === 0) {
      if (!rebuildOnly) {
        return NextResponse.json(
          { error: "Missing patches for direct-edit." },
          { status: 400 },
        );
      }
    } else {
      for (const p of formPatches) {
        if (!(SAFE_PATCH_TARGETS as readonly string[]).includes(p.target)) {
          return NextResponse.json(
            { error: `Invalid patch target: ${p.target}` },
            { status: 400 },
          );
        }
      }
    }
  }

  // Multi-item check: each request must be a single item. Detected
  // patterns get a polite "split into separate requests" reply.
  // Doesn't burn the cap — nothing's saved.
  // Skipped for structured forms (offer-update, direct-edit): message
  // is server-built, not free-form customer text.
  if (!kind && looksLikeMultipleItems(message)) {
    return NextResponse.json(
      {
        error: MULTI_ITEM_DECLINE_MESSAGE,
        suggestion: "split-into-separate-requests",
      },
      { status: 422 },
    );
  }

  // Monthly cap check. Offer updates have their own per-kind 2/mo
  // budget (the structured composer auto-applies and can't be used
  // to abuse the free-text path). Free-text change-requests share
  // the legacy global cap. Reset on the 1st of each month, UTC.
  const requests = prospect.changeRequests;
  const usedFreeText = countActiveChangeRequestsByKind(requests, "free-text")
    + countActiveChangeRequestsByKind(requests, "direct-edit");
  const usedOffers = countActiveChangeRequestsByKind(requests, "offer-update");

  // Effective caps fold in any admin-granted bonus for this month
  // (see src/lib/admin-grants.ts). Customer who's used the default
  // 2 + been granted 1 by Ben sees an effective cap of 3.
  const effectiveOfferCap = effectiveMonthlyCap({
    prospect,
    defaultCap: MONTHLY_OFFER_UPDATE_LIMIT,
    kind: "offers",
  });
  const effectiveCrCap = effectiveMonthlyCap({
    prospect,
    defaultCap: MONTHLY_CHANGE_REQUEST_LIMIT,
    kind: "changeRequests",
  });

  const nextReset = nextMonthStartIso();
  const resetCopy = `Allowance resets on ${formatDateNice(nextReset)}.`;

  if (kind === "offer-update" && usedOffers >= effectiveOfferCap) {
    return NextResponse.json(
      {
        error: `You've used your ${effectiveOfferCap} offer updates for this month. ${resetCopy}`,
        remaining: 0,
        resetsOn: nextReset,
      },
      { status: 429 },
    );
  }
  if (kind !== "offer-update" && usedFreeText >= effectiveCrCap) {
    return NextResponse.json(
      {
        error: `You've used your ${effectiveCrCap} change requests for this month. ${resetCopy} For anything bigger or more urgent, email me directly and I'll quote it separately.`,
        remaining: 0,
        resetsOn: nextReset,
      },
      { status: 429 },
    );
  }

  const requestId = crypto.randomUUID();
  const isOfferUpdate = kind === "offer-update" && !!offer;
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://pandemonium-software-website.benpandher.workers.dev";

  // ---- Inline classification for free-text ----
  // Attempt to classify + apply free-text submissions immediately
  // so the customer gets an instant result. Two-layer approach:
  //   1. Deterministic regex parse (catches form-formatted messages)
  //   2. Haiku classification (full AI path)
  // If either succeeds at high confidence, auto-apply. If not, save
  // as "pending" and let the cron handle it (existing behaviour).
  let inlineFreeTextResult: {
    applied: boolean;
    patches?: Array<{ target: string; newValue: unknown; previousValue: unknown }>;
    reply?: string;
    classification?: "in_scope" | "out_of_scope" | "ambiguous";
    confidence?: number;
    reasoning?: string;
    rebuildOnly?: boolean;
  } | null = null;

  if (!kind) {
    // Layer 1: deterministic parse (instant, free)
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
        const targets = apply.applied.map((p) => p.target);
        inlineFreeTextResult = {
          applied: true,
          patches: apply.applied.map((p) => ({
            target: p.target,
            newValue: p.newValue as unknown,
            previousValue: p.previousValue,
          })),
          reply: `Done — updated ${targets.join(", ")}. Refresh your site shortly to see it live.`,
          classification: "in_scope",
          confidence: 1.0,
          reasoning: "Deterministic parse of form-formatted message.",
        };
      }
    }

    // Layer 2: Haiku classification (if deterministic didn't apply)
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
                const targets = apply.applied.map((p) => p.target);
                inlineFreeTextResult = {
                  applied: true,
                  patches: apply.applied.map((p) => ({
                    target: p.target,
                    newValue: p.newValue as unknown,
                    previousValue: p.previousValue,
                  })),
                  reply: `Done — updated ${targets.join(", ")}. Refresh your site shortly to see it live.`,
                  classification: classification.classification,
                  confidence: classification.confidence,
                  reasoning: classification.reasoning,
                };
              }
            } else {
              // Rebuild-only
              inlineFreeTextResult = {
                applied: true,
                patches: [],
                reply: "Done — your site is being rebuilt. Refresh shortly to see it live.",
                classification: classification.classification,
                confidence: classification.confidence,
                reasoning: classification.reasoning,
                rebuildOnly: true,
              };
            }
          }
        }
      } catch (e) {
        // Haiku unreachable or timed out — fall back to cron path
        console.warn(
          `[api/account/change-request] inline classify failed, falling back to cron: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  // ---- Auto-apply path for offer-update ----
  // The customer's submitted structured form data via the dashboard
  // composer. No ambiguity, no operator review needed — apply the
  // patch to Notion right now, dispatch a live build, mark the CR
  // resolved on creation. The length-capped form is the safety net
  // (no free-form prose to misclassify).
  //
  // If the apply fails (Notion 500, schema mismatch), we abort
  // BEFORE saving the CR so the customer's monthly slot isn't
  // burned and they can retry.
  let autoAppliedOffer:
    | {
        offerEntry: Record<string, unknown>;
        previousOffer: unknown;
      }
    | null = null;
  if (isOfferUpdate && offer) {
    const offerEntry = {
      id: crypto.randomUUID(),
      headline: offer.headline,
      body: offer.body,
      ctaLabel: offer.ctaLabel,
      ctaUrl: offer.ctaUrl,
      startsAt: offer.startsAt,
      endsAt: offer.endsAt,
      createdAt: new Date().toISOString(),
      status: "active",
    };
    const apply = await applyChangeRequestPatches({
      prospect,
      patches: [
        {
          target: "content.offers.current",
          newValue: JSON.stringify(offerEntry),
        },
      ],
    });
    if (!apply.ok) {
      // Apply failed before we saved anything — return error,
      // monthly cap unchanged. Customer can fix + retry.
      console.error(
        `[api/account/change-request] offer auto-apply failed for ${prospect.token.slice(0, 8)}: ${apply.reason}`,
      );
      return NextResponse.json(
        {
          error: `Couldn't apply that offer: ${apply.reason}. Tweak it and try again.`,
        },
        { status: 400 },
      );
    }
    autoAppliedOffer = {
      offerEntry,
      previousOffer: apply.applied[0]?.previousValue ?? null,
    };
  }

  // ---- Auto-apply path for direct-edit ----
  // Form-generated structured change requests (edit, add, remove).
  // Patches are pre-built by the form — no Haiku needed.
  const isDirectEdit = kind === "direct-edit";
  let autoAppliedDirect:
    | { patches: Array<{ target: string; newValue: unknown; previousValue: unknown }> }
    | null = null;
  if (isDirectEdit && formPatches && formPatches.length > 0) {
    const typedPatches = formPatches.map((p) => ({
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
        `[api/account/change-request] direct-edit auto-apply failed for ${prospect.token.slice(0, 8)}: ${apply.reason}`,
      );
      return NextResponse.json(
        { error: `Couldn't apply that change: ${apply.reason}. Please try again.` },
        { status: 400 },
      );
    }
    autoAppliedDirect = {
      patches: apply.applied.map((p) => ({
        target: p.target,
        newValue: p.newValue as unknown,
        previousValue: p.previousValue,
      })),
    };
  }

  const isAutoApplied = isOfferUpdate || isDirectEdit || !!inlineFreeTextResult?.applied;
  const nowIso = new Date().toISOString();
  const newRequest: ChangeRequest = {
    id: requestId,
    submittedAt: nowIso,
    message,
    kind: isOfferUpdate ? "offer-update" : isDirectEdit ? "direct-edit" : "free-text",
    status: isAutoApplied ? "resolved" : "pending",
    ...(isOfferUpdate && autoAppliedOffer
      ? {
          resolvedAt: nowIso,
          reply: "Auto-applied via dashboard composer — live within a couple of minutes once the build completes.",
          coworkClassification: "in_scope" as const,
          coworkConfidence: 1.0,
          coworkReasoning:
            "Customer submitted structured offer via dashboard composer — auto-applied without admin review.",
          coworkPatchAppliedAt: nowIso,
          coworkPatches: [
            {
              target: "content.offers.current",
              newValue: autoAppliedOffer.offerEntry,
              previousValue: autoAppliedOffer.previousOffer,
            },
          ],
        }
      : {}),
    ...(isDirectEdit
      ? {
          resolvedAt: nowIso,
          reply: "Auto-applied — live within a couple of minutes once the build completes.",
          coworkClassification: "in_scope" as const,
          coworkConfidence: 1.0,
          coworkReasoning:
            "Customer submitted structured form — auto-applied without Haiku classification.",
          coworkPatchAppliedAt: nowIso,
          ...(autoAppliedDirect ? { coworkPatches: autoAppliedDirect.patches } : {}),
          ...(rebuildOnly && !autoAppliedDirect ? { coworkRebuildOnly: true } : {}),
        }
      : {}),
    ...(inlineFreeTextResult?.applied
      ? {
          resolvedAt: nowIso,
          reply: inlineFreeTextResult.reply,
          coworkClassification: inlineFreeTextResult.classification as "in_scope",
          coworkConfidence: inlineFreeTextResult.confidence ?? 1.0,
          coworkReasoning: inlineFreeTextResult.reasoning ?? "Inline classification at submit time.",
          coworkPatchAppliedAt: nowIso,
          ...(inlineFreeTextResult.patches && inlineFreeTextResult.patches.length > 0
            ? { coworkPatches: inlineFreeTextResult.patches }
            : {}),
          ...(inlineFreeTextResult.rebuildOnly ? { coworkRebuildOnly: true } : {}),
        }
      : {}),
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

  // ---- Dispatch live build for auto-applied changes ----
  // Covers both offer-update and direct-edit. The patch landed in
  // Notion above; now trigger a customer-site build (mode=live) so
  // the change is visible on the site within ~2 minutes. Fail-soft.
  let buildWarning: string | null = null;
  if (isAutoApplied && prospect.workerName && prospect.cloudflareAccountId) {
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
          `[api/account/change-request] offer applied but build dispatch failed: ${msg}`,
        );
      }
    } else {
      buildWarning = "GitHub credentials not configured — site won't rebuild";
    }
  }

  // Internal notification to Ben — fail-soft, never blocks the
  // user response. Two flavours:
  //   - Offer auto-apply: FYI only ("no action needed, applied +
  //     build dispatched"). Uses notifyAdmin so the inbox tag is
  //     consistent with other auto-apply events (review-edit,
  //     change-request preview).
  //   - Regular CR: existing inbox notification flow — operator
  //     reviews in /admin.
  const adminDeepLink = `${baseUrl}/admin/${token}#cr-${newRequest.id}`;
  if (isAutoApplied) {
    const subjectKind = isOfferUpdate
      ? "Offer"
      : inlineFreeTextResult?.applied
        ? "Free-text change (inline classified)"
        : "Change";
    const subject = `${subjectKind} auto-applied — ${prospect.name}`;
    const submissionType = isOfferUpdate
      ? "offer update"
      : inlineFreeTextResult?.applied
        ? `free-text change (Haiku confidence: ${((inlineFreeTextResult.confidence ?? 1) * 100).toFixed(0)}%)`
        : "structured edit";
    const bodyParts: string[] = [
      `${prospect.name}${prospect.business ? ` (${prospect.business})` : ""} submitted a ${submissionType} from the dashboard. Auto-applied + live build dispatched.\n\n`,
    ];
    if (inlineFreeTextResult?.applied) {
      bodyParts.push(`Customer's message:\n  "${message}"\n\n`);
      if (inlineFreeTextResult.patches && inlineFreeTextResult.patches.length > 0) {
        bodyParts.push(
          `Patches (${inlineFreeTextResult.patches.length}):\n` +
          inlineFreeTextResult.patches.map((p) => `  - ${p.target} → "${p.newValue}"`).join("\n") + "\n",
        );
      } else if (inlineFreeTextResult.rebuildOnly) {
        bodyParts.push("Rebuild-only (asset refresh, no text patches).\n");
      }
      if (inlineFreeTextResult.reasoning) {
        bodyParts.push(`Reasoning: ${inlineFreeTextResult.reasoning}\n`);
      }
    } else if (isOfferUpdate && offer) {
      bodyParts.push(
        `Headline: "${offer.headline}"\n` +
        (offer.body ? `Body: "${offer.body}"\n` : "") +
        `Dates: ${offer.startsAt} → ${offer.endsAt}\n` +
        (offer.ctaLabel ? `Button: "${offer.ctaLabel}"${offer.ctaUrl ? ` → ${offer.ctaUrl}` : ""}\n` : ""),
      );
    } else if (autoAppliedDirect) {
      bodyParts.push(
        `Patches (${autoAppliedDirect.patches.length}):\n` +
        autoAppliedDirect.patches.map((p) => `  - ${p.target} → "${p.newValue}"`).join("\n") + "\n",
      );
    } else if (rebuildOnly) {
      bodyParts.push("Pure asset rebuild (photo re-upload) — no data patches.\n");
    }
    bodyParts.push(
      buildWarning
        ? `\n⚠️  Build dispatch FAILED: ${buildWarning}. Apply landed in Notion but the site won't rebuild — re-trigger manually.\n`
        : `\nBuild should be live within ~2 minutes.\n`,
    );
    bodyParts.push(
      `\n` +
      adminFooter({
        prospectName: prospect.name,
        prospectToken: token,
        anchor: `cr-${requestId.slice(0, 8)}`,
      }),
    );
    try {
      const env = getServerEnv();
      await notifyAdmin(env, {
        category: "change-request",
        subject,
        body: bodyParts.join(""),
      });
    } catch (e) {
      console.warn(
        `[api/account/change-request] admin FYI failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    const notif: NotificationPayload = {
      subject: `[CHANGE REQUEST] ${prospect.name}${prospect.business ? ` (${prospect.business})` : ""}`,
      body:
        `New change request from ${prospect.name}${prospect.business ? ` at ${prospect.business}` : ""}.\n\n` +
        `--- Their request ---\n${message}\n--- End ---\n\n` +
        `Reply with one click:\n${adminDeepLink}\n\n` +
        `Status: ${prospect.status}\n` +
        `Notion: ${prospect.notionUrl}\n\n` +
        `— Cowork`,
    };
    const emailErr = await sendInternalNotification(notif);
    if (emailErr) {
      console.warn(
        `[api/account/change-request] Notion saved but email failed: ${emailErr}`,
      );
    }
  }

  // Customer email — varies by outcome:
  //   - Auto-applied (any path): "resolved" template with the reply
  //   - Pending (free-text cron path): "received" confirmation
  let receiptErr: string | null = null;
  try {
    const accountUrl = `${baseUrl.replace(/\/$/, "") || site.url}/account/${token}`;
    if (isAutoApplied) {
      const customerDomain = ((prospect.onboardingData ?? {}) as {
        domain?: { domain?: string };
      }).domain?.domain;
      const siteUrl = customerDomain
        ? `https://${customerDomain}/`
        : "https://your-site.example/";
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        "change-request-resolved",
        {
          customerName: firstName(prospect.name),
          originalMessage: message,
          reply: newRequest.reply ?? "Done — your change is live.",
          siteUrl,
          accountUrl,
        },
      );
    } else {
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        "change-request-received",
        {
          customerName: firstName(prospect.name),
          message,
          accountUrl,
        },
      );
    }
  } catch (e) {
    receiptErr = e instanceof Error ? e.message : String(e);
    console.warn(
      `[api/account/change-request] customer email failed: ${receiptErr}`,
    );
  }

  // `remaining` is reported per-kind for the structured offer path
  // so the OfferCard composer shows the right counter, and globally
  // for legacy free-text submissions.
  const remainingAfter = isOfferUpdate
    ? effectiveOfferCap - (usedOffers + 1)
    : effectiveCrCap - (usedFreeText + 1);
  return NextResponse.json({
    success: true,
    request: newRequest,
    remaining: remainingAfter,
    customerReceiptSent: !receiptErr,
    receiptWarning: receiptErr,
    /** True when a structured path (offer-update or direct-edit)
     *  auto-applied. Dashboard composer relies on this to show the
     *  "live within ~2 min" toast instead of "we'll review and get
     *  back to you". */
    autoApplied: isAutoApplied,
    buildWarning,
  });
}

/** "Alex Smith" → "Alex". Fallback to "there" on empty. */
function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

// (Multi-item detector extracted to src/lib/multi-item-detector.ts
// — same logic, now shared with /api/onboarding/review-edit so
// pre-commit edits get the same protection.)

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

// ---------- DELETE: retract a still-pending change request ----------
//
// Retraction is customer-initiated and only allowed while the request
// status is "pending". Once the operator (or Cowork) flips it to
// "in-progress", retraction is locked out — they're already working
// on it. The retracted record stays in the inbox with status
// "retracted" so the customer sees their own history; the cap helper
// `countActiveChangeRequestsThisMonth` excludes retracted, so the
// slot is freed.

const deleteSchema = z.object({
  token: z.string().regex(TOKEN_RE, "Missing or invalid token."),
  requestId: z.string().min(1, "Missing request id."),
});

export async function DELETE(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { token, requestId } = parsed.data;
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/account/change-request DELETE] Notion lookup error:", msg);
    return NextResponse.json(
      { error: "Couldn't look up your account. Please try again." },
      { status: 500 },
    );
  }
  if (!prospect) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (!ELIGIBLE_STATUSES.has(prospect.status)) {
    return NextResponse.json(
      { error: "Change requests are paused on this account." },
      { status: 403 },
    );
  }

  // Find the request by ID + verify it's still pending. (Once the
  // operator marks it in-progress, retraction is locked.)
  const target = prospect.changeRequests.find((r) => r.id === requestId);
  if (!target) {
    return NextResponse.json(
      { error: "That request wasn't found in your inbox." },
      { status: 404 },
    );
  }
  if (target.status !== "pending") {
    return NextResponse.json(
      {
        error: `That request is already ${target.status === "in-progress" ? "being worked on" : target.status} — too late to retract. Email me directly if you need to undo something.`,
      },
      { status: 409 },
    );
  }

  let updateResult;
  try {
    updateResult = await updateChangeRequest(prospect.pageId, requestId, {
      status: "retracted",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/account/change-request DELETE] Notion update error:", msg);
    return NextResponse.json(
      { error: "Couldn't retract just now. Please try again." },
      { status: 500 },
    );
  }

  // Notify Ben so he knows the customer changed their mind. Fail-soft.
  const notif: NotificationPayload = {
    subject: `[CHANGE REQUEST RETRACTED] ${prospect.name}${prospect.business ? ` (${prospect.business})` : ""}`,
    body:
      `${prospect.name}${prospect.business ? ` at ${prospect.business}` : ""} retracted a change request before it was actioned.\n\n` +
      `--- The retracted request ---\n${target.message}\n--- End ---\n\n` +
      `Submitted: ${target.submittedAt}\n` +
      `Status:    ${prospect.status}\n` +
      `Notion:    ${prospect.notionUrl}\n` +
      `Admin detail: ${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pandemonium-software-website.benpandher.workers.dev"}/admin/${token}\n\n` +
      `The slot has been freed — their monthly cap counter has gone down by one.\n\n` +
      `— Cowork`,
  };
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    console.warn(
      `[api/account/change-request DELETE] Notion saved but email failed: ${emailErr}`,
    );
  }

  return NextResponse.json({ success: true, request: updateResult.updated });
}

const getSchema = z.object({
  token: z.string().regex(TOKEN_RE, "Missing or invalid token."),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = getSchema.safeParse({ token: url.searchParams.get("token") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { token } = parsed.data;
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch {
    return NextResponse.json(
      { error: "Couldn't look up your account." },
      { status: 500 },
    );
  }
  if (!prospect) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    requests: prospect.changeRequests,
  });
}
