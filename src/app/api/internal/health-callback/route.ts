// POST /api/internal/health-callback
//
// Receives health check results from CI (weekly security-check.yml)
// and from manual operations (secret rotation, security audits).
// Writes to D1 `business_health_checks` table for the admin
// Business Health panel.
//
// Auth: same INTERNAL_BUILD_SECRET as build-callback + site-data.
//
// Payload shapes:
//
//   CI run (from GitHub Actions):
//   {
//     "type": "ci_run",
//     "checks": {
//       "npm_audit":  { "status": "pass|warn|fail", "high": 0, "critical": 0 },
//       "typecheck":  { "status": "pass|fail" },
//       "tests":      { "status": "pass|fail", "passed": 281, "failed": 0 },
//       "outdated":   { "major_behind": 0 }
//     }
//   }
//
//   Secret rotation (manual or scripted):
//   { "type": "secret_rotation", "key": "STRIPE_SECRET_KEY" }
//
//   Security audit (after completing an audit):
//   { "type": "security_audit", "detail": { "findings": 49, "fixed": 49, "accepted": 9 } }

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@/lib/d1-analytics";

export const runtime = "nodejs";

const ciChecksSchema = z.object({
  type: z.literal("ci_run"),
  checks: z.object({
    npm_audit: z.object({
      status: z.enum(["pass", "warn", "fail"]),
      high: z.number().int().min(0).default(0),
      critical: z.number().int().min(0).default(0),
    }),
    typecheck: z.object({
      status: z.enum(["pass", "fail"]),
    }),
    tests: z.object({
      status: z.enum(["pass", "fail"]),
      passed: z.number().int().min(0).default(0),
      failed: z.number().int().min(0).default(0),
    }),
    outdated: z.object({
      major_behind: z.number().int().min(0).default(0),
    }).optional(),
  }),
});

const secretRotationSchema = z.object({
  type: z.literal("secret_rotation"),
  key: z.string().trim().min(1).max(100),
});

const securityAuditSchema = z.object({
  type: z.literal("security_audit"),
  detail: z.object({
    findings: z.number().int().min(0),
    fixed: z.number().int().min(0),
    accepted: z.number().int().min(0),
  }),
});

const requestSchema = z.discriminatedUnion("type", [
  ciChecksSchema,
  secretRotationSchema,
  securityAuditSchema,
]);

export async function POST(request: Request) {
  const env = getServerEnv();
  const expected = env.INTERNAL_BUILD_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Service unavailable." },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-internal-secret");
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload." },
      { status: 400 },
    );
  }

  const cfCtx = getCloudflareContext();
  const cfEnv = (cfCtx?.env ?? {}) as { pandemonium_analytics?: D1Database };
  const db = cfEnv.pandemonium_analytics;
  if (!db) {
    return NextResponse.json(
      { error: "D1 not available." },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const data = parsed.data;

  if (data.type === "ci_run") {
    const { checks } = data;
    const overallStatus =
      checks.npm_audit.status === "fail" ||
      checks.typecheck.status === "fail" ||
      checks.tests.status === "fail"
        ? "fail"
        : checks.npm_audit.status === "warn"
          ? "warn"
          : "pass";

    await db
      .prepare(
        `INSERT INTO business_health_checks (check_type, check_key, status, detail, checked_at)
         VALUES ('ci_run', '', ?, ?, ?)`,
      )
      .bind(overallStatus, JSON.stringify(checks), now)
      .run();
  } else if (data.type === "secret_rotation") {
    await db
      .prepare(
        `INSERT INTO business_health_checks (check_type, check_key, status, detail, checked_at)
         VALUES ('secret_rotation', ?, 'pass', '{}', ?)`,
      )
      .bind(data.key, now)
      .run();
  } else if (data.type === "security_audit") {
    await db
      .prepare(
        `INSERT INTO business_health_checks (check_type, check_key, status, detail, checked_at)
         VALUES ('security_audit', '', 'pass', ?, ?)`,
      )
      .bind(JSON.stringify(data.detail), now)
      .run();
  }

  return NextResponse.json({ ok: true });
}

function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let mismatch = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < maxLen; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}
