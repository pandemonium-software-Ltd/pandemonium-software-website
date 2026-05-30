// POST /api/onboarding/review-edit — Hub Step 5 revision submission.
//
// Strict cap: a customer may submit at most MAX_REVIEW_EDITS rounds
// of pre-launch revisions. The client-side UI also enforces this, but
// this route is the source of truth — it counts the existing edits
// in the prospect's Onboarding Data and rejects any submission that
// would push the count past the cap.
//
// Side effects on success:
//   - Append the new edit (status: "submitted") to data.review.edits
//   - Save back to Notion via mergeStepData + updateProspectOnboarding
//   - Email Ben so he can route into the build pipeline
//
// Out-of-scope detection is deferred to Stage 2C (Cowork's
// classifier). For Stage 2B MVP, every submission counts. Operator
// can mark a submitted edit `rejected` from /admin/[token] (later
// D2) without burning the customer's allowance.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import {
  isOnboardingMutable,
  isOnboardingUnlocked,
  MAX_REVIEW_EDITS,
  mergeStepData,
  onboardingDataSchema,
  type OnboardingData,
  type ReviewEdit,
} from "@/lib/onboarding";
import {
  buildReviewEditNotification,
  sendInternalNotification,
} from "@/lib/email";
import { site } from "@/lib/site";
import {
  looksLikeMultipleItems,
  MULTI_ITEM_DECLINE_MESSAGE,
} from "@/lib/multi-item-detector";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE, "Missing or invalid token."),
  message: z
    .string()
    .trim()
    .min(20, "Tell me a bit more — at least a couple of sentences.")
    .max(2000, "Please split that into separate edits if it's a lot."),
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

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { token, message } = parsed.data;
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  if (!isOnboardingUnlocked(prospect.status)) {
    return NextResponse.json(
      { error: "Your onboarding link isn't active yet." },
      { status: 403 },
    );
  }
  if (!isOnboardingMutable(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Your onboarding is signed off — pre-launch revisions are closed. For any change requests, use the 'Need a change?' form on your account dashboard.",
      },
      { status: 403 },
    );
  }

  // Multi-item check — same logic as /api/account/change-request.
  // Each pre-launch edit must be a single ask so Cowork's classifier
  // can apply or escalate cleanly. Multi-field requests (e.g.
  // "change email and phone") slip past the regex but Haiku is
  // also instructed to refuse them. Detector returning false here
  // doesn't guarantee acceptance — it's the cheap first gate.
  // Doesn't burn the cap — nothing's saved.
  if (looksLikeMultipleItems(message)) {
    return NextResponse.json(
      {
        error: MULTI_ITEM_DECLINE_MESSAGE,
        suggestion: "split-into-separate-requests",
      },
      { status: 422 },
    );
  }

  // Read existing review slice + count current edits.
  const parsedData = onboardingDataSchema.safeParse(
    prospect.onboardingData ?? {},
  );
  const baseData: OnboardingData = parsedData.success ? parsedData.data : {};
  const reviewSlice = (baseData.review ?? {}) as {
    edits?: ReviewEdit[];
    [k: string]: unknown;
  };
  const existingEdits = Array.isArray(reviewSlice.edits)
    ? reviewSlice.edits
    : [];
  const activeEdits = existingEdits.filter((e) => e.status !== "rejected");

  if (activeEdits.length >= MAX_REVIEW_EDITS) {
    return NextResponse.json(
      {
        error: `You've used all ${MAX_REVIEW_EDITS} pre-launch edits. Anything else needs to wait for the post-launch monthly allowance, or be quoted separately if it's bigger.`,
        remaining: 0,
      },
      { status: 400 },
    );
  }

  // Append the new edit.
  const newEdit: ReviewEdit = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    message,
    status: "submitted",
  };

  const nextSlice = {
    ...reviewSlice,
    edits: [...existingEdits, newEdit],
  };
  const mergedData = mergeStepData(baseData, "review", nextSlice);

  try {
    await updateProspectOnboarding(prospect.pageId, { data: mergedData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding/review-edit] Notion update error:", msg);
    return NextResponse.json(
      { error: "Couldn't save just now. Please try again." },
      { status: 500 },
    );
  }

  const remaining = MAX_REVIEW_EDITS - (activeEdits.length + 1);

  // Internal notification — fail-soft.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const notif = buildReviewEditNotification({
    prospectName: prospect.name,
    business: prospect.business ?? "",
    editNumber: existingEdits.length + 1,
    remaining,
    message,
    notionUrl: prospect.notionUrl,
    adminDetailUrl: `${baseUrl}/admin/${token}`,
  });
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    console.warn(
      `[api/onboarding/review-edit] Notion saved but email failed: ${emailErr}`,
    );
  }

  return NextResponse.json({
    success: true,
    edit: newEdit,
    remaining,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
