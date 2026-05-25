// POST /api/admin/sentry/resolve — operator-only.
// Marks a sentry_alerts row resolved. Local D1 only; doesn't
// sync resolution back to Sentry (those issues stay open in
// Sentry until you resolve them there too).
//
// Auth: middleware Basic Auth on /api/admin/* — no per-route
// check needed (see src/middleware.ts).
//
// Body: { sentry_issue_id: string, note?: string }

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveSentryAlert } from "@/lib/d1-sentry";
import type { D1Database } from "@/lib/d1-analytics";
import { reportError } from "@/lib/sentry";

export const runtime = "nodejs";

const schema = z.object({
  sentry_issue_id: z.string().min(1).max(64),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request did not validate.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const cfCtx = getCloudflareContext();
  const cfEnv = (cfCtx?.env ?? {}) as {
    pandemonium_analytics?: D1Database;
  };
  const d1 = cfEnv.pandemonium_analytics;
  if (!d1) {
    return NextResponse.json(
      { error: "D1 binding missing." },
      { status: 503 },
    );
  }

  try {
    await resolveSentryAlert(d1, {
      sentry_issue_id: parsed.data.sentry_issue_id,
      resolved_by: "ben", // single-operator system; expand if/when multi-user
      note: parsed.data.note,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    reportError("api/admin/sentry/resolve", e);
    return NextResponse.json({ error: "Failed to resolve." }, { status: 500 });
  }
}
