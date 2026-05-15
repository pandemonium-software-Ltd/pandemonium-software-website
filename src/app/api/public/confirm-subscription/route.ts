// POST /api/public/confirm-subscription — public endpoint called by
// the customer-site's /confirm-subscription/[token] page when a
// subscriber clicks the confirm link in their newsletter-confirm-
// subscribe email.
//
// Why this endpoint exists: the confirm link in the email used to
// land on the MARKETING site (modu-forge.co.uk/confirm-subscription/...)
// which broke the illusion that the subscriber was interacting with
// the CUSTOMER's brand. We've moved the confirm page to the customer
// site's own deployment, but the customer site doesn't have Notion
// access — so it calls back here to do the actual mutation work.
//
// Permissive CORS so any customer-site domain can POST. The
// confirmToken (subscriber-private random) + customerToken (UUID)
// pair authenticates the request — only someone who has the email
// (or the customer's specific token) can call this with the right
// inputs.
//
// Idempotent: re-confirming an already-confirmed subscription
// returns success without re-sending the welcome email.
//
// Side effects on success:
//   - Stamps subscriber.confirmedAt in Notion (unsetting any
//     prior unsubscribedAt to support re-subscribe flows).
//   - Sends the customer-branded newsletter-welcome email with
//     the unsubscribe URL pointing at the CUSTOMER's domain too.

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
const CONFIRM_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

const requestSchema = z.object({
  confirmToken: z.string().regex(CONFIRM_TOKEN_RE),
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
  const { confirmToken, customerToken } = parsed.data;

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
  const idx = subscribers.findIndex((s) => s.confirmationToken === confirmToken);
  if (idx < 0) {
    return jsonError(404, "Subscription link not found or already used.");
  }
  const subscriber = subscribers[idx]!;
  const senderName =
    newsletter.config?.senderName ?? prospect.business ?? prospect.name;
  const businessName =
    prospect.business?.trim() || prospect.name?.trim() || senderName;

  // Resolve the customer's public domain so the welcome email's
  // unsubscribe link goes to THEIR site too (not modu-forge.co.uk).
  const domainSlice = (ob.domain ?? {}) as { domain?: unknown };
  const customerDomain =
    typeof domainSlice.domain === "string" ? domainSlice.domain.trim() : "";
  if (!customerDomain) {
    // Shouldn't happen for a launched customer (Step 2 is required
    // to launch). Defensive — fall back to marketing site so the
    // unsubscribe link still works if domain isn't set yet.
    console.warn(
      `[confirm-subscription] no customer domain for ${customerToken.slice(0, 8)}; falling back to marketing site for unsub link`,
    );
  }
  const unsubBaseUrl = customerDomain
    ? `https://${customerDomain}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://modu-forge.co.uk");
  const unsubscribeUrl = `${unsubBaseUrl.replace(/\/$/, "")}/unsubscribe/${subscriber.unsubscribeToken}?c=${customerToken}`;

  // Idempotent: if already confirmed, skip the Notion write +
  // welcome email. Page can still render the success view from
  // the businessName we return.
  const alreadyConfirmed =
    typeof subscriber.confirmedAt === "string" && !subscriber.unsubscribedAt;

  if (!alreadyConfirmed) {
    const now = new Date().toISOString();
    subscribers[idx] = {
      ...subscriber,
      confirmedAt: now,
      unsubscribedAt: undefined,
    };
    const updatedNewsletter = { ...newsletter, subscribers };
    const updatedContent = { ...content, newsletter: updatedNewsletter };
    const updatedOb = { ...ob, content: updatedContent };
    try {
      await updateProspectOnboarding(prospect.pageId, {
        data: updatedOb as Parameters<typeof updateProspectOnboarding>[1]["data"],
      });
    } catch (e) {
      console.error(
        `[confirm-subscription] notion write failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return jsonError(500, "Couldn't confirm just now. Try again in a minute.");
    }

    // Welcome email — fail-soft; confirmation already succeeded in
    // Notion.
    try {
      await sendCustomerEmail(
        getServerEnv(),
        subscriber.email as string,
        "newsletter-welcome",
        {
          firstName: (subscriber.firstName as string) ?? "there",
          senderName,
          unsubscribeUrl,
        },
        { senderBrand: customerSenderBrand(prospect) },
      );
    } catch (e) {
      console.warn(
        `[confirm-subscription] welcome email failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return jsonOk({ businessName: senderName, alreadyConfirmed });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
