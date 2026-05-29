// POST /api/internal/build-callback
//
// Internal endpoint called at the END of a customer-site Action,
// win or lose. Three modes (the `mode` field in the payload):
//
//   "live"     — `customer-site-build.yml` ran `wrangler deploy`.
//                On success, stamps previewUrl in onboardingData.review
//                and emails the customer "preview ready" (this is the
//                pre-launch Hub Step 5 path — name is historical).
//
//   "preview"  — `customer-site-build.yml` ran `wrangler versions
//                upload`. On success, stamps previewVersionId +
//                previewVersionUrl on the named change request and
//                emails the customer with approve/reject CTAs. The
//                customer's live site stays untouched.
//
//   "promote"  — `customer-site-promote.yml` ran `wrangler versions
//                deploy <id>` after the customer approved the preview.
//                On success, marks the change request resolved, stamps
//                customerApprovedAt, sends "change-applied-live"
//                email. The customer's live site is now updated.
//
// Auth: shared INTERNAL_BUILD_SECRET, sent as `x-internal-secret`
// header. Same secret used by /api/internal/site-data.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
  clearPreviewBuildTriggered,
  clearFinalLaunchTriggered,
  markSiteLive,
  patchChangeRequest,
  patchReviewEdit,
  updateChangeRequest,
} from "@/lib/notion-prospects";
import {
  mergeStepData,
  onboardingDataSchema,
  type OnboardingData,
} from "@/lib/onboarding";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { site } from "@/lib/site";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Three-mode discriminated union. `mode` is optional in legacy
// payloads (defaults to "live") so older workflow runs don't break
// when this endpoint upgrades.
//
// `reviewEditId` is for the C5.7 Phase B v2 pre-commit auto-apply
// path: when step6 auto-applies a Step 5 review edit + dispatches
// a LIVE build (because pre-commit there's no live site to
// protect), the workflow's clientPayload threads the edit id
// through here so we can email the customer "your edit is
// applied" + stamp the right entry.
// `finalLaunch` arrives as a string from jq in the workflow:
// either "true" or "" (empty). A reusable coercion lifts it to
// boolean so the rest of the handler can branch cleanly.
const finalLaunchString = z
  .string()
  .optional()
  .transform((v) => v === "true");

const requestSchema = z.discriminatedUnion("status", [
  z.object({
    token: z.string().regex(TOKEN_RE),
    status: z.literal("success"),
    mode: z.enum(["live", "preview", "promote"]).default("live"),
    previewUrl: z.string().trim().url().max(500).optional(),
    previewVersionId: z.string().trim().max(100).optional(),
    /** Preview-access token set as PREVIEW_ACCESS_TOKEN var on the
     *  uploaded version. Persisted on the change request so the
     *  marketing-site iframe wrapper can pass it via ?pa=. */
    previewAccessToken: z.string().trim().max(100).optional(),
    promotedVersionId: z.string().trim().max(100).optional(),
    changeRequestId: z.string().trim().max(50).optional().or(z.literal("")),
    reviewEditId: z.string().trim().max(50).optional().or(z.literal("")),
    /** Flagged by step7-go-live when the launch-day build is
     *  dispatched. Tells the callback to flip status to "Live" +
     *  stamp Site Live At + send the celebratory email. */
    finalLaunch: finalLaunchString,
    /** Set by the customer-site-build workflow's preview-upload step
     *  when the customer's CF account has no workers.dev subdomain —
     *  wrangler emits no preview URL, so the workflow falls back to
     *  promoting the just-uploaded version directly to live. The
     *  callback handles this by skipping the preview-then-approve
     *  gate: marks the CR resolved, sends "applied live" instead of
     *  "preview ready", uses the customer's live URL as previewUrl. */
    fallbackPromotedToLive: finalLaunchString,
  }),
  z.object({
    token: z.string().regex(TOKEN_RE),
    status: z.literal("failure"),
    mode: z.enum(["live", "preview", "promote"]).default("live"),
    errorMessage: z.string().trim().max(2000),
    changeRequestId: z.string().trim().max(50).optional().or(z.literal("")),
    reviewEditId: z.string().trim().max(50).optional().or(z.literal("")),
    finalLaunch: finalLaunchString,
  }),
]);

