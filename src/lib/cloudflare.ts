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
//   - Zone: DNS: Edit                 ← gates DNS record edits (proxied
//                                       A records for Worker routing,
//                                       and Resend domain SPF/DKIM)
//   - Account: Workers Scripts: Edit  ← gates Workers script upload (C2.3)
//   - Zone: Workers Routes: Edit      ← gates POST /zones/:id/workers/routes
// Resources: "Include all accounts" (so Ben's future memberships
// in customer accounts are auto-covered). Zone Resources: "All zones".
//
// NB: "User: User Details: Read" was in the original §4.4 spec but
// is NOT what /memberships needs (it gates /user only). "Account:
// Pages: Edit" was also in §4.4 but is unused — Pages is superseded
// by per-customer Workers (§10).
//
// IMPORTANT — what we DON'T use and why:
// The modern Workers Custom Domains API at
//   POST /accounts/{id}/workers/domains
// rejects user-scoped tokens with code 10405 ("Method not allowed
// for this authentication scheme"), regardless of which permissions
// the token holds. It only accepts account-owned tokens — which
// would mean creating a separate token in EACH customer account,
// breaking the "one token, all accounts" model. Step 2 therefore
// uses the legacy zone-level Workers Routes API + proxied DNS A
// records instead (see step2-domain.ts phase E).

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
 *
 * Auto-retries on HTTP 429 (rate-limited) — Ben's user-scoped
 * token is shared across this Worker AND any other Cloudflare
 * tooling Ben runs (his marketing zones, wrangler deploys, etc.),
 * so transient bursts can throttle individual requests. We retry
 * up to RETRY_429_MAX times with linear backoff (RETRY_429_DELAY_MS
 * × attempt). After exhausting retries, the final 429 propagates
 * as a CloudflareApiError so the caller can decide to skip vs
 * surface-as-incident. Non-429 errors are NOT retried — they're
 * usually deterministic (auth, missing scope, malformed body).
 */
const RETRY_429_MAX = 3;
const RETRY_429_DELAY_MS = 4_000;

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

  let lastErr: CloudflareApiError | undefined;
  for (let attempt = 1; attempt <= RETRY_429_MAX; attempt++) {
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
        const err = new CloudflareApiError(res.status, message, code);
        // Retry only on 429 — other errors are deterministic.
        if (res.status === 429 && attempt < RETRY_429_MAX) {
          lastErr = err;
          // Linear backoff: 4s, 8s, 12s. Stays well under any
          // single-prospect tick budget (~30s) but gives the bucket
          // time to refill if we tripped over Ben's other usage.
          await new Promise((r) =>
            setTimeout(r, RETRY_429_DELAY_MS * attempt),
          );
          continue;
        }
        throw err;
      }

      // Cloudflare wraps successful responses in { success: true, result: ..., ... }.
      // Caller types T as the unwrapped result shape.
      const body = (await res.json()) as { result: T };
      return body.result;
    } finally {
      clearTimeout(timeout);
    }
  }
  // All retries exhausted on 429 — surface the last error.
  throw lastErr ?? new CloudflareApiError(429, "Rate limited (retries exhausted)");
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

// ---------- Workers Scripts (Stage 2C C2.3) ----------

/**
 * Upload (or replace) a per-customer Worker script using the
 * modern module-Worker format. Endpoint:
 *   PUT /accounts/{account_id}/workers/scripts/{script_name}
 * Body is multipart/form-data with two parts:
 *   - "metadata" (application/json): { main_module, compatibility_date }
 *   - "<filename>" (application/javascript+module): the script source
 *
 * Idempotent on Cloudflare's side — uploading the same name replaces
 * the existing Worker. We use this to provision the placeholder
 * "your site is being built" page right after C2.2 verifies the
 * customer's domain.
 *
 * Doesn't go through cloudflareFetch (which expects JSON body)
 * because multipart needs different headers + body shape.
 */
