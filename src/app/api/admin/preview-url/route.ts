// PATCH /api/admin/preview-url — operator endpoint to set (or
// clear) the customer's preview URL. The customer's Hub Step 5
// reads this from onboardingData.review.previewUrl and uses it
// to advance to Phase 3 (iframe + edits + commit).
//
// Auth: HTTP Basic Auth via src/middleware.ts (matcher includes
// /api/admin/:path*). By the time this runs, Ben is authenticated.
//
// Side effects on success:
//   - Writes onboardingData.review.previewUrl in Notion
//   - If previewUrl was just set (not just updated), emails the
//     customer the `preview-ready` template with the link
//   - Empty string clears the URL (no email sent)
//
// Idempotent: re-PATCHing the same URL is a no-op except for the
// email guard (only the FIRST set fires the customer email).

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import {
  mergeStepData,
  onboardingDataSchema,
  type OnboardingData,
} from "@/lib/onboarding";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  /** Empty string = clear the URL. URLs must be HTTPS to keep the
   *  iframe embed happy on a HTTPS hub. */
  previewUrl: z
    .string()
    .trim()
    .max(500, "URL too long (500 char max).")
    .refine(
      (s) => s === "" || /^https:\/\/.+/i.test(s),
      "Preview URL must start with https:// (http won't load in the iframe).",
    ),
});

export async function PATCH(request: Request) {
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
  const { token, previewUrl } = parsed.data;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  // Read existing review slice. We're only mutating previewUrl —
  // everything else (edits, goLiveDate, signoff) survives the merge.
  const existing = onboardingDataSchema.safeParse(
    prospect.onboardingData ?? {},
  );
  const baseData: OnboardingData = existing.success ? existing.data : {};
  const previousReview = (baseData.review ?? {}) as {
    previewUrl?: string;
    [k: string]: unknown;
  };

  // First-time set detection — drives whether we email the customer.
  // Empty → URL = "first set". Re-pasting an updated URL doesn't
  // re-email (operator can manually trigger if they need to).
  const isFirstSet =
    !previousReview.previewUrl &&
    previewUrl.length > 0;

  const nextSlice = {
    ...previousReview,
    previewUrl: previewUrl || undefined,
  };
  const mergedData = mergeStepData(baseData, "review", nextSlice);

  try {
    await updateProspectOnboarding(prospect.pageId, { data: mergedData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/admin/preview-url] Notion update error:", msg);
    return NextResponse.json(
      { error: `Update failed: ${msg}` },
      { status: 500 },
    );
  }

  // Customer email on first set — fail-soft.
  let emailWarning: string | null = null;
  if (isFirstSet) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
    try {
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        "preview-ready",
        {
          customerName: firstName(prospect.name),
          previewUrl,
          hubUrl: `${baseUrl}/onboarding/${token}`,
        },
      );
    } catch (e) {
      emailWarning = e instanceof Error ? e.message : String(e);
      console.warn(
        `[api/admin/preview-url] Notion saved but customer email failed: ${emailWarning}`,
      );
    }
  }

  return NextResponse.json({
    success: true,
    previewUrl: previewUrl || null,
    customerNotified: isFirstSet && !emailWarning,
    emailWarning,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use PATCH." },
    { status: 405, headers: { Allow: "PATCH" } },
  );
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}
