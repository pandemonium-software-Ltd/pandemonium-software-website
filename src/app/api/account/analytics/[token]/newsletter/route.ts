// GET /api/account/analytics/[token]/newsletter — newsletter
// analytics for the customer dashboard's Newsletter tab.
//
// Joins the send history on the prospect's Notion record with
// the newsletter_events D1 table populated by the Resend webhook.
// Returns per-send open/click/bounce counts plus subscriber
// growth in the window.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getProspectByToken } from "@/lib/notion-prospects";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import { readNewsletterAnalytics } from "@/lib/newsletter/analytics";
import type { D1Database } from "@/lib/d1-analytics";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_WINDOW = 30;
const MAX_WINDOW = 365;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  const url = new URL(request.url);
  const rawWindow = Number.parseInt(
    url.searchParams.get("window") ?? "",
    10,
  );
  const windowDays = Number.isFinite(rawWindow)
    ? Math.min(MAX_WINDOW, Math.max(1, rawWindow))
    : DEFAULT_WINDOW;

  const cfCtx = getCloudflareContext();
  const cfEnv = cfCtx.env as Record<string, unknown>;
  const db = cfEnv.pandemonium_analytics as D1Database | undefined;
  if (!db) {
    console.error(
      "[newsletter-analytics] pandemonium_analytics D1 binding missing",
    );
    return NextResponse.json(
      { error: "Storage unavailable." },
      { status: 503 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found." },
      { status: 404 },
    );
  }
  // The newsletter slice may be absent for customers who haven't
  // bought the module — return an empty payload rather than 404
  // so the UI can render an "add the module" empty state.
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    history?: Array<{
      id?: string;
      sentAt?: string;
      subject?: string;
      recipientCount?: number;
      status?: string;
    }>;
    subscribers?: Array<{
      confirmedAt?: string;
      unsubscribedAt?: string;
    }>;
  };

  // Tidy the history shape into the strict form the analytics
  // helper expects — drops in-flight or malformed entries.
  const history = (newsletter.history ?? [])
    .filter(
      (h): h is {
        id: string;
        sentAt: string;
        subject: string;
        recipientCount: number;
        status: string;
      } =>
        typeof h.id === "string" &&
        typeof h.sentAt === "string" &&
        typeof h.subject === "string" &&
        typeof h.recipientCount === "number" &&
        typeof h.status === "string",
    );
  const subscribers = newsletter.subscribers ?? [];

  try {
    const window = await readNewsletterAnalytics({
      db,
      token,
      history,
      subscribers,
      windowDays,
    });
    return NextResponse.json(window);
  } catch (e) {
    console.error(
      `[newsletter-analytics] failed for ${token}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json(
      { error: "Couldn't load newsletter analytics." },
      { status: 500 },
    );
  }
}
