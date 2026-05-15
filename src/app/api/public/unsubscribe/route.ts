// POST /api/public/unsubscribe — public endpoint called by the
// customer-site's /unsubscribe/[token] page when a subscriber
// clicks the unsubscribe link in any of the newsletter emails.
//
// Mirror of /api/public/confirm-subscription — same architecture:
// the actual Notion mutation lives here on the marketing site
// because the customer-site has no Notion access. The customer-
// site page POSTs here, gets a JSON success/failure, and renders
// a branded confirmation page in the customer's identity.
//
// One-click unsubscribe (no log-in, no friction — regulator
// requirement). Idempotent: re-clicking after success returns
// success without re-sending the confirmation email.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { customerSenderBrand } from "@/lib/email-branding";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSUB_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

const requestSchema = z.object({
  unsubscribeToken: z.string().regex(UNSUB_TOKEN_RE),
  customerToken: z.string().regex(TOKEN_RE),
});

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function jsonError(status: number, error: string) {
  return NextResponse.json(
    { success: false, error },
    { status, headers: corsHeaders() },
  );
}

function jsonOk(body: Record<string, unknown> = {}) {
  return NextResponse.json(
    { success: true, ...body },
    { headers: corsHeaders() },
  );
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Invalid request body.");
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  const { unsubscribeToken, customerToken } = parsed.data;

  const prospect = await getProspectByToken(customerToken).catch(() => null);
  if (!prospect) {
    return jsonError(404, "Subscription not found.");
  }

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    config?: { senderName?: string };
    subscribers?: Array<Record<string, unknown>>;
  };
  const subscribers = Array.isArray(newsletter.subscribers)
    ? newsletter.subscribers
    : [];
  const idx = subscribers.findIndex(
    (s) => s.unsubscribeToken === unsubscribeToken,
  );
  if (idx < 0) {
    return jsonError(404, "Subscription link not found or already used.");
  }
  const subscriber = subscribers[idx]!;
  const senderName =
    newsletter.config?.senderName ?? prospect.business ?? prospect.name;

  // Idempotent — if already unsubbed, skip the write + email.
  const alreadyUnsubbed = typeof subscriber.unsubscribedAt === "string";

  if (!alreadyUnsubbed) {
    const now = new Date().toISOString();
    subscribers[idx] = { ...subscriber, unsubscribedAt: now };
    const updatedNewsletter = { ...newsletter, subscribers };
    const updatedContent = { ...content, newsletter: updatedNewsletter };
    const updatedOb = { ...ob, content: updatedContent };
    try {
      await updateProspectOnboarding(prospect.pageId, {
        data: updatedOb as Parameters<typeof updateProspectOnboarding>[1]["data"],
      });
    } catch (e) {
      console.error(
        `[unsubscribe] notion write failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      // Don't throw — subscriber should see success either way
      // (regulators want the page to succeed; we'll see the
      // error in logs and reconcile manually).
    }
    // Confirmation email — fail-soft, not legally required.
    try {
      await sendCustomerEmail(
        getServerEnv(),
        subscriber.email as string,
        "newsletter-unsubscribed",
        {
          firstName: (subscriber.firstName as string) ?? "there",
          senderName,
        },
        { senderBrand: customerSenderBrand(prospect) },
      );
    } catch (e) {
      console.warn(
        `[unsubscribe] confirmation email failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return jsonOk({ businessName: senderName, alreadyUnsubbed });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
