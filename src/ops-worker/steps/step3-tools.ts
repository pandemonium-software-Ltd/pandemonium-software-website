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
  parseMapsUrl,
  resolveMapsShortUrl,
  findPlaceByQuery,
  fetchPlaceDetails,
  PlacesApiError,
  type PlaceDetailsSnapshot,
} from "../../lib/google-places";
import { upsertSnapshot } from "../../lib/d1-gbp";
import { updateProspectOnboarding } from "../../lib/notion-prospects";
import { sendCustomerEmail } from "../notify";
import type { D1Database } from "../../lib/d1-analytics";

/** Subset of onboardingData.tools we read + write. Everything else
 *  in `tools` (calcomUrl, resendEmail, etc.) is passed through
 *  untouched on save. */
export type ToolsSlice = {
  gbpUrl?: string;
  gbpManagerInvited?: boolean;
  /** Set by phase A. Stable Google place_id — same shape we store
   *  in the D1 PK. Once set, phase A is skipped on every tick. */
  gbpPlaceId?: string;
  /** Resolved but NOT yet confirmed by the customer. The Hub shows
   *  the listing name/address and asks "is this your business?"
   *  before we latch gbpPlaceId. Prevents wrong-business latches. */
  gbpPlaceIdPending?: string;
  gbpResolvedName?: string;
  gbpResolvedAddress?: string;
  /** true once the customer clicks "Yes, that's my business" in the
   *  Hub. Triggers phase A to promote pending → confirmed. */
  gbpListingConfirmed?: boolean;
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
    if (!tools.gbpUrl) return false;
    if (!tools.gbpManagerInvited) return false;
    // Need to resolve → pending (no pending yet). Stop retrying if
    // resolution already failed — operator must fix the GBP URL or
    // business name and clear the failure stamp to re-trigger.
    if (!tools.gbpPlaceId && !tools.gbpPlaceIdPending) {
      if (tools.gbpResolutionFailedAt) return false;
      return true;
    }
    // Customer confirmed but not yet promoted to latched
    if (tools.gbpPlaceIdPending && tools.gbpListingConfirmed && !tools.gbpPlaceId) return true;
    // Latched but email not sent yet
    if (tools.gbpPlaceId && !tools.gbpModuleReadyEmailSentAt) return true;
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

    // ---------- A. Resolve place_id (pending → confirmed → latched) ----------
    let placeId = tools.gbpPlaceId;
    let resolvedThisTick = false;

    // A1. Promote pending → latched when customer confirmed
    if (!placeId && tools.gbpPlaceIdPending && tools.gbpListingConfirmed) {
      placeId = tools.gbpPlaceIdPending;
      await writeToolsSlice(prospect.pageId, prospect.onboardingData, {
        gbpPlaceId: placeId,
        gbpPlaceIdPending: undefined,
        gbpListingConfirmed: undefined,
        gbpResolutionFailedAt: undefined,
        gbpResolutionError: undefined,
      });
      resolvedThisTick = true;
      events.push("promoted confirmed place_id to latched");
    }

    // A2. Resolve → pending (not yet confirmed by customer)
    if (!placeId && !tools.gbpPlaceIdPending) {
      try {
        const expanded = await resolveMapsShortUrl(gbpUrl);
        const hints = parseMapsUrl(expanded);
        let resolvedId: string;

        if (hints.placeId) {
          resolvedId = hints.placeId;
          events.push("resolved place_id from URL (explicit)");
        } else {
          const query =
            hints.name ?? buildSearchQuery(prospect.business ?? prospect.name, prospect.onboardingData);
          const bias =
            hints.lat !== undefined && hints.lng !== undefined
              ? { lat: hints.lat, lng: hints.lng }
              : undefined;
          resolvedId = await findPlaceByQuery(query, apiKey, bias);
          events.push(
            `resolved place_id via text-search "${query}"${bias ? " biased to URL lat/lng" : ""}`,
          );
        }

        // Fetch listing details so we can show name/address in the
        // Hub for customer confirmation before latching.
        const preview = await fetchPlaceDetails(resolvedId, apiKey);
        await writeToolsSlice(prospect.pageId, prospect.onboardingData, {
          gbpPlaceIdPending: resolvedId,
          gbpResolvedName: preview.displayName ?? undefined,
          gbpResolvedAddress: preview.formattedAddress ?? undefined,
          gbpResolutionFailedAt: undefined,
          gbpResolutionError: undefined,
        });
        events.push(
          `pending confirmation: "${preview.displayName ?? "?"}" at ${preview.formattedAddress ?? "?"}`,
        );
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
    // We hold the snapshot in a local so phase C can quote the
    // resolved listing name + address back to the customer.
    let snapshot: PlaceDetailsSnapshot | null = null;
    if (placeId && !tools.gbpModuleReadyEmailSentAt) {
      try {
        snapshot = await fetchPlaceDetails(placeId, apiKey);
        await upsertSnapshot(db, {
          token: prospect.token,
          placeId,
          snapshot,
        });
        events.push(
          `seeded reviews snapshot (${snapshot.displayName ?? "?"} — rating ${snapshot.rating ?? "—"}, ${snapshot.topReviews.length} reviews)`,
        );
      } catch (e) {
        // Don't latch phase C until we have at least one successful
        // fetch — the confirmation email promises live data.
        const msg = e instanceof PlacesApiError ? e.message : String(e);
        throw new Error(`step3 reviews fetch failed: ${msg}`);
      }
    }

    // ---------- C. Confirmation email (latch: tools.gbpModuleReadyEmailSentAt) ----------
    // Only fires once placeId is latched AND reviews are seeded —
    // the email promises live data, so don't send until phase B ran.
    let emailSentThisTick = false;
    if (placeId && snapshot && !tools.gbpModuleReadyEmailSentAt) {
      const domain = readDomain(prospect.onboardingData) ?? "your site";
      await sendCustomerEmail(env, prospect.email, "gbp-module-ready", {
        customerName: prospect.name,
        domain,
        // Quote the resolved listing back so the customer immediately
        // spots a wrong match — the template renders this in a
        // confirmation block with a "reply if this isn't yours" line.
        // Falls back to "(unknown)" when both are missing so the
        // template still renders coherently.
        listingName: snapshot?.displayName ?? "(unknown)",
        listingAddress: snapshot?.formattedAddress ?? "(unknown)",
        rating:
          typeof snapshot?.rating === "number"
            ? snapshot.rating.toFixed(1)
            : "n/a",
        reviewCount: snapshot?.totalReviews ?? 0,
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
