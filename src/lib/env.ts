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

  // Email
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  // Admin gate
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 chars"),

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
