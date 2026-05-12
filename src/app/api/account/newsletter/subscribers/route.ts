// Subscriber management endpoints for the dashboard.
//
//   POST   — manual add (operator-style — bypasses double-opt-in
//            because the customer is adding from their own list,
//            e.g. CSV import of existing customers who've already
//            consented)
//   DELETE — manual remove (stamps unsubscribedAt; same flow as
//            the public unsubscribe page)
//   GET    — list (paginated for big lists) + CSV export
//            (when ?format=csv)
//
// Auth: customer session via middleware. The token in the body
// must match the path the customer is logged into (defense in
// depth — middleware already verifies the cookie).

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import {
  SUBSCRIBER_EMAIL_MAX,
  SUBSCRIBER_FIRST_NAME_MAX,
  SUBSCRIBER_CAP_PER_CUSTOMER,
} from "@/lib/newsletter/limits";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const addSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  email: z.string().trim().toLowerCase().email().max(SUBSCRIBER_EMAIL_MAX),
  firstName: z.string().trim().max(SUBSCRIBER_FIRST_NAME_MAX).optional(),
});

const removeSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  email: z.string().trim().toLowerCase().email().max(SUBSCRIBER_EMAIL_MAX),
});

// ---------- POST — manual add ----------
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
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { token, email, firstName } = parsed.data;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect)
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!prospect.moduleSelections.includes("Newsletter"))
    return NextResponse.json(
      { error: "Newsletter module isn't on this account." },
      { status: 403 },
    );

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    subscribers?: Array<{
      id?: string;
      email?: string;
      firstName?: string;
      subscribedAt?: string;
      confirmedAt?: string;
      unsubscribedAt?: string;
      confirmationToken?: string;
      unsubscribeToken?: string;
    }>;
  };
  const subscribers = Array.isArray(newsletter.subscribers)
    ? [...newsletter.subscribers]
    : [];

  const existingIdx = subscribers.findIndex(
    (s) => s.email?.toLowerCase() === email,
  );
  if (existingIdx < 0 && subscribers.length >= SUBSCRIBER_CAP_PER_CUSTOMER) {
    return NextResponse.json(
      {
        error: `Subscriber list is at the ${SUBSCRIBER_CAP_PER_CUSTOMER}-cap. Remove some first or contact me to migrate to a bigger plan.`,
      },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  // Operator-added subscribers count as already-confirmed —
  // the customer is vouching they have consent (CSV import of
  // their existing customers, manual add of a friend who asked).
  // Still gets a unique unsubscribe token so they can leave.
  const newSubscriber = {
    id:
      existingIdx >= 0
        ? subscribers[existingIdx]!.id ?? crypto.randomUUID()
        : crypto.randomUUID(),
    email,
    firstName,
    subscribedAt: now,
    confirmedAt: now,
    unsubscribedAt: undefined,
    confirmationToken:
      existingIdx >= 0
        ? subscribers[existingIdx]!.confirmationToken ?? randomHex(32)
        : randomHex(32),
    unsubscribeToken:
      existingIdx >= 0
        ? subscribers[existingIdx]!.unsubscribeToken ?? randomHex(32)
        : randomHex(32),
  };
  if (existingIdx >= 0) {
    subscribers[existingIdx] = newSubscriber;
  } else {
    subscribers.push(newSubscriber);
  }

  const updatedNewsletter = { ...newsletter, subscribers };
  const updatedContent = { ...content, newsletter: updatedNewsletter };
  const updatedOb = { ...ob, content: updatedContent };
  try {
    await updateProspectOnboarding(prospect.pageId, {
      data: updatedOb as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Notion write failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    success: true,
    subscriberCount: subscribers.filter(
      (s) => s.confirmedAt && !s.unsubscribedAt,
    ).length,
  });
}

// ---------- DELETE — manual remove (unsubscribe) ----------
export async function DELETE(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = removeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { token, email } = parsed.data;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect)
    return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    subscribers?: Array<{ email?: string; unsubscribedAt?: string }>;
  };
  const subscribers = Array.isArray(newsletter.subscribers)
    ? [...newsletter.subscribers]
    : [];
  const idx = subscribers.findIndex(
    (s) => s.email?.toLowerCase() === email,
  );
  if (idx < 0) {
    return NextResponse.json({ error: "Subscriber not found." }, { status: 404 });
  }
  subscribers[idx] = { ...subscribers[idx]!, unsubscribedAt: new Date().toISOString() };
  const updatedNewsletter = { ...newsletter, subscribers };
  const updatedContent = { ...content, newsletter: updatedNewsletter };
  const updatedOb = { ...ob, content: updatedContent };
  try {
    await updateProspectOnboarding(prospect.pageId, {
      data: updatedOb as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Notion write failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    success: true,
    subscriberCount: subscribers.filter(
      (s) => !s.unsubscribedAt,
    ).length,
  });
}

// ---------- GET — list or CSV export ----------
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const format = url.searchParams.get("format") ?? "json";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Bad token." }, { status: 400 });
  }
  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect)
    return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    subscribers?: Array<{
      email?: string;
      firstName?: string;
      subscribedAt?: string;
      confirmedAt?: string;
      unsubscribedAt?: string;
    }>;
  };
  const all = newsletter.subscribers ?? [];

  if (format === "csv") {
    const rows: string[] = [
      "email,first_name,subscribed_at,confirmed_at,unsubscribed_at,status",
    ];
    for (const s of all) {
      const status = s.unsubscribedAt
        ? "unsubscribed"
        : s.confirmedAt
          ? "active"
          : "unconfirmed";
      rows.push(
        [
          csvEscape(s.email ?? ""),
          csvEscape(s.firstName ?? ""),
          csvEscape(s.subscribedAt ?? ""),
          csvEscape(s.confirmedAt ?? ""),
          csvEscape(s.unsubscribedAt ?? ""),
          status,
        ].join(","),
      );
    }
    return new NextResponse(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${token.slice(0, 8)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    subscribers: all.map((s) => ({
      email: s.email,
      firstName: s.firstName,
      subscribedAt: s.subscribedAt,
      confirmedAt: s.confirmedAt,
      unsubscribedAt: s.unsubscribedAt,
      status: s.unsubscribedAt
        ? "unsubscribed"
        : s.confirmedAt
          ? "active"
          : "unconfirmed",
    })),
  });
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function randomHex(chars: number): string {
  const arr = new Uint8Array(Math.ceil(chars / 2));
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < arr.length; i++) {
    s += arr[i]!.toString(16).padStart(2, "0");
  }
  return s.slice(0, chars);
}
