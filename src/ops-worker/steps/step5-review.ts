// Step 5 — Review & launch.
//
// Stage 2C C5.4 — Phase A: trigger customer-site preview build via
// GitHub Actions repository_dispatch. The Action runs the actual
// build + deploy + calls /api/internal/build-callback to stamp the
// preview URL in Notion (which then sends the customer email).
//
// shouldRun gates on:
//   - workerName + cloudflareAccountId (Step 1 + 2 must be done)
//   - previewSubmittedAt set (customer requested preview)
//   - previewUrl absent (build hasn't completed yet)
//   - previewBuildTriggeredAt absent OR older than the cooldown
//     window (anti-spam — don't re-trigger every cron tick while
//     the Action is still running, which can take 3-5 min)
//
// run() POSTs to GitHub's repository_dispatch endpoint with the
// prospect's token + minimal deploy metadata. Stamps "Preview Build
// Triggered At" in Notion as the latch. The Action is then on the
// hook; build-callback updates Notion when done.
//
// Phase B (Stage 2C C5.9 — go-live): same step, different trigger
// (status = "Onboarding Complete" + go-live date reached). Not yet
// built — TODO at the bottom.

import type { Step } from "../types";
import {
  markPreviewBuildTriggered,
  clearPreviewBuildTriggered,
  type ProspectRecord,
} from "../../lib/notion-prospects";
import { dispatchRepositoryEvent, GithubApiError } from "../../lib/github";

/** Cooldown between build-trigger attempts. The customer-site build
 *  workflow takes ~3-5 minutes; we wait 15 to give it slack +
 *  cover the build-callback round-trip + Notion read lag on the
 *  next tick. After 15 min with no callback, we'll re-trigger. */
const BUILD_RETRY_COOLDOWN_MS = 15 * 60 * 1000;

export const step5Review: Step = {
  id: "step5",
  shouldRun(prospect) {
    if (!prospect.workerName) return false;
    if (!prospect.cloudflareAccountId) return false;
    if (!readPreviewSubmittedAt(prospect)) return false;
    if (readPreviewUrl(prospect)) return false;
    // Anti-spam: don't re-trigger if a build was triggered recently.
    const triggeredAt = prospect.previewBuildTriggeredAt;
    if (triggeredAt) {
      const elapsed = Date.now() - Date.parse(triggeredAt);
      if (Number.isFinite(elapsed) && elapsed < BUILD_RETRY_COOLDOWN_MS) {
        return false;
      }
    }
    return true;
  },
  async run(prospect, env) {
    if (!env.GITHUB_TOKEN) {
      return {
        status: "skip",
        reason:
          "GITHUB_TOKEN not set — preview build pipeline idle until token is configured (see docs/STAGE-2C-C5-PLAN.md C5.4)",
      };
    }
    if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return {
        status: "skip",
        reason:
          "GITHUB_OWNER + GITHUB_REPO must both be set to dispatch the build workflow",
      };
    }
    if (!prospect.workerName || !prospect.cloudflareAccountId) {
      return {
        status: "skip",
        reason:
          "Step 1/2 prerequisites missing (worker name or Cloudflare account id)",
      };
    }

    // M-12: Stamp latch BEFORE dispatch so a crash between dispatch
    // and latch-write doesn't cause re-triggers every tick. If
    // dispatch fails, we clear the latch so the next tick retries.
    try {
      await markPreviewBuildTriggered(prospect.pageId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Can't stamp the latch — abort before dispatching to avoid
      // an un-latched dispatch that would re-trigger every tick.
      throw new Error(
        `[step5-review] couldn't stamp Preview Build Triggered At (pre-dispatch): ${msg}. ` +
          `Aborting dispatch to prevent re-trigger loop.`,
      );
    }

    // Fire the dispatch event. The workflow's `event_type` filter
    // must match exactly — see .github/workflows/customer-site-build.yml.
    try {
      await dispatchRepositoryEvent({
        token: env.GITHUB_TOKEN,
        owner: env.GITHUB_OWNER,
        repo: env.GITHUB_REPO,
        eventType: "customer-site-build",
        clientPayload: {
          token: prospect.token,
          // Op-context for the Action's logs — not load-bearing,
          // just makes the workflow run name more diagnosable.
          prospectName: prospect.name,
          businessName: prospect.business ?? "",
        },
      });
    } catch (e) {
      // Dispatch failed — clear the latch so the next tick retries.
      try {
        await clearPreviewBuildTriggered(prospect.pageId);
      } catch {
        console.error(
          `[step5-review] dispatch failed AND couldn't clear latch — may need manual intervention`,
        );
      }
      const msg =
        e instanceof GithubApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      throw new Error(
        `dispatchRepositoryEvent failed: ${msg}. ` +
          `Check GITHUB_TOKEN scope (needs repo or workflow), ` +
          `GITHUB_OWNER (${env.GITHUB_OWNER}), GITHUB_REPO (${env.GITHUB_REPO}), ` +
          `and that .github/workflows/customer-site-build.yml exists on the default branch.`,
      );
    }

    return {
      status: "ok",
      notes: `Dispatched customer-site-build workflow for ${prospect.workerName}; awaiting build-callback.`,
    };
  },
};

// ---------- Helpers ----------

function readPreviewSubmittedAt(p: ProspectRecord): string | undefined {
  const r = ((p.onboardingData ?? {}) as {
    review?: { previewSubmittedAt?: string };
  }).review;
  return r?.previewSubmittedAt;
}

function readPreviewUrl(p: ProspectRecord): string | undefined {
  const r = ((p.onboardingData ?? {}) as { review?: { previewUrl?: string } })
    .review;
  return r?.previewUrl;
}

// TODO Stage 2C C5.9 — Phase B (go-live):
//   - Add a separate Step (or extend shouldRun) that triggers when
//     status = "Onboarding Complete" + go-live date reached + finalSignOff true.
//   - Same dispatch path; the Action treats it as a production build
//     (passing a flag in client_payload).
//   - Status flips to "Live" via build-callback; siteLiveAt re-stamped.
