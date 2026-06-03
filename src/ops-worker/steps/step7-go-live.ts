// Step 7 — Go live.
//
// Fires when a signed-off customer reaches their chosen go-live
// date. Dispatches a fresh customer-site-build with finalLaunch=true
// so the build callback knows to flip status to "Live" + send the
// "you're live" email.
//
// shouldRun gates on:
//   - status = "Onboarding Complete" (customer signed off, hub locked)
//   - goLiveDate has been reached (today UK or earlier)
//   - workerName + cloudflareAccountId (the per-customer Worker
//     exists — step1+step2 prerequisites)
//   - finalLaunchTriggeredAt absent OR older than the cooldown
//     window (anti-spam latch — don't re-trigger every 5 min while
//     the Action is still running)
//
// Why a separate step from step5-review:
//   - step5 dispatches the FIRST build (preview the customer
//     reviews); finalLaunchTriggeredAt is its own latch so the two
//     pipelines can be diagnosed independently in /admin.
//   - shouldRun conditions are different (status + date check vs.
//     previewSubmittedAt check).
//   - Build callback treats them differently (preview just stamps
//     the URL; finalLaunch flips status + sends launch email).
//
// What "go-live day" actually does: the customer's per-customer
// Worker is already bound to their domain via step2-domain (Worker
// route pattern `<hostname>/*`). It's been serving their finalised
// content since the last review-edit rebuild (or sign-off rebuild).
// This step is the moment of public visibility commitment: we
// dispatch one clean production build, flip status, stamp Site
// Live At, and send the customer the "you're live" announcement.

import type { Step } from "../types";
import {
  markFinalLaunchTriggered,
  clearFinalLaunchTriggered,
  type ProspectRecord,
} from "../../lib/notion-prospects";
import { dispatchRepositoryEvent, GithubApiError } from "../../lib/github";

/** Same 15-minute window as the preview-build latch. The Action
 *  takes ~3 minutes; we wait 15 to give it slack + cover the
 *  callback round-trip + Notion read lag on the next tick. After
 *  15 min with no callback, we'll re-trigger. */
const FINAL_LAUNCH_COOLDOWN_MS = 15 * 60 * 1000;

export const step7GoLive: Step = {
  id: "step7",
  shouldRun(prospect) {
    if (prospect.status !== "Onboarding Complete") return false;
    if (!prospect.workerName) return false;
    if (!prospect.cloudflareAccountId) return false;
    if (!prospect.goLiveDate) return false;
    if (!isLaunchDayReached(prospect.goLiveDate)) return false;
    // Anti-spam: don't re-trigger if a build was triggered recently.
    const triggered = prospect.finalLaunchTriggeredAt;
    if (triggered) {
      const elapsed = Date.now() - Date.parse(triggered);
      if (Number.isFinite(elapsed) && elapsed < FINAL_LAUNCH_COOLDOWN_MS) {
        return false;
      }
    }
    return true;
  },
  async run(prospect, env) {
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return {
        status: "skip",
        reason:
          "GITHUB_TOKEN / OWNER / REPO not set — go-live dispatch idle",
      };
    }
    if (!prospect.workerName || !prospect.cloudflareAccountId) {
      return {
        status: "skip",
        reason: "Step 1/2 prerequisites missing — go-live dispatch skipped",
      };
    }

    // M-12: Stamp latch BEFORE dispatch so a crash between dispatch
    // and latch-write doesn't cause re-triggers every tick. If
    // dispatch fails, clear the latch so the next tick retries.
    try {
      await markFinalLaunchTriggered(prospect.pageId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `[step7-go-live] couldn't stamp Final Launch Triggered At (pre-dispatch): ${msg}. ` +
          `Aborting dispatch to prevent re-trigger loop.`,
      );
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
          mode: "live",
          finalLaunch: true,
        },
      });
    } catch (e) {
      // Dispatch failed — clear the latch so the next tick retries.
      try {
        await clearFinalLaunchTriggered(prospect.pageId);
      } catch {
        console.error(
          `[step7-go-live] dispatch failed AND couldn't clear latch — may need manual intervention`,
        );
      }
      const msg =
        e instanceof GithubApiError
          ? `${e.message} (HTTP ${e.status})`
          : e instanceof Error
            ? e.message
            : String(e);
      console.error(
        `[step7-go-live:${prospect.token.slice(0, 8)}] dispatch FAILED: ${msg}. ` +
          `Token scope check: classic PAT needs 'repo'; fine-grained needs 'Actions: write' + 'Contents: read'. ` +
          `Owner=${env.GITHUB_OWNER} Repo=${env.GITHUB_REPO}`,
      );
      throw new Error(`go-live dispatch failed: ${msg}`);
    }

    return {
      status: "ok",
      notes: `Dispatched final-launch build for ${prospect.workerName}; awaiting callback to flip status → Live.`,
    };
  },
};

/** True when the customer's chosen go-live date is today (UK) or
 *  earlier. Date stored in Notion as "YYYY-MM-DD" (calendar date,
 *  no time component). We compare against today's UK calendar
 *  date string — the cron runs every 5 minutes so the first tick
 *  on launch morning will fire it.
 *
 *  Using UK time deliberately: the customer picks their go-live
 *  in their own UK calendar, not UTC. A late-night UK booking
 *  shouldn't trigger early in UTC. */
function isLaunchDayReached(goLiveDate: string): boolean {
  // Goal: produce "YYYY-MM-DD" of TODAY in Europe/London. The
  // cron runs in UTC; in winter that's the same calendar date as
  // London (BST=UTC, GMT=UTC); in summer London is UTC+1 so after
  // midnight UTC we're already on the next London date by 00:00
  // London. en-GB locale + Europe/London timezone gives DD/MM/YYYY
  // — we re-arrange to YYYY-MM-DD for the lexicographic compare.
  const todayLondon = new Date().toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-GB → "11/05/2026"
  const [d, m, y] = todayLondon.split("/");
  if (!d || !m || !y) {
    // Defensive — if formatting changes upstream, default to NOT
    // firing rather than firing on the wrong day.
    return false;
  }
  const today = `${y}-${m}-${d}`;
  return goLiveDate <= today;
}

// Exported for testing.
export const __test = { isLaunchDayReached };
