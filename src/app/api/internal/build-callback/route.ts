// POST /api/internal/build-callback
//
// Internal endpoint called by the GitHub Actions
// `customer-site-build.yml` workflow at the END of a build, win
// or lose. Two outcomes:
//
//   { token, status: "success", previewUrl }
//     → stamp previewUrl in onboardingData.review (triggers customer
//       email via the same path as the manual /admin paste)
//     → clear Preview Build Triggered At + Preview Build Failed At
//     → email customer "preview ready"
//
//   { token, status: "failure", errorMessage }
//     → stamp Preview Build Failed At + clear Preview Build
//       Triggered At so future requests can re-trigger
//     → write a Cowork exception with the error so the operator
//       sees it
//     → no customer email (operator handles the "your build failed"
//       conversation manually for now; future: bounce-back template)
//
// Auth: same shared secret as /api/internal/site-data, sent as
// `x-internal-secret` header.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
  clearPreviewBuildTriggered,
} from "@/lib/notion-prospects";
import {
  mergeStepData,
  onboardingDataSchema,
  type OnboardingData,
} from "@/lib/onboarding";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.discriminatedUnion("status", [
  z.object({
    token: z.string().regex(TOKEN_RE),
    status: z.literal("success"),
    previewUrl: z.string().trim().url().max(500),
  }),
  z.object({
    token: z.string().regex(TOKEN_RE),
    status: z.literal("failure"),
    errorMessage: z.string().trim().max(2000),
  }),
]);

export async function POST(request: Request) {
  const env = getServerEnv();
  const expected = env.INTERNAL_BUILD_SECRET;
  if (!expected) {
    return NextResponse.json(
      {
        error: "INTERNAL_BUILD_SECRET not configured.",
        code: "secret_unconfigured",
      },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-internal-secret");
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "bad_secret" },
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
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(parsed.data.token).catch(
    () => null,
  );
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found.", code: "not_found" },
      { status: 404 },
    );
  }

  if (parsed.data.status === "failure") {
    // Stamp the failure latch + clear the trigger latch so the next
    // preview-request cycle can retry. We deliberately don't email
    // the customer on automated build failures — operator escalation
    // path is via the Cowork exception that the ops worker writes
    // when this endpoint returns the failure (logged below).
    try {
      await clearPreviewBuildTriggered(prospect.pageId, { failure: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[build-callback] couldn't clear/stamp build latches for ${parsed.data.token}: ${msg}`,
      );
    }
    console.error(
      `[build-callback] customer-site build FAILED for ${parsed.data.token}: ${parsed.data.errorMessage}`,
    );
    return NextResponse.json({
      success: true,
      action: "failure-recorded",
      message: parsed.data.errorMessage,
    });
  }

  // status === "success" — write previewUrl into onboardingData.review,
  // clear build latches, send customer "preview ready" email.
  const existing = onboardingDataSchema.safeParse(
    prospect.onboardingData ?? {},
  );
  const baseData: OnboardingData = existing.success ? existing.data : {};
  const reviewSlice = (baseData.review ?? {}) as Record<string, unknown>;
  const merged = mergeStepData(baseData, "review", {
    ...reviewSlice,
    previewUrl: parsed.data.previewUrl,
  });

  try {
    await updateProspectOnboarding(prospect.pageId, { data: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[build-callback] Notion previewUrl write failed for ${parsed.data.token}: ${msg}`,
    );
    return NextResponse.json(
      { error: `Notion update failed: ${msg}` },
      { status: 500 },
    );
  }

  // Clear latches (best-effort).
  try {
    await clearPreviewBuildTriggered(prospect.pageId, { failure: false });
  } catch (e) {
    console.warn(
      `[build-callback] couldn't clear build latches: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Customer email — fail-soft.
  let emailWarning: string | null = null;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  try {
    await sendCustomerEmail(env, prospect.email, "preview-ready", {
      customerName: firstName(prospect.name),
      previewUrl: parsed.data.previewUrl,
      hubUrl: `${baseUrl}/onboarding/${parsed.data.token}`,
    });
  } catch (e) {
    emailWarning = e instanceof Error ? e.message : String(e);
    console.warn(
      `[build-callback] preview-ready email failed for ${parsed.data.token}: ${emailWarning}`,
    );
  }

  return NextResponse.json({
    success: true,
    action: "previewUrl-stamped",
    customerNotified: !emailWarning,
    emailWarning,
  });
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
