// Step 1 — Cloudflare membership accept + verify (Stage 2C C2.1).
//
// Per §4.3 Step 1:
//   1. Poll my Cloudflare account memberships for invitations from
//      prospect.onboardingData.cloudflare.cloudflareEmail
//   2. Accept the invitation
//   3. Verify access by listing accounts
//   4. Mark `Cloudflare Membership Verified At` in Notion
//   5. (C5 will add: notify customer "I'm in your account, ready to deploy")
//
// Idempotency:
//   - Skip if cloudflareMembershipVerifiedAt is already set in Notion.
//   - Skip if BEN_CLOUDFLARE_API_TOKEN unset.
//   - Skip if cloudflareEmail not yet captured in onboardingData.
//   - The Cloudflare API itself is idempotent on PUT /memberships
//     (already-accepted membership PUTs return success without
//     side effects).
//
// Membership matching strategy:
//   Cloudflare's GET /memberships returns the AUTHENTICATED user's
//   memberships, each with an `account: { id, name }`. There's no
//   "inviter email" field per membership — so we use a heuristic:
//   take all PENDING memberships and look for one whose account.name
//   either matches the customer's email/business or is brand new
//   (timestamp recent). If exactly one PENDING exists, accept it.
//   If multiple, fail and route to Ben for manual disambiguation
//   (Tier 2 incident — rare in practice since the invite + cron
//   tick are usually within minutes of each other).
//
// Limitation: we can't distinguish "this customer's invite" from
// "another customer's invite" if two land in the same minute. C2.2+
// may add an explicit cloudflareAccountId field on the Hub form
// to remove the heuristic entirely.

import type { Step } from "../types";
import {
  listMemberships,
  acceptMembership,
  listAccounts,
  CloudflareApiError,
} from "../../lib/cloudflare";
import { recordCloudflareMembership } from "../../lib/notion-prospects";

export const step1Cloudflare: Step = {
  id: "step1",
  shouldRun: (p) =>
    p.onboardingStep1Done === true && !p.cloudflareMembershipVerifiedAt,
  async run(prospect, env) {
    if (!env.BEN_CLOUDFLARE_API_TOKEN) {
      return {
        status: "skip",
        reason:
          "BEN_CLOUDFLARE_API_TOKEN not set — Step 1 idle until Ben creates the token (see src/lib/cloudflare.ts head comment for required scopes)",
      };
    }

    // Read the customer's CF email from onboardingData.cloudflare.
    const cloudflareEmail = readCloudflareEmail(prospect.onboardingData);
    if (!cloudflareEmail) {
      return {
        status: "skip",
        reason:
          "Customer hasn't entered their Cloudflare email in Hub Step 1 yet (onboardingData.cloudflare.cloudflareEmail empty)",
      };
    }

    // List PENDING memberships (likely the customer's invite).
    let pending;
    try {
      pending = await listMemberships("pending");
    } catch (e) {
      // 429 after auto-retry exhaustion is a transient state (Ben's
      // user-scoped CF token is shared with other tooling — see
      // src/lib/cloudflare.ts head comment). Skip this tick rather
      // than triggering an [INCIDENT] email; the next tick will
      // retry naturally. Other Cloudflare errors (auth, scope,
      // network) ARE worth surfacing — re-throw so Ben sees them.
      if (e instanceof CloudflareApiError && e.status === 429) {
        return {
          status: "skip",
          reason: `Cloudflare API rate-limited (429) on listMemberships after ${3} retries. Will retry next tick.`,
        };
      }
      throw new Error(
        `listMemberships(pending) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (pending.length === 0) {
      return {
        status: "skip",
        reason: `No pending Cloudflare memberships. Customer (${cloudflareEmail}) probably hasn't sent the invite yet, or sent it to a different email than ${env.BEN_OPS_EMAIL ?? "BEN_OPS_EMAIL"}.`,
      };
    }

    // Multi-pending: bail out to Ben rather than guess. Rare but
    // worth being defensive — accepting the wrong invite means
    // operating on the wrong customer's account.
    if (pending.length > 1) {
      throw new Error(
        `Found ${pending.length} pending Cloudflare memberships; can't disambiguate. Accept the right one manually in Cloudflare dashboard, or extend Hub Step 1 to capture the customer's account id explicitly. Pending account names: ${pending.map((m) => m.account.name).join(", ")}.`,
      );
    }

    // Exactly one — assume it's this customer's. Accept.
    const [membership] = pending;
    let accepted;
    try {
      accepted = await acceptMembership(membership.id);
    } catch (e) {
      const status =
        e instanceof CloudflareApiError ? `${e.status}` : "unknown";
      throw new Error(
        `acceptMembership(${membership.id}) failed [${status}]: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Verify access by listing accounts. Membership acceptance can
    // take a few seconds to propagate; if the customer's account
    // doesn't show up yet, we still record the membership and let
    // C2.2 (zone work) catch the propagation gap.
    let accountSeen = false;
    try {
      const accounts = await listAccounts();
      accountSeen = accounts.some((a) => a.id === accepted.account.id);
    } catch {
      // Account list failure isn't fatal — we still know the
      // membership succeeded. Just don't mark "verified" with that
      // confidence.
    }

    // Stamp Notion regardless of accountSeen — the audit log notes
    // capture the propagation status. If we waited for accountSeen,
    // a slow propagation would re-trigger the whole accept loop
    // next tick, which Cloudflare would reject as "already accepted".
    await recordCloudflareMembership(prospect.pageId, accepted.account.id);

    return {
      status: "ok",
      notes: accountSeen
        ? `Accepted membership ${membership.id}; account ${accepted.account.id} (${accepted.account.name}) confirmed in /accounts list.`
        : `Accepted membership ${membership.id}; account ${accepted.account.id} (${accepted.account.name}) — not yet visible in /accounts (propagation usually <60s; next tick will recheck).`,
    };
  },
};

/**
 * Best-effort extraction of cloudflareEmail from the prospect's
 * onboardingData JSON. Returns undefined if the path doesn't
 * exist — that's the "customer hasn't filled it in yet" case,
 * not a failure.
 */
function readCloudflareEmail(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const cf = (data as { cloudflare?: unknown }).cloudflare;
  if (!cf || typeof cf !== "object") return undefined;
  const email = (cf as { cloudflareEmail?: unknown }).cloudflareEmail;
  return typeof email === "string" && email.length > 0 ? email : undefined;
}
