// Step 6 — Change-request follow-up reminder.
//
// Stage 2C C5.7 Phase B v1: scans the prospect's change-request
// inbox each tick. For any request that has been `pending` for
// more than ESCALATION_AGE_MS without operator action AND hasn't
// been escalated by Cowork yet, send Ben a short follow-up email
// with a one-click reply link.
//
// Why this matters: the on-submit notification fires from
// /api/account/change-request the moment the customer submits.
// If Ben misses that email (gmail filters, busy day), there's no
// second prompt — the request just sits there. This step is the
// nag mechanism so requests don't fall through the cracks.
//
// Phase B v2 (PARKED — see docs/STAGE-2C-C5.7-CHANGE-REQUEST-AUTOMATION.md):
// this step grows to call Haiku for classification + (where
// confidence is high) auto-apply the change. For now it's a pure
// reminder mechanism — no AI, no patches, no risk of a bad apply.
//
// shouldRun: only true when the prospect has at least one pending
// request older than ESCALATION_AGE_MS that hasn't been escalated.
// Cheap predicate that filters out 95%+ of prospects per tick.

import type { Step } from "../types";
import {
  markChangeRequestEscalated,
  type ChangeRequest,
  type ProspectRecord,
} from "../../lib/notion-prospects";
import {
  sendInternalNotification,
  type NotificationPayload,
} from "../../lib/email";

/** A pending request must be at least this old before we
 *  escalate. 2 hours covers the common case (Ben replies
 *  same-day) without spamming on rapid-fire submissions. */
const ESCALATION_AGE_MS = 2 * 60 * 60 * 1000;

/** Cap how many requests we escalate per tick to prevent a burst
 *  from flooding Ben's inbox. If a single tick has 10+ pending
 *  requests, that's a signal Ben needs to do a focused session
 *  rather than receive 10 emails. */
const MAX_ESCALATIONS_PER_TICK = 5;

export const step6ChangeRequests: Step = {
  id: "step6",
  shouldRun(prospect) {
    return findEscalatable(prospect).length > 0;
  },
  async run(prospect, env) {
    const escalatable = findEscalatable(prospect).slice(
      0,
      MAX_ESCALATIONS_PER_TICK,
    );
    if (escalatable.length === 0) {
      return { status: "skip", reason: "Nothing to escalate" };
    }

    const baseUrl =
      // process.env present in Workers via compatibility flag; fall
      // back to the prod marketing-site URL so a dev-env miss
      // doesn't produce a broken URL in Ben's inbox.
      process.env.NEXT_PUBLIC_SITE_URL ??
      "https://modu-forge.co.uk";

    const sentIds: string[] = [];
    const failures: { id: string; reason: string }[] = [];

    for (const cr of escalatable) {
      const ageH = Math.floor(
        (Date.now() - Date.parse(cr.submittedAt)) / (60 * 60 * 1000),
      );
      const adminDeepLink = `${baseUrl}/admin/${prospect.token}#cr-${cr.id}`;
      const notif: NotificationPayload = {
        subject: `[CHANGE REQUEST · still pending] ${prospect.name}${prospect.business ? ` (${prospect.business})` : ""} · ${ageH}h old`,
        body:
          `Reminder: a change request from ${prospect.name}${prospect.business ? ` at ${prospect.business}` : ""} has been waiting ${ageH} hours.\n\n` +
          `--- Their request ---\n${cr.message}\n--- End ---\n\n` +
          `Reply with one click:\n${adminDeepLink}\n\n` +
          `(Cowork sent the original notification when this landed; this is the follow-up so it doesn't get missed. Future iterations will classify + auto-apply where possible — see docs/STAGE-2C-C5.7-CHANGE-REQUEST-AUTOMATION.md.)\n\n` +
          `— Cowork`,
      };
      const emailErr = await sendInternalNotification(notif);
      if (emailErr) {
        failures.push({ id: cr.id, reason: `email failed: ${emailErr}` });
        continue;
      }
      // Stamp BEFORE we move on to the next so a partial run
      // doesn't double-email on the next tick. Even if the stamp
      // fails, the email already went out — at most one duplicate
      // on the next tick.
      try {
        await markChangeRequestEscalated(prospect.pageId, cr.id);
        sentIds.push(cr.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({
          id: cr.id,
          reason: `email sent but stamp failed: ${msg}`,
        });
      }
    }

    if (sentIds.length === 0 && failures.length > 0) {
      throw new Error(
        `All ${failures.length} escalation attempts failed: ${failures
          .map((f) => `${f.id}: ${f.reason}`)
          .join("; ")}`,
      );
    }

    const note =
      `Escalated ${sentIds.length} pending change request(s) to Ben` +
      (failures.length > 0
        ? ` (with ${failures.length} failure${failures.length === 1 ? "" : "s"}: ${failures.map((f) => f.id.slice(0, 8)).join(", ")})`
        : "");
    return { status: "ok", notes: note };
  },
};

/**
 * Pull change requests that should be escalated this tick:
 *   - status = "pending"
 *   - submittedAt > ESCALATION_AGE_MS ago
 *   - coworkEscalatedAt absent (haven't already nudged)
 *
 * Sorted oldest-first so Ben sees the most overdue requests at
 * the top of his inbox.
 */
function findEscalatable(prospect: ProspectRecord): ChangeRequest[] {
  const now = Date.now();
  return prospect.changeRequests
    .filter((cr) => cr.status === "pending")
    .filter((cr) => !cr.coworkEscalatedAt)
    .filter((cr) => {
      const submitted = Date.parse(cr.submittedAt);
      if (!Number.isFinite(submitted)) return false;
      return now - submitted >= ESCALATION_AGE_MS;
    })
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}
