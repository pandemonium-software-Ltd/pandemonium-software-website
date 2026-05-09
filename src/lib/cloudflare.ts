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
// scopes per §4.4:
//   - User: User Details: Read
//   - Account: Account Settings: Read
//   - Zone: DNS: Edit
//   - Account: Workers Scripts: Edit
//   - Account: Pages: Edit
//   - Account: Workers Routes: Edit

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