export async function uploadWorkerScript(
  accountId: string,
  scriptName: string,
  scriptSource: string,
): Promise<{ id: string; etag?: string }> {
  const env = getServerEnv();
  if (!env.BEN_CLOUDFLARE_API_TOKEN) {
    throw new Error("BEN_CLOUDFLARE_API_TOKEN required to upload Workers");
  }

  const metadata = {
    main_module: "worker.mjs",
    compatibility_date: "2026-04-11",
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append(
    "worker.mjs",
    new Blob([scriptSource], { type: "application/javascript+module" }),
    "worker.mjs",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/scripts/${scriptName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${env.BEN_CLOUDFLARE_API_TOKEN}`,
          // DON'T set Content-Type — fetch + FormData sets the
          // multipart boundary automatically.
        },
        body: form,
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      let code: number | undefined;
      let message = res.statusText;
      try {
        const errBody = (await res.json()) as {
          errors?: { code?: number; message?: string }[];
        };
        if (errBody?.errors?.[0]?.message) message = errBody.errors[0].message;
        if (errBody?.errors?.[0]?.code) code = errBody.errors[0].code;
      } catch {
        // body wasn't JSON
      }
      throw new CloudflareApiError(res.status, message, code);
    }

    const body = (await res.json()) as { result: { id: string; etag?: string } };
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Workers Custom Domains (UNUSED — see head comment) ----------
//
// These three helpers wrap POST /accounts/{id}/workers/domains.
// They are NOT used by step2-domain — that endpoint rejects
// user-scoped tokens with code 10405. Kept here so the wrappers
// exist if Cloudflare ever changes the auth scheme. Live code
// uses listDnsRecords + createDnsRecord + listWorkerRoutes +
// createWorkerRoute instead (further down).

export type WorkerCustomDomain = {
  id: string;
  hostname: string;
  service: string;
  zone_id: string;
  zone_name: string;
  environment: string;
  /**
   * Provisioning status. `pending` while Cloudflare is issuing the
   * TLS certificate; `active` once routing is live. Some responses
   * may omit this field — treat absent as `active` (the binding
   * exists, which is most of what we care about).
   */
  status?: "pending" | "active" | "pending_deletion";
};

/**
 * List Workers Custom Domains on an account, optionally filtered
 * to one hostname. Used by step2 for idempotency: don't re-bind
 * a hostname that's already pointed at our Worker.
 */
export async function listWorkerCustomDomains(
  accountId: string,
  hostname?: string,
): Promise<WorkerCustomDomain[]> {
  const params = new URLSearchParams();
  if (hostname) params.set("hostname", hostname);
  const qs = params.toString();
  return cloudflareFetch<WorkerCustomDomain[]>(
    `/accounts/${accountId}/workers/domains${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Bind a hostname to a Workers service. Single API call provisions
 * DNS + TLS + traffic routing. Per §4.3 Step 2 Worker Custom Domain
 * binding leg.
 */
export async function createWorkerCustomDomain(
  accountId: string,
  opts: { hostname: string; service: string; zoneId: string },
): Promise<WorkerCustomDomain> {
  return cloudflareFetch<WorkerCustomDomain>(
    `/accounts/${accountId}/workers/domains`,
    {
      method: "POST",
      body: {
        environment: "production",
        hostname: opts.hostname,
        service: opts.service,
        zone_id: opts.zoneId,
      },
    },
  );
}

/**
 * Fetch a single binding's current state. Used for polling the
 * pending → active transition (TLS cert provisioning, ~few minutes).
 */
export async function getWorkerCustomDomain(
  accountId: string,
  domainId: string,
): Promise<WorkerCustomDomain> {
  return cloudflareFetch<WorkerCustomDomain>(
    `/accounts/${accountId}/workers/domains/${domainId}`,
  );
}

// ---------- Legacy Workers Routes + DNS records (Stage 2C C2.3 fallback) ----------
//
// The modern Workers Custom Domains API at
// POST /accounts/{id}/workers/domains rejects user-scoped tokens
// with code 10405 ("Method not allowed for this authentication
// scheme"), regardless of permissions. It only accepts
// account-owned tokens — which would mean creating a separate
// token in EACH customer's account, breaking the "one token, all
// accounts" model.
//
// Workaround: use the legacy zone-level Workers Routes API +
// explicit DNS records. Same end result (customer's domain serves
// the placeholder Worker over HTTPS), just two API calls per
// hostname instead of one. Universal SSL is automatic on
// Cloudflare zones, so TLS still works.

export type DnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
};

export type WorkerRoute = {
  id: string;
  pattern: string;
  /** Worker script name. Cloudflare names it `script` here even
   *  though the modern API calls the same field `service`. */
  script: string;
};

/**
 * List DNS records on a zone, optionally filtered by name + type.
 * Used by step2-domain for idempotency (don't duplicate records).
 */
export async function listDnsRecords(
  zoneId: string,
  opts: { name?: string; type?: string } = {},
): Promise<DnsRecord[]> {
  const params = new URLSearchParams();
  if (opts.name) params.set("name", opts.name);
  if (opts.type) params.set("type", opts.type);
  const qs = params.toString();
  return cloudflareFetch<DnsRecord[]>(
    `/zones/${zoneId}/dns_records${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Create a DNS record on a zone. For our Worker-routing case we
 * create a proxied A record pointing to 192.0.2.1 (RFC 5737
 * reserved-for-docs IP) — the IP itself is never reached because
 * the Cloudflare edge intercepts requests matching the Worker
 * route pattern BEFORE they leave Cloudflare's network. The IP
 * is just a signalling value to keep the DNS record valid.
 */
export async function createDnsRecord(
  zoneId: string,
  opts: {
    type: string;
    name: string;
    content: string;
    proxied?: boolean;
    ttl?: number;
    comment?: string;
  },
): Promise<DnsRecord> {
  return cloudflareFetch<DnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: {
      type: opts.type,
      name: opts.name,
      content: opts.content,
      proxied: opts.proxied ?? true,
      ttl: opts.ttl ?? 1, // 1 = automatic
      comment: opts.comment,
    },
  });
}

/**
 * List Workers Routes on a zone, optionally filtered by exact
 * pattern. For idempotency in step2-domain.
 */
export async function listWorkerRoutes(
  zoneId: string,
  pattern?: string,
): Promise<WorkerRoute[]> {
  const all = await cloudflareFetch<WorkerRoute[]>(
    `/zones/${zoneId}/workers/routes`,
  );
  return pattern ? all.filter((r) => r.pattern === pattern) : all;
}

/**
 * Create a Workers Route — bind a request pattern to a Worker
 * script on the zone. Cloudflare's edge intercepts matching
 * requests before they hit DNS resolution.
 */
export async function createWorkerRoute(
  zoneId: string,
  opts: { pattern: string; script: string },
): Promise<WorkerRoute> {
  return cloudflareFetch<WorkerRoute>(
    `/zones/${zoneId}/workers/routes`,
    {
      method: "POST",
      body: {
        pattern: opts.pattern,
        script: opts.script,
      },
    },
  );
}
