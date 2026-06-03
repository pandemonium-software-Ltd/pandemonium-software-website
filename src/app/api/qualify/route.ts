// POST /api/qualify — Phase 2 submission handler.
//
// Flow:
//   1. Parse + validate body (zod, with token extracted out)
//   2. Look up prospect by token (404 if not found)
//   3. Reject if prospect's status is already past Phase 2 (409)
//   4. Reconstruct Phase 1 data from prospect record
//   5. Run runCompatibilityCheck(phase1, phase2)
//   6. updateProspectPhase2() writes Phase 2 + outcome to Notion
//   7. Send Ben an internal notification with the outcome + summary
//   8. If outcome === "accept", auto-send templated phase2-accept-here-is-intake-link
//      email to prospect (Low risk tier per §11.2 — compatibility
//      engine is deterministic, not LLM, so safe to auto-send)
//   9. Non-accept outcomes (soft_reject, flag_for_review,
//      clarification_needed) stay routed via the Cowork Drafts inbox
//      for Ben to handle until C6 lands the personalised templates
//   10. Return { success, outcome, message } with a generic prospect-
//       facing message (the real outcome is in the email Cowork just
//       sent OR in the Drafts inbox for Ben)
//
// The user-facing `message` is still generic — it tells the prospect
// what to expect without revealing the rules engine's verdict, in
// case email delivery is delayed.

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { phase2Schema, type Phase1Data } from "@/lib/schemas";
import {
  getProspectByToken,
  setProspectPassword,
  updateProspectPhase2,
} from "@/lib/notion-prospects";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { runCompatibilityCheck } from "@/lib/compatibility";
import {
  buildPhase2Notification,
  sendInternalNotification,
} from "@/lib/email";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAST_PHASE_2_STATUSES = new Set([
  "Phase 2 Complete",
  "Phase 2 Accepted",
  "Phase 2 Soft Rejected",
  "Phase 2 Flagged for Review",
  "Phase 2 Clarification Requested",
  "Phase 3 In Progress",
  "Phase 3 Complete",
  "Paid",
  "Build Started",
  "Live",
  "Cancelled",
]);

// Prospect-facing copy per outcome. These don't reveal the rules
// engine's verdict — just set expectations on response time. The real
// reply (acceptance, polite no, etc.) is drafted by AI against the
// playbook and sent only after Ben approves it.
const OUTCOME_MESSAGE: Record<string, string> = {
  accept:
    "Got your answers. A reply is being drafted for me to review — you'll have a fixed quote and an intake link within 4 working hours. If nothing arrives, drop me an email.",
  soft_reject:
    "Got your answers. A reply is being drafted for me to review — you'll hear back within 4 working hours.",
  flag_for_review:
    "Got your answers. There's a couple of points I want to read personally before I reply, so it'll be within 24 working hours.",
  clarification_needed:
    "Got your answers. A couple of them need a quick follow-up question — you'll have it in your inbox within 4 working hours.",
};

export async function POST(request: Request) {
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit("qualify", ip, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const token = typeof raw.token === "string" ? raw.token : "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid token." },
      { status: 400 },
    );
  }

  // Validate Phase 2 fields. Strip the token before parsing so the
  // schema doesn't see an unexpected key.
  const { token: _unused, ...rest } = raw;
  void _unused;
  const parsed = phase2Schema.safeParse(rest);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Please check your input and try again.",
      },
      { status: 400 },
    );
  }
  const phase2 = parsed.data;

  // Look up the prospect.
  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/qualify] Notion lookup error:", msg);
    return NextResponse.json(
      { error: "Could not look up your enquiry. Please try again." },
      { status: 500 },
    );
  }

  if (!prospect) {
    return NextResponse.json(
      { error: "Link not found. Please check the URL from my email." },
      { status: 404 },
    );
  }

  if (PAST_PHASE_2_STATUSES.has(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "I've already got your qualification answers. Watch your inbox — my reply is on the way (or already with you).",
      },
      { status: 409 },
    );
  }

  // Reconstruct the Phase 1 data the rules engine needs. We don't
  // re-validate via phase1Schema because Notion-stored values may
  // include legacy options that aren't in the current enum; the rules
  // engine treats them as opaque strings either way.
  const phase1 = {
    name: prospect.name,
    email: prospect.email,
    phone: prospect.phone ?? "",
    business: prospect.business ?? "",
    businessType: prospect.businessType ?? "Other",
    location: prospect.location ?? "",
    websiteSituation: prospect.websiteSituation ?? "Not sure",
  } as Phase1Data;

  const outcome = runCompatibilityCheck(phase1, phase2);

  // Persist outcome + Phase 2 data to Notion.
  try {
    await updateProspectPhase2(prospect.pageId, phase2, outcome);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/qualify] Notion update error:", msg);
    return NextResponse.json(
      {
        error:
          "I couldn't save your answers just now — please try again, or email me directly.",
      },
      { status: 500 },
    );
  }

  // Send Ben an internal notification with the outcome + answer summary.
  // Failure here is logged but doesn't fail the request.
  const notif = buildPhase2Notification(
    phase2,
    outcome,
    prospect.name,
    prospect.email,
    token,
    prospect.notionUrl,
  );
  const emailErr = await sendInternalNotification(notif);
  if (emailErr) {
    console.warn(
      `[api/qualify] Notion updated but email failed: ${emailErr}`,
    );
  }

  // Customer-facing email — only on Accept. Non-Accept outcomes
  // need careful copy and stay manual (Drafts inbox post-C6).
  //
  // ALSO: generate + persist the customer's password (Stage 2C
  // C5.7+ auth). Order matters:
  //   1. Generate plain password
  //   2. Hash + persist to Notion (so login works AS SOON AS the
  //      email lands)
  //   3. Send email containing the plain password
  // If step 2 fails, abort + log — sending a password the customer
  // can't use is worse than them not getting one at all (they'd
  // contact Ben who'd see the issue).
  // If step 3 fails (Resend hiccup), the password IS persisted —
  // customer hits Forgot Password to get a re-email.
  if (outcome.outcome === "accept") {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      "https://pandemonium-software-website.benpandher.workers.dev";

    let plainPassword: string | null = null;
    try {
      plainPassword = generatePassword();
      const hash = await hashPassword(plainPassword);
      await setProspectPassword(prospect.pageId, hash);
    } catch (e) {
      console.error(
        `[api/qualify] Couldn't persist password — accept email skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
      plainPassword = null;
    }

    if (plainPassword) {
      try {
        await sendCustomerEmail(
          getServerEnv(),
          prospect.email,
          "phase2-accept-here-is-intake-link",
          {
            customerName: firstName(prospect.name),
            intakeUrl: `${baseUrl}/intake/${token}`,
            password: plainPassword,
          },
        );
      } catch (e) {
        console.warn(
          `[api/qualify] Customer accept email failed for ${prospect.email}: ${e instanceof Error ? e.message : String(e)} (password is persisted; customer can use Forgot Password to retry)`,
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    outcome: outcome.outcome,
    message:
      OUTCOME_MESSAGE[outcome.outcome] ??
      "Got your answers. You'll hear back shortly.",
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

/** Extract first name (or full string if it's a single word) for the
 * "Hi X," greeting. Defensive: trims, falls back to "there" on empty. */
function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}
