// PATCH /api/admin/module-change — operator endpoint for resolving
// a customer's pending module change.
//
// Auth: Basic Auth via src/middleware.ts (matcher includes
// /api/admin/:path*). By the time this runs, Ben is authenticated.
//
// Three actions:
//   - "applied"        → Stripe op done; Notion swaps to new modules,
//                        new fees written, customer emailed confirmed
//   - "billing-failed" → Stripe declined; modules NOT added (only the
//                        ones in the original selection survive),
//                        customer emailed with payment-method-update
//   - "rejected"       → operator declined the change; selection
//                        unchanged; customer emailed (TODO Phase 2)
//
// Email failures are logged but don't fail the response — the Notion
// state is the source of truth.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  resolveModuleChange,
} from "@/lib/notion-prospects";
import {
  modulesToSelection,
} from "@/lib/billing/module-policy";
import { calculateFees } from "@/lib/fees";
import { site } from "@/lib/site";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  changeId: z.string().min(1),
  action: z.enum(["applied", "billing-failed", "rejected"]),
  /** Customer-safe headline for the confirmation email when applied
   *  ("Your card was charged £39…"). Required for applied + billing-
   *  failed. Optional for rejected. */
  paymentLine: z.string().trim().max(500).optional(),
  /** Operator's internal note (visible to operator only). */
  resolutionNote: z.string().trim().max(2000).optional(),
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
  const { token, changeId, action, paymentLine, resolutionNote } =
    parsed.data;

  if ((action === "applied" || action === "billing-failed") && !paymentLine) {
    return NextResponse.json(
      {
        error:
          "paymentLine is required for applied / billing-failed (it goes verbatim into the customer's confirmation email).",
      },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  const entry = prospect.moduleChangeLog.find((e) => e.id === changeId);
  if (!entry) {
    return NextResponse.json(
      { error: `Module change ${changeId} not found.` },
      { status: 404 },
    );
  }
  if (entry.status !== "pending-stripe") {
    return NextResponse.json(
      {
        error: `This change is already ${entry.status}; can't re-resolve.`,
      },
      { status: 409 },
    );
  }

  // Build the resolution payload + the customer email values based
  // on which action the operator picked.
  let updated;
  let templateId:
    | "module-change-confirmed"
    | "payment-method-update-needed"
    | null = null;
  let emailValues: Record<string, string | number | boolean> = {};

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const accountUrl = `${baseUrl}/account/${token}`;

  try {
    if (action === "applied") {
      // Apply: write the new module list + recalculated fees.
      const newFees = calculateFees(
        modulesToSelection(entry.toModules),
        prospect.foundingMember,
      );
      updated = await resolveModuleChange(prospect.pageId, changeId, {
        status: "applied",
        resolutionNote,
        appliedSelection: entry.toModules,
        appliedFees: { setup: newFees.setup, monthly: newFees.monthly },
      });
      // Cancellation kinds also flip Status to Cancelled AND
      // stamp Cancelled At + Data Retention Until — that triplet
      // is what the gdpr-scrub-tick cron reads to decide when to
      // delete the customer's personal data (30 days after this
      // point per /terms section 11). Module/setup changes don't
      // touch any of those.
      if (
        entry.kind === "cancel-end-of-period" ||
        entry.kind === "cancel-immediate-prorated"
      ) {
        try {
          const { markCancelled } = await import("@/lib/notion-prospects");
          await markCancelled(prospect.pageId);
        } catch (e) {
          // Status + retention stamp failure is logged but not
          // fatal — operator will see the change applied + status
          // untouched in /admin and can flip manually. The cron
          // won't scrub until Data Retention Until is set, so a
          // miss here is safe (no premature deletion).
          console.error(
            `[api/admin/module-change] cancellation Status + retention stamp failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      templateId = "module-change-confirmed";
      emailValues = {
        customerName: firstName(prospect.name),
        addedSummary: diffSummary(entry.fromModules, entry.toModules, "added"),
        removedSummary: diffSummary(
          entry.fromModules,
          entry.toModules,
          "removed",
        ),
        paymentLine: paymentLine!,
        newSetupTotal: newFees.setup,
        newMonthlyTotal: newFees.monthly,
        accountUrl,
      };
    } else if (action === "billing-failed") {
      // Billing failed: revert selection to fromModules MINUS any
      // modules the customer was trying to ADD (they shouldn't see
      // features they didn't pay for). Removed modules in the
      // failed change ARE preserved (they were already paid for).
      const addedModules = new Set(
        entry.toModules.filter((m) => !entry.fromModules.includes(m)),
      );
      const reverted = entry.toModules.filter((m) => !addedModules.has(m));
      updated = await resolveModuleChange(prospect.pageId, changeId, {
        status: "billing-failed",
        resolutionNote,
        revertedSelection: reverted,
      });
      templateId = "payment-method-update-needed";
      emailValues = {
        customerName: firstName(prospect.name),
        failedActionDescription: paymentLine!,
        removedModulesSummary: [...addedModules].join(", ") || "(none)",
        accountUrl,
      };
    } else {
      // Rejected: no Notion writes beyond the log entry; selection
      // unchanged; customer email sent only if operator left a note.
      updated = await resolveModuleChange(prospect.pageId, changeId, {
        status: "rejected",
        resolutionNote,
      });
      // No template for rejected yet — operator typically follows up
      // by replying to the customer directly. Future: add
      // `module-change-rejected` template.
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/admin/module-change] Notion update error:", msg);
    return NextResponse.json(
      { error: `Update failed: ${msg}` },
      { status: 500 },
    );
  }

  let emailErr: string | null = null;
  if (templateId) {
    try {
      const env = getServerEnv();
      await sendCustomerEmail(env, prospect.email, templateId, emailValues);
    } catch (e) {
      emailErr = e instanceof Error ? e.message : String(e);
      console.warn(
        `[api/admin/module-change] Notion updated but customer email failed: ${emailErr}`,
      );
    }
  }

  return NextResponse.json({
    success: true,
    entry: updated,
    customerNotified: templateId !== null && !emailErr,
    emailWarning: emailErr,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use PATCH." },
    { status: 405, headers: { Allow: "PATCH" } },
  );
}

// --- Helpers ---

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

function diffSummary(
  from: string[],
  to: string[],
  which: "added" | "removed",
): string {
  const fromSet = new Set(from);
  const toSet = new Set(to);
  const list =
    which === "added"
      ? to.filter((m) => !fromSet.has(m))
      : from.filter((m) => !toSet.has(m));
  return list.length ? list.join(", ") : "(none)";
}
