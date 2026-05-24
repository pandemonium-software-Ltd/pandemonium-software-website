// Step 3 — Modules (GBP place_id resolution + first reviews fetch).
//
// Per §4.3 Step 3. Idempotent latches in onboardingData.tools:
//   - gbpPlaceId                 → "place id resolved" latch
//   - gbpModuleReadyEmailSentAt  → "confirmation email sent" latch
//
// Three independent transitions, each gated on its own latch so
// re-running the step is always safe:
//
//   A. resolve place_id (URL parse first, text-search fallback)
//   B. seed first reviews snapshot into D1
//   C. send the "your Google reviews are connected" email
//
// shouldRun stays true until B has written AND C has been latched.
// Cal.com URL validation (the other module captured by Step 3) is
// a no-op for now — we trust the URL the customer pastes and
// surface broken links at site-render time instead.

import type { Step } from "../types";
import {
  extractPlaceIdFromMapsUrl,
  findPlaceByQuery,
  fetchPlaceDetails,
  PlacesApiError,
} from "../../lib/google-places";
import { upsertSnapshot } from "../../lib/d1-gbp";
import { updateProspectOnboarding } from "../../lib/notion-prospects";
import { sendCustomerEmail } from "../notify";
import type { D1Database } from "../../lib/d1-analytics";

/** Subset of onboardingData.tools we read + write. Everything else
 *  in `tools` (calcomUrl, resendEmail, etc.) is passed through
 *  untouched on save. */
type ToolsSlice = {
  gbpUrl?: string;
  gbpManagerInvited?: boolean;
  /** Set by phase A. Stable Google place_id — same shape we store
   *  in the D1 PK. Once set, phase A is skipped on every tick. */
  gbpPlaceId?: string;
  /** ISO-8601 — set by phase C after the confirmation email goes
   *  out. Once set, phase C is skipped on every tick. */
  gbpModuleReadyEmailSentAt?: string;
  /** ISO-8601 — set when an error occurs in phase A so we don't
   *  hammer the Places API every minute. Cleared on next success. */
  gbpResolutionFailedAt?: string;
  /** Reason for the most recent phase-A failure, surfaced to /admin. */
  gbpResolutionError?: string;
};

export const step3Tools: Step = {
  id: "step3",
  shouldRun: (p) => {
    if (!p.onboardingStep3Done) return false;
    if (!p.moduleSelections.includes("Google Business Profile Setup/Audit")) {
      return false;
    }
    const tools = readToolsSlice(p.onboardingData);
    // Customer hasn't completed the Hub-side actions yet — bail.
    if (!tools.gbpUrl) return false;
    if (!tools.gbpManagerInvited) return false;
    // Either latch missing = still work to do.
    if (!tools.gbpPlaceId) return true;
    if (!tools.gbpModuleReadyEmailSentAt) return true;
    return false;
  },
  async run(prospect, env, ctx) {
    // The reviews D1 binding lives on the scheduled-handler `env`,
    // not `process.env`. Step ctx exposes it as `d1` (see types.ts
    // change in this commit). Without it phase B can't seed.
    const db = ctx?.d1;
    const apiKey = env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return {
        status: "skip",
        reason: "GOOGLE_PLACES_API_KEY not set — set via wrangler secret put",
      };
    }
    if (!db) {
      return {
        status: "skip",
        reason:
          "pandemonium_analytics D1 binding missing — step3 needs it to seed gbp_reviews",
      };
    }

    const tools = readToolsSlice(prospect.onboardingData);
    const gbpUrl = (tools.gbpUrl ?? "").trim();
    if (!gbpUrl) {
      return { status: "skip", reason: "tools.gbpUrl empty" };
    }

    const events: string[] = [];

    // ---------- A. Resolve place_id (latch: tools.gbpPlaceId) ----------
    let placeId = tools.gbpPlaceId;
    let resolvedThisTick = false;
    if (!placeId) {
      try {
        placeId = extractPlaceIdFromMapsUrl(gbpUrl) ?? undefined;
        if (!placeId) {
          // Fallback — text-search using business name + location.
          // Most pasted Google Maps share URLs don't carry an
          // explicit place_id, so this is the common path.
          const query = buildSearchQuery(prospect.name, prospect.onboardingData);
          placeId = await findPlaceByQuery(query, apiKey);
          events.push(`resolved place_id via text-search "${query}"`);
        } else {
          events.push("resolved place_id from URL");
        }
        await writeToolsSlice(prospect.pageId, prospect.onboardingData, {
          gbpPlaceId: placeId,
          gbpResolutionFailedAt: undefined,
          gbpResolutionError: undefined,
        });
        resolvedThisTick = true;
      } catch (e) {
        const msg = e instanceof PlacesApiError ? e.message : String(e);
        await writeToolsSlice(prospect.pageId, prospect.onboardingData, {
          gbpResolutionFailedAt: new Date().toISOString(),
          gbpResolutionError: msg,
        });
        throw new Error(`step3 place_id resolution failed: ${msg}`);
      }
    }

    // ---------- B. Seed first reviews snapshot ----------
    // Idempotent — INSERT OR REPLACE on the gbp_reviews PK. Runs
    // every tick until phase C latches, so a transient Places API
    // failure on the first attempt self-heals on the next tick.
    if (placeId && !tools.gbpModuleReadyEmailSentAt) {
      try {
        const snapshot = await fetchPlaceDetails(placeId, apiKey);
        await upsertSnapshot(db, {
          token: prospect.token,
          placeId,
          snapshot,
        });
        events.push(
          `seeded reviews snapshot (rating ${snapshot.rating ?? "—"}, ${snapshot.topReviews.length} reviews)`,
        );
      } catch (e) {
        // Don't latch phase C until we have at least one successful
        // fetch — the confirmation email promises live data.
        const msg = e instanceof PlacesApiError ? e.message : String(e);
        throw new Error(`step3 reviews fetch failed: ${msg}`);
      }
    }

    // ---------- C. Confirmation email (latch: tools.gbpModuleReadyEmailSentAt) ----------
    let emailSentThisTick = false;
    if (!tools.gbpModuleReadyEmailSentAt) {
      const domain = readDomain(prospect.onboardingData) ?? "your site";
      await sendCustomerEmail(env, prospect.email, "gbp-module-ready", {
        customerName: prospect.name,
        domain,
      });
      await writeToolsSlice(prospect.pageId, prospect.onboardingData, {
        gbpModuleReadyEmailSentAt: new Date().toISOString(),
      });
      emailSentThisTick = true;
      events.push("sent gbp-module-ready email");
    }

    if (events.length === 0) {
      events.push("already done — nothing to do");
    }
    return {
      status: "ok",
      notes: `GBP place ${placeId ?? "—"} — ${events.join("; ")}${resolvedThisTick || emailSentThisTick ? "" : ""}`,
    };
  },
};

