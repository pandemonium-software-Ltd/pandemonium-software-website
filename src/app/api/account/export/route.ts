// GET /api/account/export?token=<token>
//
// GDPR Article 20 data portability endpoint. Returns all personal
// data held for the customer as a JSON download. Requires an
// authenticated customer session (same cookie gate as all other
// /api/account/* routes).

import { NextResponse, type NextRequest } from "next/server";
import { getProspectByToken } from "@/lib/notion-prospects";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const TOKEN_RE = /^[a-z0-9-]{8,64}$/;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit("export", ip, 3, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const auth = await requireCustomerSession(request, token);
  if (!auth.ok) return auth.response;

  const prospect = await getProspectByToken(token);
  if (!prospect) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    personalData: {
      name: prospect.name,
      email: prospect.email,
      phone: prospect.phone ?? null,
      location: prospect.location ?? null,
    },
    business: {
      name: prospect.business ?? null,
      type: prospect.businessType ?? null,
      websiteSituation: prospect.websiteSituation ?? null,
    },
    subscription: {
      status: prospect.status,
      foundingMember: prospect.foundingMember,
      moduleSelections: prospect.moduleSelections,
      extraLocations: prospect.extraLocations,
      setupFee: prospect.setupFeeCalculated ?? null,
      monthlyFee: prospect.monthlyFeeCalculated ?? null,
      paidAt: prospect.stripePaidAt ?? null,
      cancelledAt: prospect.cancelledAt ?? null,
    },
    onboarding: {
      phase1SubmittedAt: prospect.phase1SubmittedAt ?? null,
      phase2SubmittedAt: prospect.phase2SubmittedAt ?? null,
      phase2Data: prospect.phase2Data ?? null,
      phase3SubmittedAt: prospect.phase3SubmittedAt ?? null,
      phase3Data: prospect.phase3Data ?? null,
      startedAt: prospect.onboardingStartedAt ?? null,
      completedAt: prospect.onboardingCompletedAt ?? null,
      goLiveDate: prospect.goLiveDate ?? null,
      data: prospect.onboardingData ?? null,
    },
    changeRequests: prospect.changeRequests.map((cr) => ({
      id: cr.id,
      kind: cr.kind ?? "free-text",
      message: cr.message,
      status: cr.status,
      reply: cr.reply ?? null,
      submittedAt: cr.submittedAt,
      resolvedAt: cr.resolvedAt ?? null,
    })),
    moduleChangeLog: prospect.moduleChangeLog.map((entry) => ({
      id: entry.id,
      kind: entry.kind ?? "modules-pre-launch",
      fromModules: entry.fromModules,
      toModules: entry.toModules,
      setupDelta: entry.setupDelta,
      monthlyDelta: entry.monthlyDelta,
      status: entry.status,
      submittedAt: entry.submittedAt,
      resolvedAt: entry.resolvedAt ?? null,
    })),
    notes: prospect.notes ?? null,
    compatibility: {
      result: prospect.compatibilityResult ?? null,
      reasoning: prospect.compatibilityReasoning ?? null,
    },
    dataRetention: {
      retainUntil: prospect.dataRetentionUntil ?? null,
      scrubbedAt: prospect.dataScrubbedAt ?? null,
    },
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="moduforge-data-export-${token.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
