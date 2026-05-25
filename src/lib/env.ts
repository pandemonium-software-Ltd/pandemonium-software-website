// Environment variable access with Zod validation.
//
// All server-side env access goes through this module so we get
// consistent error messages when something's missing.
//
// In Cloudflare Workers (with compatibility_date >= 2025-04-01),
// `process.env` is auto-populated from the Worker's environment
// bindings. Locally, Next.js reads from .env.local; Wrangler reads
// from .dev.vars. We keep both in .gitignore.

import { z } from "zod";

const serverEnvSchema = z.object({
  // Notion
  NOTION_API_KEY: z.string().min(1, "NOTION_API_KEY is required"),
  NOTION_PROSPECTS_DB_ID: z
    .string()
    .min(1, "NOTION_PROSPECTS_DB_ID is required"),
  NOTION_CLIENTS_DB_ID: z.string().optional(),
  NOTION_ASSETS_DB_ID: z.string().optional(),
  NOTION_EXCEPTIONS_DB_ID: z.string().optional(),
  // Cowork Ops audit log — Stage 2C C1. Each Step result (per
  // src/ops-worker/dispatch.ts) writes one entry. Optional: if
  // unset, the ops worker degrades gracefully and logs to stdout
  // (visible in `wrangler tail`) so the cron tick still runs while
  // Ben sets the DB up.
  NOTION_AUDIT_LOG_DB_ID: z.string().optional(),

  // Ben's user-scoped Cloudflare API token — Stage 2C C2.1. Used
  // by the Ops Worker to accept customer membership invitations,
  // create zones, bind Worker custom domains, etc. Required scopes
  // per §4.4: User Details Read, Account Settings Read, Zone DNS
  // Edit, Workers Scripts Edit, Pages Edit, Workers Routes Edit.
  // Optional: if unset, Step 1 (Cloudflare) returns
  // { status: "skip", reason: "BEN_CLOUDFLARE_API_TOKEN not set" }
  // so the cron loop keeps ticking on the rest of the work.
  BEN_CLOUDFLARE_API_TOKEN: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  // Resend webhook signing secret (whsec_…). Set via Resend
  // dashboard → Webhooks → endpoint detail → Signing Secret.
  // Optional — webhook handler returns 503 if missing rather
  // than crashing, so the rest of the app keeps working while
  // the secret gets configured.
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  // Admin gate
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 chars"),

  // Customer-side session signing key (Stage 2C C5.7+). HMAC-SHA256
  // signs the cookie issued by /login/[token]. Rotate by setting a
  // new value — all existing sessions become invalid (customers
  // re-login). 32+ random bytes is plenty; e.g.
  //   `openssl rand -base64 48`
  // Optional during early dev; the middleware fails closed if
  // missing in prod.
  SESSION_SECRET: z.string().min(32).optional(),

  // Onboarding Hub — the email customers should invite as a team
  // member across Cloudflare (Step 1), Resend (Step 2) and Google
  // Business Profile Manager (Step 3). Same gmail keeps Ben's life
  // simple and customers see the same address every time. Public-
  // facing — surfaced verbatim in the Hub UI.
  //
  // Optional so deploying without it doesn't break /onboarding,
  // /admin or /api/*. If unset, the Hub renders a clear
  // "(BEN_OPS_EMAIL not configured)" placeholder — visible to anyone
  // who reaches an invite step, so it's hard to forget.
  BEN_OPS_EMAIL: z.string().email().optional(),

  // Onboarding Hub Step 4 (brand assets) — public URL base for the
  // moduforge-customer-assets R2 bucket. Cloudflare assigns this when
  // public access is enabled on the bucket; looks like
  // `https://pub-<account_hash>.r2.dev`. Used to render thumbnails of
  // uploaded logos/photos on the Hub. Optional so deploying without
  // it doesn't break /onboarding — Step 4 falls back to filename-only
  // tiles when missing.
  R2_PUBLIC_URL_BASE: z.string().url().optional(),

  // Stripe (Stage 2A Part 2 — placeholders accepted now)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLIC_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SETUP_PRICE_ID: z.string().optional(),
  STRIPE_SUBSCRIPTION_PRICE_ID: z.string().optional(),

  // Sentry error tracking. Set per worker via wrangler secrets.
  // When SENTRY_DSN is missing, the SDK no-ops gracefully (still
  // imported but no events sent) so local dev / tests don't need
  // a DSN configured. SENTRY_ENVIRONMENT defaults to "production"
  // for deployed workers; override to "development" locally.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  /** Git SHA stamped at deploy time so Sentry can group errors
   *  by release + show regressions. Auto-populated in CI; set by
   *  wrangler.toml deploy injection locally. Falls back to
   *  "unknown" when missing. */
  SENTRY_RELEASE: z.string().optional(),

  // Stage 2C C5.4 — customer-site build pipeline.
  //
  // Shared secret between marketing site, GitHub Actions, and ops
  // worker. Used to authenticate calls to /api/internal/* endpoints.
  // 32+ random bytes; rotate by updating in all three places at once.
  INTERNAL_BUILD_SECRET: z.string().min(32).optional(),
  // GitHub credentials for ops worker → workflow_dispatch trigger.
  // GITHUB_TOKEN needs `repo` scope (or just `workflow` for fine-
  // grained tokens). Owner + repo identify which repo's workflow
  // to dispatch.
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPO: z.string().optional(),

  // Google Places API key (Places API v1 — the New version).
  // Used by:
  //   - step3-tools.ts to resolve a customer's Google Business
  //     Profile place_id from their pasted Google Maps URL.
  //   - gbp-reviews-tick.ts daily cron to refresh each Live
  //     customer's rating + top reviews into D1.
  //
  // Cost: Places Details + searchText calls in v1 are ~$5/1k
  // requests with the field masks we use. At 1k customers × 1
  // detail call/day = ~$150/mo at full scale, comfortably under
  // the $200 Maps Platform free credit. Customer pays £2/mo for
  // the GBP add-on which covers this comfortably.
  //
  // Optional: if unset, step3-tools logs a skip reason and the
  // reviews cron returns early. Customer-facing UI still works
  // (they can paste their URL); nothing happens until the key
  // is set.
  GOOGLE_PLACES_API_KEY: z.string().optional(),

  // Stage 2C C5.5 — Haiku copy assist.
  //
  // Anthropic API key. Workspace-scoped with a £30 monthly cap
  // (set in console.anthropic.com). Used by /api/internal/site-data
  // to polish customer bullets → marketing copy at site-build time.
  // Optional so deploys without it skip enrichment gracefully (the
  // adapter's raw output goes straight through).
  //
  // The model is HARDCODED in src/lib/haiku/client.ts as
  // "claude-haiku-4-5" — there's no env switch for the model name,
  // and that's deliberate. The spend cap is the safety net.
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Returns validated server env. Throws a friendly error listing all
 * missing required variables. Call this at the top of server code
 * that needs env vars.
 */
export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Missing or invalid server environment variables:\n${missing}\n\n` +
        "Set these in Cloudflare dashboard (Workers & Pages > " +
        "your project > Settings > Variables and Secrets), and in " +
        ".dev.vars locally.",
    );
  }
  return parsed.data;
}

/**
 * Looser variant: returns env vars without throwing if some are
 * missing. Useful for routes that gracefully degrade (e.g. admin
 * page can show a "configuration incomplete" message).
 */
export function getServerEnvOptional(): Partial<ServerEnv> {
  return process.env as Partial<ServerEnv>;
}
