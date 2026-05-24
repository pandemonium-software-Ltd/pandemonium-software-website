// Daily GBP reviews refresh tick.
//
// Triggered by the "30 2 * * *" cron entry in wrangler-ops.jsonc
// (30 min after the analytics tick — keeps the two cron loads
// from stacking on the same minute).
//
// For every customer with a resolved gbpPlaceId in onboardingData.tools:
//   1. Call Places API v1 Details to fetch rating + top reviews.
//   2. INSERT OR REPLACE into the gbp_reviews D1 table.
//
// Errors per-customer are caught + recorded as last_error in D1 (so
// the customer dashboard can surface "couldn't refresh — Google
// returned 404 yesterday"). The loop continues to the next customer.
// We don't write Notion exception entries — refresh failures are
// transient (rate limit / outage) and self-heal on the next run.

import { getServerEnv } from "../lib/env";
import { listProspectsNeedingOps } from "../lib/notion-prospects";
import { fetchPlaceDetails, PlacesApiError } from "../lib/google-places";
import { upsertSnapshot, type GbpReviewsRow } from "../lib/d1-gbp";
import type { D1Database } from "../lib/d1-analytics";
import type { ProspectRecord } from "../lib/notion-prospects";

export async function runGbpReviewsTick(args: {
  db: D1Database;
}): Promise<void> {
  const tickId = new Date().toISOString();
  console.log(`[gbp-reviews:${tickId}] starting`);

  const env = getServerEnv();
  if (!env.GOOGLE_PLACES_API_KEY) {
    console.warn(
      `[gbp-reviews:${tickId}] GOOGLE_PLACES_API_KEY not set — skipping (run \`wrangler secret put GOOGLE_PLACES_API_KEY --config wrangler-ops.jsonc\`)`,
    );
    return;
  }

  let prospects: ProspectRecord[];
  try {
    prospects = await listProspectsNeedingOps();
  } catch (e) {
    console.error(
      `[gbp-reviews:${tickId}] failed to list prospects: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  // Targets = anyone with a resolved place_id. Includes
  // Onboarding Complete (post-step3) and Live customers; excludes
  // anyone who hasn't yet got past step3-tools. We keep the
  // refresh cheap (~1 API call per target, ~$0.005 each at v1
  // pricing) so there's no value gating further on status.
  const targets = prospects
    .map((p) => ({ prospect: p, placeId: readPlaceId(p) }))
    .filter((t): t is { prospect: ProspectRecord; placeId: string } => !!t.placeId);
  console.log(
    `[gbp-reviews:${tickId}] ${targets.length} customer(s) with resolved place_id`,
  );

  let ok = 0;
  let failed = 0;
  for (const { prospect, placeId } of targets) {
    try {
      const snapshot = await fetchPlaceDetails(
        placeId,
        env.GOOGLE_PLACES_API_KEY,
      );
      await upsertSnapshot(args.db, {
        token: prospect.token,
        placeId,
        snapshot,
      });
      ok++;
    } catch (e) {
      const msg = e instanceof PlacesApiError ? e.message : String(e);
      console.error(
        `[gbp-reviews:${tickId}] ${prospect.token} (${prospect.name}) — ${msg}`,
      );
      // Best-effort: record the failure into D1 so the dashboard
      // can surface it. If THIS write fails too, log and move on.
      try {
        await args.db
          .prepare(
            `UPDATE gbp_reviews
                SET last_error = ?, fetched_at = ?
              WHERE token = ?`,
          )
          .bind(msg, new Date().toISOString(), prospect.token)
          .run();
      } catch {
        /* ignore — already logged the original failure */
      }
      failed++;
    }
  }

  console.log(
    `[gbp-reviews:${tickId}] complete — ok=${ok}, failed=${failed}`,
  );
}

/** Lift the resolved place_id out of onboardingData.tools, or
 *  null when the customer hasn't completed step3-tools yet. */
function readPlaceId(prospect: ProspectRecord): string | null {
  const ob = prospect.onboardingData;
  if (!ob || typeof ob !== "object") return null;
  const tools = (ob as { tools?: unknown }).tools;
  if (!tools || typeof tools !== "object") return null;
  const pid = (tools as { gbpPlaceId?: unknown }).gbpPlaceId;
  return typeof pid === "string" && pid.length > 0 ? pid : null;
}

/** Re-export so /admin can read the same row shape the public
 *  API returns. No business logic here — just a passthrough. */
export type { GbpReviewsRow };