// ---------- helpers ----------

function readToolsSlice(onboardingData: unknown): ToolsSlice {
  if (!onboardingData || typeof onboardingData !== "object") return {};
  const data = onboardingData as { tools?: unknown };
  if (!data.tools || typeof data.tools !== "object") return {};
  return data.tools as ToolsSlice;
}

function readDomain(onboardingData: unknown): string | undefined {
  if (!onboardingData || typeof onboardingData !== "object") return undefined;
  const data = onboardingData as { domain?: unknown };
  if (!data.domain || typeof data.domain !== "object") return undefined;
  const d = data.domain as { domain?: unknown };
  return typeof d.domain === "string" ? d.domain : undefined;
}

/** Build a text-search query Google can resolve back to a place.
 *  Business name + location is enough in practice — Phase 3 intake
 *  always captures location, and Google's text search is forgiving. */
function buildSearchQuery(
  businessName: string,
  onboardingData: unknown,
): string {
  const ob =
    onboardingData && typeof onboardingData === "object"
      ? (onboardingData as Record<string, unknown>)
      : {};
  const business = (ob.business ?? {}) as Record<string, unknown>;
  const location =
    typeof business.location === "string" ? business.location : "";
  return location ? `${businessName}, ${location}` : businessName;
}

/** Read the existing onboardingData blob, merge a tools-slice patch,
 *  and write it back. Non-tools keys (domain, brand, content, etc.)
 *  are preserved verbatim. */
async function writeToolsSlice(
  pageId: string,
  currentOnboarding: unknown,
  patch: Partial<ToolsSlice>,
): Promise<void> {
  const current =
    currentOnboarding && typeof currentOnboarding === "object"
      ? (currentOnboarding as Record<string, unknown>)
      : {};
  const existingTools =
    current.tools && typeof current.tools === "object"
      ? (current.tools as Record<string, unknown>)
      : {};
  // Explicit-undefined keys in patch CLEAR the field (so the
  // "failure cleared on success" path actually clears).
  const mergedTools: Record<string, unknown> = { ...existingTools };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      delete mergedTools[k];
    } else {
      mergedTools[k] = v;
    }
  }
  await updateProspectOnboarding(pageId, {
    data: { ...current, tools: mergedTools },
  });
}
