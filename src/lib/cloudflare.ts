// Thin Cloudflare REST API client.
//
// Mirrors src/lib/notion.ts: native fetch (no SDK), reads
// BEN_CLOUDFLARE_API_TOKEN from env, fail-fast on non-2xx with a
// typed CloudflareApiError that carries status + the first error
// message Cloudflare returns.
//
// Why not the official @cloudflare/workers SDK: same reason as
// notion.ts — bundling friction on Workers + we use a tiny subset
// of the API. Native fetch is universally supported and keeps the
// ops Worker bundle small.
//
// Auth: User-scoped API token (NOT account-scoped). Created in
// Cloudflare dashboard → My Profile → API Tokens → Create. Required
// scopes (validated live during C2.1 deploy):
//   - User: Memberships: Edit         ← gates GET/PUT /memberships
//   - Account: Account Settings: Read ← gates GET /accounts
//   - Zone: Zone: Edit                ← gates POST /zones (for C2.2)
//   - Zone: DNS: Edit                 ← gates DNS record edits (C3 Resend)
//   - Account: Workers Scripts: Edit  ← gates Workers + Custom Domains (C2.3)
// Resources: "Include all accounts" (so Ben's future memberships
// in customer accounts are auto-covered). Zone Resources: "All zones".
//
// NB: "User: User Details: Read" was in the original §4.4 spec but
// is NOT what /memberships needs (it gates /user only). "Account:
// Pages: Edit" and "Account: Workers Routes: Edit" were also in
// §4.4 but are unused — Pages is superseded by per-customer
// Workers (§10), and Workers Routes is bundled into Workers Scripts.

import { getServerEnv } from "./env";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 10_000;

export class CloudflareApiError extends Error {
  status: number;
  code?: number;
  constructor(status: number, message: string, code?: number) {
    super(`Cloudflare API ${status}${code ? ` (code ${code})` : ""}: ${message}`);
    this.name = "CloudflareApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Make an authenticated request to the Cloudflare REST API.
 *
 * Throws CloudflareApiError on non-2xx (with the first error
 * message), AbortError on timeout, TypeError on network failures.
 */
export async function cloudflareFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const env = getServerEnv();
  if (!env.BEN_CLOUDFLARE_API_TOKEN) {
    throw new Error(
      "BEN_CLOUDFLARE_API_TOKEN is required for Cloudflare API calls. " +
        "Create a User API Token in dashboard → My Profile → API Tokens " +
        "with the scopes listed in src/lib/cloudflare.ts head comment, " +
        "then `wrangler secret put BEN_CLOUDFLARE_API_TOKEN " +
        "--config wrangler-ops.jsonc`.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.BEN_CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      // Cloudflare error responses are JSON:
      // { success: false, errors: [{ code, message }], messages: [], result: null }
      let code: number | undefined;
      let message = res.statusText;
      try {
        const errBody = (await res.json()) as {
          errors?: { code?: number; message?: string }[];
        };
        if (errBody?.errors?.[0]?.message) message = errBody.errors[0].message;
        if (errBody?.errors?.[0]?.code) code = errBody.errors[0].code;
      } catch {
        // body wasn't JSON — keep the statusText
      }
      throw new CloudflareApiError(res.status, message, code);
    }

    // Cloudflare wraps successful responses in { success: true, result: ..., ... }.
    // Caller types T as the unwrapped result shape.
    const body = (await res.json()) as { result: T };
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Domain types (only the fields we read) ----------

export type Membership = {
  /** Membership id — used to PUT to update status (accept invite). */
  id: string;
  /** "pending" until accepted; "accepted" after; "rejected" if declined. */
  status: "pending" | "accepted" | "rejected";
  account: {
    id: string;
    name: string;
  };
  /** Roles granted to the user inside this account. */
  roles?: { id: string; name: string }[];
};

export type Account = {
  id: string;
  name: string;
};

// ---------- High-level helpers ----------

/**
 * List the authenticated user's memberships. Optionally filter by
 * status. Cloudflare's API returns one membership per account that
 * the user belongs to (or has been invited to).
 */
export async function listMemberships(
  status?: Membership["status"],
): Promise<Membership[]> {
  const path = status
    ? `/memberships?status=${encodeURIComponent(status)}`
    : "/memberships";
  return cloudflareFetch<Membership[]>(path);
}

/**
 * Accept a pending membership invitation. Idempotent:
 * Cloudflare returns success even if the membership is already
 * accepted (silently treats as no-op).
 */
export async function acceptMembership(
  membershipId: string,
): Promise<Membership> {
  return cloudflareFetch<Membership>(`/memberships/${membershipId}`, {
    method: "PUT",
    body: { status: "accepted" },
  });
}

/**
 * List the authenticated user's accessible accounts. Used after
 * accepting a membership to verify access actually works (sometimes
 * memberships take a few seconds to propagate).
 */
export async function listAccounts(): Promise<Account[]> {
  return cloudflareFetch<Account[]>("/accounts");
}

// ---------- Zones (Stage 2C C2.2) ----------

export type ZoneStatus =
  | "pending"
  | "initializing"
  | "active"
  | "moved"
  | "deleted"
  | "deactivated";

export type Zone = {
  id: string;
  name: string;
  status: ZoneStatus;
  /** Nameservers Cloudflare assigned to this zone. Customer must
   *  point their registrar at these. Two strings for "full" zones. */
  name_servers: string[];
  /** Original nameservers as seen at zone-creation time. */
  original_name_servers?: string[];
  account: { id: string; name?: string };
};

/**
 * List zones — optionally filtered to one account + one name.
 * Used by step2-domain to check if a zone already exists before
 * trying to create one (idempotency: customer might have set up
 * their own zone before paying).
 */
export async function listZones(opts: {
  accountId?: string;
  name?: string;
} = {}): Promise<Zone[]> {
  const params = new URLSearchParams();
  if (opts.accountId) params.set("account.id", opts.accountId);
  if (opts.name) params.set("name", opts.name);
  const qs = params.toString();
  return cloudflareFetch<Zone[]>(`/zones${qs ? `?${qs}` : ""}`);
}

/**
 * Create a "full" zone in the customer's Cloudflare account. "Full"
 * means the customer will repoint their registrar at Cloudflare's
 * assigned nameservers (vs "partial" / Cloudflare for SaaS, which
 * uses CNAMEs and is for SaaS providers).
 *
 * Cloudflare returns the created zone including the assigned
 * `name_servers` array — we email those to the customer immediately.
 */
export async function createZone(
  accountId: string,
  name: string,
): Promise<Zone> {
  return cloudflareFetch<Zone>("/zones", {
    method: "POST",
    body: {
      name,
      account: { id: accountId },
      type: "full",
    },
  });
}

/**
 * Fetch a single zone's current state. Used for status polling —
 * the zone starts as `pending`, transitions to `active` once the
 * customer's registrar update propagates (typically 1-2 hours;
 * max 48).
 */
export async function getZone(zoneId: string): Promise<Zone> {
  return cloudflareFetch<Zone>(`/zones/${zoneId}`);
}
