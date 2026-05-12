// POST /api/onboarding — Stage 2B Hub state mutations.
//
// Each call updates one step's data and (optionally) flips its done
// flag. Body shape:
//
//   { token, stepId, patch, markDone? }
//
// The route handles:
//   - First-touch transition Paid → Onboarding Started
//   - Per-step partial save (deep merge into Onboarding Data JSON)
//   - Per-step done flag (with canMarkStepDone gate)
//   - Final transition → Onboarding Complete when all applicable
//     steps are ticked
//   - Review step: writes Go Live Date to its dedicated property
//
// All validation runs server-side (token regex, status gate, per-step
// zod schema, applicable-step check, can-mark-done gate). Email
// notifications to Ben are deferred to H5.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  STEP_IDS,
  STEP_NUMBER,
  STEP_SCHEMAS,
  canMarkStepDone,
  deriveStepList,
  getDoneFlags,
  isHubComplete,
  isOnboardingMutable,
  isOnboardingUnlocked,
  mergeStepData,
  onboardingDataSchema,
  type OnboardingData,
  type StepId,
} from "@/lib/onboarding";
import {
  getProspectByToken,
  updateProspectOnboarding,
  type OnboardingUpdate,
} from "@/lib/notion-prospects";
import { site } from "@/lib/site";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import {
  buildPreviewRequestNotification,
  sendInternalNotification,
} from "@/lib/email";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE, "Missing or invalid token."),
  stepId: z.enum(STEP_IDS),
  patch: z.record(z.unknown()).default({}),
  markDone: z.boolean().optional(),
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

  const parsedReq = requestSchema.safeParse(raw);
  if (!parsedReq.success) {
    return NextResponse.json(
      {
        error: "Invalid request shape.",
        issues: parsedReq.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const { token, stepId, patch, markDone } = parsedReq.data;

  // Per-step zod validation. Patches arrive partial so each step's
  // schema treats every field as optional.
  const stepSchema = STEP_SCHEMAS[stepId];
  const parsedPatch = stepSchema.safeParse(patch);
  if (!parsedPatch.success) {
    return NextResponse.json(
      {
        error: "Some of those answers didn't validate.",
        issues: parsedPatch.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const validatedPatch = parsedPatch.data as Record<string, unknown>;

  // Look up prospect.
  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding] Notion lookup error:", msg);
    return NextResponse.json(
      { error: "Couldn't look up your link. Please try again." },
      { status: 500 },
    );
  }
  if (!prospect) {
    return NextResponse.json(
      { error: "Link not found. Please check the URL from my email." },
      { status: 404 },
    );
  }

  // View gate: pre-payment prospects can't reach the API at all.
  if (!isOnboardingUnlocked(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Your onboarding link isn't active yet — payment hasn't been recorded. If you've just paid, give it a minute and refresh.",
      },
      { status: 403 },
    );
  }
  // Mutation gate: post-sign-off the Hub is read-only. Customer goes
  // through the account dashboard for any further changes.
  if (!isOnboardingMutable(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Your onboarding is signed off — the Hub is now read-only. For any change requests, use the 'Need a change?' form on your account dashboard.",
      },
      { status: 403 },
    );
  }

  // Step applicability gate.
  const steps = deriveStepList(prospect);
  const stepDef = steps.find((s) => s.id === stepId);
  if (!stepDef || !stepDef.applicable) {
    return NextResponse.json(
      {
        error:
          "That step isn't part of your setup. Refresh the page to see your live step list.",
      },
      { status: 400 },
    );
  }

  // Per-step lock gate: once a step has been marked done, it's
  // read-only until Ben unlocks it from /admin. This mirrors the
  // dashboard's green-tick + greyed-out UI — the API enforces the
  // same so a direct API call can't bypass the customer-facing lock.
  // (Hub-wide lock above already handles the post-signoff case.)
  //
  // Exemptions (always editable, even when marked done):
  //   - "review" — the pre-launch revisions inbox lives here and is
  //     a separate route (/api/onboarding/review-edit) with its own
  //     gating.
  //   - "assets" — brand assets (logo, photos) are deliberately
  //     re-editable any time pre-launch. A customer who realises
  //     they uploaded the wrong logo can swap it without emailing.
  //     A Step 5 review-edit referencing the new asset triggers a
  //     rebuild via Cowork's `rebuildOnly` classification path.
  const currentDoneFlags = getDoneFlags(prospect);
  const STEP_LOCK_EXEMPT: ReadonlySet<StepId> = new Set(["review", "assets"]);
  if (currentDoneFlags[stepId] && !STEP_LOCK_EXEMPT.has(stepId)) {
    return NextResponse.json(
      {
        error:
          "This step is complete and locked. Email me at " +
          (process.env.BEN_OPS_EMAIL ?? "pandamoniumsoftwareltd@gmail.com") +
          " if you need to change something — I can unlock it.",
      },
      { status: 403 },
    );
  }

  // Merge patch into existing onboarding data blob. Tolerate any
  // shape on read — the schema-validated patch wins on every key.
  const existingData = onboardingDataSchema.safeParse(
    prospect.onboardingData ?? {},
  );
  const baseData: OnboardingData = existingData.success ? existingData.data : {};
  const mergedData = mergeStepData(baseData, stepId, validatedPatch);
  // The slice that's now in the merged blob — used for can-mark-done.
  const newSlice = (mergedData[stepId] ?? {}) as Record<string, unknown>;

  // Detect first-time preview-request transition (Phase 1 → Phase 2
  // in Step 5). Fires once when previewSubmittedAt flips from absent
  // to set; re-saves of an already-stamped review slice don't re-
  // notify. Used below (after Notion update) to send both an
  // internal email to Ben + a customer confirmation.
  const previousReview = (baseData.review ?? {}) as {
    previewSubmittedAt?: string;
  };
  const newReview = (mergedData.review ?? {}) as {
    previewSubmittedAt?: string;
  };
  const previewJustRequested =
    !previousReview.previewSubmittedAt &&
    typeof newReview.previewSubmittedAt === "string" &&
    newReview.previewSubmittedAt.length > 0;

  // Build the Notion update.
  const update: OnboardingUpdate = { data: mergedData };

  // First-touch transition: Paid → Onboarding Started.
  const isFirstTouch = prospect.status === "Paid";
  if (isFirstTouch) {
    update.statusFlip = "Onboarding Started";
    update.stampStartedAt = true;
  }

  // Mark-done flow: validate + flip checkbox + maybe complete the hub.
  if (markDone) {
    const gate = canMarkStepDone(stepId, newSlice, {
      modules: prospect.moduleSelections,
    });
    if (!gate.ok) {
      return NextResponse.json({ error: gate.reason }, { status: 400 });
    }
    update.stepDone = { step: STEP_NUMBER[stepId], done: true };

    // Step 5: review → also write Go Live Date.
    if (
      stepId === "review" &&
      typeof newSlice.goLiveDate === "string" &&
      newSlice.goLiveDate.length > 0
    ) {
      update.goLiveDate = newSlice.goLiveDate;
    }

    // Hub-complete check: simulate the new done map and see if every
    // applicable step is ticked.
    const newDoneFlags = {
      ...getDoneFlags(prospect),
      [stepId]: true,
    };
    if (isHubComplete(steps, newDoneFlags)) {
      update.statusFlip = "Onboarding Complete";
      update.stampCompletedAt = true;
    }
  }

  try {
    await updateProspectOnboarding(prospect.pageId, update);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding] Notion update error:", msg);
    return NextResponse.json(
      { error: "Couldn't save just now — please try again." },
      { status: 500 },
    );
  }

  // Customer email on first transition into Onboarding Complete:
  // confirms the go-live date and points them at their account
  // dashboard (their post-launch home for change requests, status,
  // subscription details). Fail-soft — never blocks the success
  // response. Email goes out once and only on the first transition,
  // so re-saving an already-complete hub doesn't re-notify.
  //
  // Routes through the branded HTML wrapper (sendCustomerEmail)
  // for visual parity with all other customer-facing emails.
  let customerEmailWarning: string | null = null;
  if (update.statusFlip === "Onboarding Complete") {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
    const reviewSlice = (mergedData.review ?? {}) as { goLiveDate?: string };
    try {
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        "signoff-confirmation",
        {
          customerName: firstName(prospect.name),
          goLiveDate: formatGoLiveDate(reviewSlice.goLiveDate ?? ""),
          accountUrl: `${baseUrl}/account/${token}`,
        },
      );
    } catch (e) {
      customerEmailWarning =
        e instanceof Error ? e.message : String(e);
      console.warn(
        `[api/onboarding] Hub complete saved but customer email failed: ${customerEmailWarning}`,
      );
    }
  }

  // Preview-request transition: customer hit "Request site preview"
  // for the first time. Fire the internal Ben notification + the
  // customer confirmation. Both fail-soft — the Notion write is
  // already in the bag.
  let previewEmailWarnings: { internal?: string; customer?: string } = {};
  if (previewJustRequested) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
    const tokenShort = token.slice(0, 8);
    const adminDetailUrl = `${baseUrl}/admin/${token}`;
    const accountUrl = `${baseUrl}/account/${token}`;
    const reviewSlice = (mergedData.review ?? {}) as { goLiveDate?: string };
    const goLivePretty = formatGoLiveDate(reviewSlice.goLiveDate ?? "");

    // Internal email to Ben — structured Gmail-filterable subject.
    const internal = buildPreviewRequestNotification({
      prospectName: prospect.name,
      business: prospect.business ?? "",
      tokenShort,
      goLiveDate: goLivePretty,
      moduleSelections: prospect.moduleSelections,
      notionUrl: prospect.notionUrl,
      adminDetailUrl,
    });
    const internalErr = await sendInternalNotification(internal);
    if (internalErr) {
      previewEmailWarnings.internal = internalErr;
      console.warn(
        `[api/onboarding] preview-request internal email failed: ${internalErr}`,
      );
    }

    // Customer confirmation — branded HTML wrapper via sendCustomerEmail.
    try {
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        "preview-request-received",
        {
          customerName: firstName(prospect.name),
          accountUrl,
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      previewEmailWarnings.customer = msg;
      console.warn(
        `[api/onboarding] preview-request customer email failed: ${msg}`,
      );
    }
  }

  return NextResponse.json({
    success: true,
    stepId,
    markedDone: !!markDone,
    hubComplete: update.statusFlip === "Onboarding Complete",
    previewRequested: previewJustRequested,
    customerEmailWarning,
    previewEmailWarnings:
      Object.keys(previewEmailWarnings).length > 0
        ? previewEmailWarnings
        : undefined,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

// Keep a typed reference so unused-import lint stays quiet. Actual
// type re-export happens implicitly via the route response shape.
export type { StepId };

/** "Alex Smith" → "Alex". Fallback to "there" on empty. */
function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

/** "2026-06-01" → "1 June 2026" for the signoff email subject + body. */
function formatGoLiveDate(iso: string): string {
  if (!iso) return "the agreed date";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