export async function POST(request: Request) {
  const env = getServerEnv();
  const expected = env.INTERNAL_BUILD_SECRET;
  if (!expected) {
    return NextResponse.json(
      {
        error: "INTERNAL_BUILD_SECRET not configured.",
        code: "secret_unconfigured",
      },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-internal-secret");
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "bad_secret" },
      { status: 401 },
    );
  }

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

  const prospect = await getProspectByToken(parsed.data.token).catch(
    () => null,
  );
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found.", code: "not_found" },
      { status: 404 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;

  // --- Failure: log + clear latches per mode -------------------------------
  if (parsed.data.status === "failure") {
    if (parsed.data.mode === "live") {
      const isFinalLaunchFailure = parsed.data.finalLaunch === true;
      try {
        await clearPreviewBuildTriggered(prospect.pageId, { failure: true });
        // Also clear the finalLaunch latch on failure so the cron
        // can re-dispatch on the next tick (after the operator has
        // looked at the error). Status stays "Onboarding Complete"
        // — we don't flip to "Live" on a failed build.
        if (isFinalLaunchFailure) {
          await clearFinalLaunchTriggered(prospect.pageId);
        }
      } catch (e) {
        console.error(
          `[build-callback] couldn't clear build latches: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      // For pre-commit auto-apply failures, also stamp the edit so
      // Ben can see WHY it failed in /admin (the failure path so
      // far stays in worker logs, which is hard to find later).
      if (parsed.data.reviewEditId) {
        await patchReviewEdit(
          prospect.pageId,
          parsed.data.reviewEditId,
          {
            coworkReasoning: `[live build failed] ${parsed.data.errorMessage}`,
          },
        ).catch((e) => {
          console.warn(
            `[build-callback] couldn't stamp review-edit failure: ${e instanceof Error ? e.message : String(e)}`,
          );
        });
      }
      // Same idea for post-commit auto-apply failures (changeRequestId
      // set, since 2026-05-15). Stamp the CR with the failure
      // reason so it surfaces in /admin + the customer's dashboard
      // — without this the CR sits in "in-progress" forever after
      // a live build dies.
      if (parsed.data.changeRequestId) {
        await patchChangeRequest(
          prospect.pageId,
          parsed.data.changeRequestId,
          {
            coworkReasoning: `[live build failed] ${parsed.data.errorMessage}`,
          },
        ).catch((e) => {
          console.warn(
            `[build-callback] couldn't stamp CR failure: ${e instanceof Error ? e.message : String(e)}`,
          );
        });
      }
      console.error(
        `[build-callback] LIVE build FAILED for ${parsed.data.token}${isFinalLaunchFailure ? " (LAUNCH DAY)" : ""}: ${parsed.data.errorMessage}`,
      );
      await notifyAdmin(env, {
        category: "build",
        subject: isFinalLaunchFailure
          ? `🚨 LAUNCH-DAY BUILD FAILED — ${prospect.name}`
          : `LIVE build FAILED — ${prospect.name}`,
        body:
          (isFinalLaunchFailure
            ? `URGENT — ${prospect.name}'s scheduled launch-day build failed. They are NOT live yet. Status stays "Onboarding Complete"; cron will re-try on the next tick once the latch is cleared.\n\n`
            : `A live build failed for ${prospect.name}.\n\n`) +
          `Error:\n  ${parsed.data.errorMessage}\n\n` +
          (parsed.data.reviewEditId
            ? `Review edit: ${parsed.data.reviewEditId.slice(0, 8)}…\n\n`
            : "") +
          adminFooter({
            prospectName: prospect.name,
            prospectToken: parsed.data.token,
            anchor: parsed.data.reviewEditId
              ? `re-${parsed.data.reviewEditId.slice(0, 8)}`
              : undefined,
          }),
      }).catch((e) => {
        console.warn(
          `[build-callback] admin notify failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
    } else if (parsed.data.mode === "preview" && parsed.data.changeRequestId) {
      // Preview build failed — leave the request open so Cowork
      // re-tries on the next tick OR Ben gets the escalation email
      // when the 2-hour age threshold is crossed. Stamp a
      // `previewBuildFailedAt` marker on the request.
      await patchChangeRequest(
        prospect.pageId,
        parsed.data.changeRequestId,
        {
          // Reuse coworkReasoning to surface the failure on /admin
          // until we add a dedicated `previewBuildFailedAt` field.
          coworkReasoning: `[preview build failed] ${parsed.data.errorMessage}`,
        },
      ).catch((e) => {
        console.error(
          `[build-callback] preview-failure stamp failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
      console.error(
        `[build-callback] PREVIEW build FAILED for ${parsed.data.token} cr=${parsed.data.changeRequestId}: ${parsed.data.errorMessage}`,
      );
      await notifyAdmin(env, {
        category: "build",
        subject: `PREVIEW build FAILED — ${prospect.name}`,
        body:
          `Preview build failed for ${prospect.name}.\n\n` +
          `CR: ${parsed.data.changeRequestId.slice(0, 8)}…\n` +
          `Error:\n  ${parsed.data.errorMessage}\n\n` +
          adminFooter({
            prospectName: prospect.name,
            prospectToken: parsed.data.token,
            anchor: `cr-${parsed.data.changeRequestId.slice(0, 8)}`,
          }),
      }).catch(() => {});
    } else if (parsed.data.mode === "promote" && parsed.data.changeRequestId) {
      // Promote failed — the customer has already approved, so
      // they're expecting it live. Don't flip status yet (Ben needs
      // to investigate); leave the audit trail for the operator.
      await patchChangeRequest(
        prospect.pageId,
        parsed.data.changeRequestId,
        {
          coworkReasoning: `[promote failed] ${parsed.data.errorMessage}`,
        },
      ).catch(() => {});
      console.error(
        `[build-callback] PROMOTE FAILED for ${parsed.data.token} cr=${parsed.data.changeRequestId}: ${parsed.data.errorMessage}`,
      );
      await notifyAdmin(env, {
        category: "build",
        subject: `PROMOTE FAILED — ${prospect.name} (customer is waiting)`,
        body:
          `Customer already approved — promote failed. They're expecting it live.\n\n` +
          `CR: ${parsed.data.changeRequestId.slice(0, 8)}…\n` +
          `Error:\n  ${parsed.data.errorMessage}\n\n` +
          `→ Investigate and either re-trigger the promote or message the customer.\n\n` +
          adminFooter({
            prospectName: prospect.name,
            prospectToken: parsed.data.token,
            anchor: `cr-${parsed.data.changeRequestId.slice(0, 8)}`,
          }),
      }).catch(() => {});
    }
    return NextResponse.json({
      success: true,
      action: "failure-recorded",
      mode: parsed.data.mode,
      message: parsed.data.errorMessage,
    });
  }

  // --- Success branches ----------------------------------------------------

  // Mode: LIVE build. Two sub-cases:
  //   (a) Pre-commit Hub Step 5 launch path — stamps previewUrl on
  //       review slice, sends "preview-ready" email
  //   (b) NEW: pre-commit auto-apply by Cowork (reviewEditId set)
  //       — preview Worker has been refreshed with the customer's
  //       edit; send "review-edit-applied" email instead. The
  //       previewUrl might be the same (the customer's domain or
  //       workers.dev fallback) but the messaging is different.
  if (parsed.data.mode === "live") {
    if (!parsed.data.previewUrl) {
      return NextResponse.json(
        { error: "live mode requires previewUrl." },
        { status: 400 },
      );
    }

    // Detect sub-case (b): step6 auto-apply for a review edit.
    const isReviewEditApply =
      parsed.data.reviewEditId && parsed.data.reviewEditId.length > 0;

    // Detect sub-case (c): launch-day build dispatched by step7.
    // Takes precedence over (a) and (b) because it's a terminal
    // transition — flip status to "Live", stamp Site Live At,
    // clear the final-launch latch, send the celebratory email.
    const isFinalLaunch = parsed.data.finalLaunch === true;

    const existing = onboardingDataSchema.safeParse(
      prospect.onboardingData ?? {},
    );
    const baseData: OnboardingData = existing.success ? existing.data : {};
    const reviewSlice = (baseData.review ?? {}) as Record<string, unknown>;
    const merged = mergeStepData(baseData, "review", {
      ...reviewSlice,
      previewUrl: parsed.data.previewUrl,
    });

    try {
      await updateProspectOnboarding(prospect.pageId, { data: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[build-callback] Notion previewUrl write failed for ${parsed.data.token}: ${msg}`,
      );
      return NextResponse.json(
        { error: `Notion update failed: ${msg}` },
        { status: 500 },
      );
    }
    try {
      await clearPreviewBuildTriggered(prospect.pageId, { failure: false });
    } catch (e) {
      console.warn(
        `[build-callback] couldn't clear build latches: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    let emailWarning: string | null = null;

    // ---- Sub-case (c): launch-day terminal transition ----
    if (isFinalLaunch) {
      // Flip status → "Live", stamp Site Live At, clear the
      // final-launch latch. updateProspectOnboarding handles the
      // status flip; markSiteLive sets the dedicated date column;
      // clearFinalLaunchTriggered removes the in-flight latch so
      // a future manual re-launch can re-dispatch cleanly.
      try {
        await updateProspectOnboarding(prospect.pageId, {
          statusFlip: "Live" as const,
        });
        await markSiteLive(prospect.pageId);
        await clearFinalLaunchTriggered(prospect.pageId);
      } catch (e) {
        console.error(
          `[build-callback] finalLaunch state flips failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        // Continue — the customer's site is built + live (DNS + Worker
        // route were already in place). The status flip can be fixed
        // manually from /admin.
      }
      // Email customer the "you're live" announcement.
      const siteUrl =
        ((prospect.onboardingData ?? {}) as {
          domain?: { domain?: string };
        }).domain?.domain
          ? `https://${
              ((prospect.onboardingData ?? {}) as {
                domain?: { domain?: string };
              }).domain!.domain
            }/`
          : parsed.data.previewUrl;
      try {
        await sendCustomerEmail(env, prospect.email, "site-live", {
          customerName: firstName(prospect.name),
          siteUrl,
          accountUrl: `${baseUrl}/account/${parsed.data.token}`,
        });
      } catch (e) {
        emailWarning = e instanceof Error ? e.message : String(e);
        console.warn(
          `[build-callback] site-live email failed: ${emailWarning}`,
        );
      }
      // Admin notify — operator wants to know launch day fired.
      await notifyAdmin(env, {
        category: "build",
        subject: `🎉 LAUNCHED — ${prospect.name} is live`,
        body:
          `${prospect.name}'s site has gone live on its launch date.\n\n` +
          `Live URL: ${siteUrl}\n` +
          (emailWarning
            ? `Customer email FAILED: ${emailWarning}\n\n`
            : `Customer emailed (site-live).\n\n`) +
          adminFooter({
            prospectName: prospect.name,
            prospectToken: parsed.data.token,
          }),
      }).catch(() => {});
      return NextResponse.json({
        success: true,
        action: "launched",
        mode: "live",
        customerNotified: !emailWarning,
        emailWarning,
      });
    }

    if (isReviewEditApply) {
      // Sub-case (b): pre-commit auto-apply finished. Customer
      // gets a different email — the live site (their preview
      // Worker) has been updated with their requested edit.
      try {
        await sendCustomerEmail(
          env,
          prospect.email,
          "review-edit-applied",
          {
            customerName: firstName(prospect.name),
            previewUrl: parsed.data.previewUrl,
            hubUrl: `${baseUrl}/onboarding/${parsed.data.token}`,
          },
        );
      } catch (e) {
        emailWarning = e instanceof Error ? e.message : String(e);
        console.warn(
          `[build-callback] review-edit-applied email failed: ${emailWarning}`,
        );
      }
      await notifyAdmin(env, {
        category: "build",
        subject: `LIVE rebuild OK (review-edit) — ${prospect.name}`,
        body:
          `Live build for ${prospect.name} succeeded.\n\n` +
          `Review edit: ${parsed.data.reviewEditId?.slice(0, 8)}…\n` +
          `Live URL: ${parsed.data.previewUrl}\n` +
          (emailWarning
            ? `Customer email FAILED: ${emailWarning}\n\n`
            : `Customer emailed (review-edit-applied).\n\n`) +
          adminFooter({
            prospectName: prospect.name,
            prospectToken: parsed.data.token,
            anchor: `re-${(parsed.data.reviewEditId ?? "").slice(0, 8)}`,
          }),
      }).catch(() => {});
      return NextResponse.json({
        success: true,
        action: "review-edit-applied",
        mode: "live",
        reviewEditId: parsed.data.reviewEditId,
        customerNotified: !emailWarning,
        emailWarning,
      });
    }

    // Sub-case (d): post-commit auto-apply by Cowork (changeRequestId
    // set, no reviewEditId, no finalLaunch). Step6 dispatches mode=live
    // for ALL post-commit changes since 2026-05-15 — preview-then-
    // approve gate was removed in favour of direct apply (matches the
    // operator-Apply path in /admin). Mark the CR resolved + send the
    // customer the "your change is live" email.
    if (parsed.data.changeRequestId && parsed.data.changeRequestId.length > 0) {
      const existingCr = prospect.changeRequests.find(
        (c) => c.id === parsed.data.changeRequestId,
      );
      const alreadyTerminal =
        existingCr &&
        (existingCr.status === "resolved" || existingCr.status === "rejected");
      if (alreadyTerminal) {
        console.log(
          `[build-callback] LIVE build for ${parsed.data.token} cr=${parsed.data.changeRequestId} — CR already ${existingCr.status}, skipping resolve + email (admin/push-through already handled)`,
        );
        return NextResponse.json({
          success: true,
          action: "change-request-already-resolved",
          mode: "live",
          changeRequestId: parsed.data.changeRequestId,
        });
      }
      const merged = await patchChangeRequest(
        prospect.pageId,
        parsed.data.changeRequestId,
        {
          status: "resolved",
          coworkPatchAppliedAt: new Date().toISOString(),
          reply:
            "Applied — your change is now live on your site.",
        },
      );
      if (!merged) {
        return NextResponse.json(
          {
            error: `Change request ${parsed.data.changeRequestId} not found on prospect.`,
          },
          { status: 404 },
        );
      }
      let crEmailWarning: string | null = null;
      try {
        await sendCustomerEmail(
          env,
          prospect.email,
          "change-request-applied-live",
          {
            customerName: firstName(prospect.name),
            originalMessage: merged.message,
            siteUrl: parsed.data.previewUrl,
            accountUrl: `${baseUrl}/account/${parsed.data.token}`,
          },
        );
      } catch (e) {
        crEmailWarning = e instanceof Error ? e.message : String(e);
        console.warn(
          `[build-callback] change-request-applied-live email failed: ${crEmailWarning}`,
        );
      }
      console.log(
        `[build-callback] LIVE auto-apply for ${parsed.data.token} cr=${parsed.data.changeRequestId}`,
      );
      return NextResponse.json({
        success: true,
        action: "change-request-applied-live",
        mode: "live",
        changeRequestId: parsed.data.changeRequestId,
        customerNotified: !crEmailWarning,
        emailWarning: crEmailWarning,
      });
    }

    // Sub-case (a): existing pre-launch / pre-commit preview-ready
    // path — customer hasn't seen their site yet; build complete.
    try {
      await sendCustomerEmail(env, prospect.email, "preview-ready", {
        customerName: firstName(prospect.name),
        previewUrl: parsed.data.previewUrl,
        hubUrl: `${baseUrl}/onboarding/${parsed.data.token}`,
      });
    } catch (e) {
      emailWarning = e instanceof Error ? e.message : String(e);
      console.warn(
        `[build-callback] preview-ready email failed: ${emailWarning}`,
      );
    }
    await notifyAdmin(env, {
      category: "build",
      subject: `LIVE preview ready — ${prospect.name}`,
      body:
        `Customer pre-launch preview built for ${prospect.name}.\n\n` +
        `Preview URL: ${parsed.data.previewUrl}\n` +
        (emailWarning
          ? `Customer email FAILED: ${emailWarning}\n\n`
          : `Customer emailed (preview-ready).\n\n`) +
        adminFooter({
          prospectName: prospect.name,
          prospectToken: parsed.data.token,
        }),
    }).catch(() => {});
    return NextResponse.json({
      success: true,
      action: "previewUrl-stamped",
      mode: "live",
      customerNotified: !emailWarning,
      emailWarning,
    });
  }

  // Mode: PREVIEW build (Phase B v2 — change request preview).
  if (parsed.data.mode === "preview") {
    if (
      !parsed.data.previewUrl ||
      !parsed.data.previewVersionId ||
      !parsed.data.changeRequestId
    ) {
      return NextResponse.json(
        {
          error:
            "preview mode requires previewUrl + previewVersionId + changeRequestId.",
        },
        { status: 400 },
      );
    }

    // Sub-case (b): the workflow's preview-upload step had to fall
    // back to direct-promote-to-live because the customer's CF
    // account has no workers.dev subdomain (so wrangler emitted no
    // preview URL to gate against). The version is already deployed
    // to live; previewUrl is the customer's live URL. Skip the
    // approve-to-promote dance: mark the CR resolved + send "your
    // change is live" instead of "preview ready".
    //
    // This keeps the customer-driven CR pipeline working for the
    // common case of new customer accounts. Customer's safety-gate
    // (preview before approve) becomes "applied immediately" — same
    // promise as the manual /admin Apply button, just without the
    // operator step.
    if (parsed.data.fallbackPromotedToLive === true) {
      const merged = await patchChangeRequest(
        prospect.pageId,
        parsed.data.changeRequestId,
        {
          status: "resolved",
          coworkPatchAppliedAt: new Date().toISOString(),
          // Customer-facing reply — shown both on the dashboard CR
          // list AND copied into the email. Earlier wording leaked
          // implementation detail ("preview-then-approve gate", "no
          // preview subdomain configured"). Keep it short + focused
          // on what the customer cares about: it landed, where, when.
          reply:
            "Done. The change is live on your site now — usually visible in under 30 seconds (hard-refresh if you've still got the old version open).",
        },
      );
      if (!merged) {
        return NextResponse.json(
          {
            error: `Change request ${parsed.data.changeRequestId} not found on prospect.`,
          },
          { status: 404 },
        );
      }

      let emailWarning: string | null = null;
      try {
        await sendCustomerEmail(
          env,
          prospect.email,
          "change-request-applied-live",
          {
            customerName: firstName(prospect.name),
            originalMessage: merged.message,
            siteUrl: parsed.data.previewUrl,
            accountUrl: `${baseUrl}/account/${parsed.data.token}`,
          },
        );
      } catch (e) {
        emailWarning = e instanceof Error ? e.message : String(e);
        console.warn(
          `[build-callback] change-request-applied-live email failed: ${emailWarning}`,
        );
      }
      console.log(
        `[build-callback] PREVIEW fallback → LIVE for ${parsed.data.token} cr=${parsed.data.changeRequestId} (no workers.dev subdomain)`,
      );
      return NextResponse.json({
        success: true,
        action: "preview-fallback-applied-live",
        mode: "preview",
        changeRequestId: parsed.data.changeRequestId,
        customerNotified: !emailWarning,
        emailWarning,
      });
    }

    const merged = await patchChangeRequest(
      prospect.pageId,
      parsed.data.changeRequestId,
      {
        previewVersionId: parsed.data.previewVersionId,
        previewVersionUrl: parsed.data.previewUrl,
        previewBuiltAt: new Date().toISOString(),
        // Persist the preview-access token so the iframe wrapper
        // page can pass it via ?pa= when embedding. Step6 already
        // generated + stored it pre-dispatch, but the callback is
        // the canonical post-build state, and this lets us
        // distinguish "step6 generated a token but the build
        // never finished" from "build complete + preview ready".
        previewAccessToken: parsed.data.previewAccessToken,
      },
    );
    if (!merged) {
      return NextResponse.json(
        {
          error: `Change request ${parsed.data.changeRequestId} not found on prospect.`,
        },
        { status: 404 },
      );
    }
    // Customer email with approve/reject CTAs. Uses the per-request
    // approval token Cowork generated when it stamped the patch.
    // The previewUrl in the email now points to the marketing-site
    // iframe wrapper page (auth-gated, embeds the preview, hides
    // the workers.dev URL) rather than the bare preview Worker URL.
    // That way leaked URLs hit the auth gate instead of opening
    // straight onto the customer's preview content.
    let emailWarning: string | null = null;
    try {
      const accountUrl = `${baseUrl}/account/${parsed.data.token}`;
      const wrapperUrl = `${baseUrl}/account/${parsed.data.token}/preview/${merged.id}`;
      await sendCustomerEmail(
        env,
        prospect.email,
        "change-request-preview-ready",
        {
          customerName: firstName(prospect.name),
          originalMessage: merged.message,
          previewUrl: wrapperUrl,
          approveUrl: `${baseUrl}/account/${parsed.data.token}/approve-change/${merged.id}?t=${merged.customerApprovalToken ?? ""}`,
          rejectUrl: `${baseUrl}/account/${parsed.data.token}/reject-change/${merged.id}?t=${merged.customerApprovalToken ?? ""}`,
          accountUrl,
        },
      );
    } catch (e) {
      emailWarning = e instanceof Error ? e.message : String(e);
      console.warn(
        `[build-callback] preview-ready email failed: ${emailWarning}`,
      );
    }
    await notifyAdmin(env, {
      category: "preview",
      subject: `Cowork built CR preview — ${prospect.name}`,
      body:
        `Cowork built a change-request preview for ${prospect.name}.\n\n` +
        `CR: ${parsed.data.changeRequestId.slice(0, 8)}…\n` +
        `Original ask:\n  "${merged.message}"\n\n` +
        `Preview URL (auth-gated): ${baseUrl}/account/${parsed.data.token}/preview/${merged.id}\n` +
        (emailWarning
          ? `Customer email FAILED: ${emailWarning}\n\n`
          : `Customer emailed (change-request-preview-ready) with approve/reject CTAs.\n\n`) +
        adminFooter({
          prospectName: prospect.name,
          prospectToken: parsed.data.token,
          anchor: `cr-${parsed.data.changeRequestId.slice(0, 8)}`,
        }),
    }).catch(() => {});
    return NextResponse.json({
      success: true,
      action: "preview-stamped",
      mode: "preview",
      customerNotified: !emailWarning,
      emailWarning,
    });
  }

  // Mode: PROMOTE — customer-approved version is now live.
  if (parsed.data.mode === "promote") {
    if (!parsed.data.changeRequestId) {
      return NextResponse.json(
        { error: "promote mode requires changeRequestId." },
        { status: 400 },
      );
    }
    // Flip the change request to resolved with an auto-generated
    // reply. Uses updateChangeRequest so the resolvedAt + transition
    // latch logic stays consistent with the manual operator path.
    let updated;
    try {
      const result = await updateChangeRequest(
        prospect.pageId,
        parsed.data.changeRequestId,
        {
          status: "resolved",
          reply:
            "Done — your change is live. Have a look at your site; if anything's not quite right, hit reply on this thread.",
        },
      );
      updated = result.updated;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[build-callback] resolve-on-promote failed for cr=${parsed.data.changeRequestId}: ${msg}`,
      );
      return NextResponse.json(
        { error: msg },
        { status: 500 },
      );
    }
    let emailWarning: string | null = null;
    try {
      await sendCustomerEmail(
        env,
        prospect.email,
        "change-request-applied-live",
        {
          customerName: firstName(prospect.name),
          originalMessage: updated.message,
          siteUrl: `https://${
            ((prospect.onboardingData ?? {}) as { domain?: { domain?: string } })
              .domain?.domain ?? "your-site.example"
          }/`,
          accountUrl: `${baseUrl}/account/${parsed.data.token}`,
        },
      );
    } catch (e) {
      emailWarning = e instanceof Error ? e.message : String(e);
      console.warn(
        `[build-callback] applied-live email failed: ${emailWarning}`,
      );
    }
    await notifyAdmin(env, {
      category: "build",
      subject: `Promoted CR to live — ${prospect.name}`,
      body:
        `Customer-approved change is now live on ${prospect.name}'s site.\n\n` +
        `CR: ${parsed.data.changeRequestId.slice(0, 8)}…\n` +
        `Original ask:\n  "${updated.message}"\n\n` +
        (emailWarning
          ? `"Applied live" customer email FAILED: ${emailWarning}\n\n`
          : `Customer emailed (change-request-applied-live).\n\n`) +
        adminFooter({
          prospectName: prospect.name,
          prospectToken: parsed.data.token,
          anchor: `cr-${parsed.data.changeRequestId.slice(0, 8)}`,
        }),
    }).catch(() => {});
    return NextResponse.json({
      success: true,
      action: "promote-resolved",
      mode: "promote",
      customerNotified: !emailWarning,
      emailWarning,
    });
  }

  return NextResponse.json(
    { error: `Unknown mode: ${(parsed.data as { mode?: string }).mode}` },
    { status: 400 },
  );
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
