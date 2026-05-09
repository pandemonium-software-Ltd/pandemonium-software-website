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

  // Email
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  // Admin gate
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 chars"),

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
