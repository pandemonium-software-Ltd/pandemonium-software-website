// POST /api/admin/unlock-step — operator endpoint for un-marking an
// onboarding step as done. Used when a customer emails saying
// "I need to change my Cloudflare account ID" — Ben unlocks the
// step from /admin/[token] in one click and the customer's UI
// becomes editable on next page load.
//
// Auth: middleware Basic Auth on /api/admin/*. By the time this
// route runs, Ben is authenticated.
//
// Side effect: flips the named step's done flag to false. Doesn't
// touch the data — the customer's existing answers stay in place
// so they only need to edit what's wrong. Status flips back from
// "Onboarding Complete" → "Onboarding Started" if applicable
// (because the hub is no longer fully done).

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
  type ProspectStatus,
} from "@/lib/notion-prospects";
import {
  STEP_IDS,
  STEP_NUMBER,
  type StepId,
} from "@/lib/onboarding";
import { getServerEnv } from "@/lib/env";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  stepId: z.enum(STEP_IDS),
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
  const { token, stepId } = parsed.data;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found." },
      { status: 404 },
    );
  }

  // Build the update. Always flip the step done flag to false.
  // If the prospect is currently at "Onboarding Complete", drop them
  // back to "Onboarding Started" so the hub becomes mutable again
  // (per isOnboardingMutable). Statuses past Build Started don't
  // need this — those are post-build and the hub is permanently
  // closed even if a step is unlocked. Operator should know that
  // unlocking a step on a Live customer doesn't auto-rebuild.
  const update: Parameters<typeof updateProspectOnboarding>[1] = {
    stepDone: { step: STEP_NUMBER[stepId as StepId], done: false },
  };
  if (prospect.status === "Onboarding Complete") {
    update.statusFlip = "Onboarding Started" as ProspectStatus;
  }

  try {
    await updateProspectOnboarding(prospect.pageId, update);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[api/admin/unlock-step] Notion update failed: ${msg}`);
    return NextResponse.json(
      { error: "Couldn't save just now." },
      { status: 500 },
    );
  }

  // Always notify admin (paper trail in inbox — same pattern as
  // change-request actions). Especially useful when unlocking is a
  // response to a customer email; threading by subject helps.
  try {
    const env = getServerEnv();
    await notifyAdmin(env, {
      category: "review-edit",
      subject: `Unlocked onboarding step '${stepId}' — ${prospect.name}`,
      body:
        `You just unlocked the '${stepId}' step for ${prospect.name}.\n\n` +
        `Their existing answers are preserved — they can now edit the step from their Onboarding Hub.\n` +
        (prospect.status === "Onboarding Complete"
          ? `Status was rolled back from "Onboarding Complete" to "Onboarding Started" so the hub is mutable again.\n`
          : ``) +
        `\n` +
        adminFooter({
          prospectName: prospect.name,
          prospectToken: token,
        }),
    });
  } catch (e) {
    console.warn(
      `[api/admin/unlock-step] admin notify failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return NextResponse.json({
    success: true,
    stepId,
    statusFlippedTo: update.statusFlip ?? null,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
