// POST /api/public/subscribe — public newsletter signup endpoint.
//
// Called by the SubscribeWidget on customer sites. Each customer
// site is on a different origin (their own domain), so we send
// permissive CORS headers — anyone can POST. The customerToken in
// the body identifies which prospect's subscriber list to write to.
//
// Double-opt-in flow:
//   1. Visitor submits email + first name → row created with
//      status "unconfirmed" + a unique confirmationToken
//   2. Confirmation email sent to the visitor (template
//      `newsletter-confirm-subscribe`)
//   3. Visitor clicks the link → /confirm-subscription/[token]
//      → flips `confirmedAt` to now + emails welcome
//   4. Visitor receives a welcome email and is in the list
//
// Rate-limiting is intentionally light: same email re-submitting
// is a no-op (returns 200 with "check your inbox" so we don't
// confirm/deny membership to enumeration attempts). A future
// per-IP throttle can live behind Cloudflare's bot management.
//
// Subscriber CAP enforced server-side. Past cap → 503 with a
// "please reply to {email} and I'll add you manually" message.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProspectByToken } from "@/lib/notion-prospects";
import { updateProspectOnboarding } from "@/lib/notion-prospects";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServerEnv } from "@/lib/env";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { customerSenderBrand } from "@/lib/email-branding";
import { site } from "@/lib/site";
import {
  SUBSCRIBER_CAP_PER_CUSTOMER,
  SUBSCRIBER_EMAIL_MAX,
  SUBSCRIBER_FIRST_NAME_MAX,
} from "@/lib/newsletter/limits";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  customerToken: z.string().regex(TOKEN_RE),
  email: z.string().trim().toLowerCase().email().max(SUBSCRIBER_EMAIL_MAX),
  firstName: z
    .string()
    .trim()
    .max(SUBSCRIBER_FIRST_NAME_MAX)
    .optional(),
  /** Hidden honeypot — legitimate users leave this empty; bots
   *  fill every input they see. Server-side check returns a generic
   *  success so bots don't iterate against the rejection.
   *  Added 2026-05-13 — security audit M6. */
  hp: z.string().max(200).optional(),
});

// Pre-flight (OPTIONS) handler — customer-site origins differ
// from the marketing site, so the browser sends a CORS pre-flight
// before the POST. Allow any origin; the customerToken in the
// body is what couples the request to a specific customer.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Invalid request body.");
  }
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit("pub-subscribe", ip, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { ...corsHeaders(), "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "Invalid request.",
    );
  }
  const { customerToken, email, firstName, hp } = parsed.data;

  // Honeypot tripped: silent-drop with a generic success response
  // so bots think the submission worked + can't iterate against the
  // rejection. Nothing's stored, no email fires, monthly cap not
  // touched. Mirror of the same pattern in /api/public/enquiry.
  if (hp && hp.trim().length > 0) {
    console.warn(
      `[subscribe] honeypot tripped for customer ${customerToken.slice(0, 8)} — silent drop`,
    );
    return NextResponse.json(
      { success: true, stored: false },
      { headers: corsHeaders() },
    );
  }

  const prospect = await getProspectByToken(customerToken).catch(() => null);
  if (!prospect) {
    // Don't leak whether the token is valid — generic message.
    return jsonError(400, "Couldn't sign you up just now. Try again later.");
  }
  if (!prospect.moduleSelections.includes("Newsletter")) {
    // Same generic message — defense against enumeration of which
    // customers have the module.
    return jsonError(400, "Newsletter isn't available on this site.");
  }

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    config?: Record<string, unknown>;
    subscribers?: Array<{
      id?: string;
      email?: string;
      confirmedAt?: string;
      unsubscribedAt?: string;
      confirmationToken?: string;
      unsubscribeToken?: string;
    }>;
  };
  const subscribers = Array.isArray(newsletter.subscribers)
    ? newsletter.subscribers
    : [];

  // Idempotency: if email already exists, re-issue the confirmation
  // email but don't create a new row. Same for unsubscribed users
  // re-joining — we flip the unsubscribedAt off + re-send confirm.
  const existingIdx = subscribers.findIndex(
    (s) => typeof s.email === "string" && s.email.toLowerCase() === email,
  );

  // Cap check (only matters for new subscribers).
  if (
    existingIdx < 0 &&
    subscribers.length >= SUBSCRIBER_CAP_PER_CUSTOMER
  ) {
    console.warn(
      `[subscribe] cap reached for ${customerToken.slice(0, 8)}: ${subscribers.length}`,
    );
    return jsonError(
      503,
      "We've hit a temporary subscriber limit. Please email the business directly and they'll add you.",
    );
  }

  // Generate fresh tokens — confirmation + unsubscribe. ~128 bits
  // each (32 hex chars). Long enough that brute-forcing one is
  // not realistic without a side-channel.
  const confirmationToken = randomHex(32);
  const unsubscribeToken = randomHex(32);
  const now = new Date().toISOString();

  const newSubscriber = {
    id:
      existingIdx >= 0
        ? subscribers[existingIdx]!.id ?? crypto.randomUUID()
        : crypto.randomUUID(),
    email,
    firstName,
    subscribedAt: now,
    // If existing + already confirmed, keep their confirmation. If
    // existing + previously unsubscribed, REQUIRE re-confirmation
    // (clears the unsubscribedAt + re-sends confirm email).
    confirmedAt:
      existingIdx >= 0 &&
      subscribers[existingIdx]!.confirmedAt &&
      !subscribers[existingIdx]!.unsubscribedAt
        ? subscribers[existingIdx]!.confirmedAt
        : undefined,
    unsubscribedAt: undefined,
    confirmationToken,
    unsubscribeToken,
  };

  const updatedSubscribers =
    existingIdx >= 0
      ? subscribers.map((s, i) => (i === existingIdx ? newSubscriber : s))
      : [...subscribers, newSubscriber];

  const updatedNewsletter = {
    ...newsletter,
    subscribers: updatedSubscribers,
  };
  const updatedContent = { ...content, newsletter: updatedNewsletter };
  const updatedOb = { ...ob, content: updatedContent };

  try {
    await updateProspectOnboarding(prospect.pageId, {
      data: updatedOb as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
  } catch (e) {
    console.error(
      `[subscribe] notion write failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return jsonError(500, "Couldn't sign you up just now. Try again later.");
  }

  // Send the confirmation email — fail-soft so a Resend hiccup
  // doesn't lose the signup (the visitor sees "check your inbox"
  // and we have the unconfirmed row on file; they can re-submit).
  //
  // 2026-05-15: confirm + unsubscribe URLs now point at the
  // CUSTOMER's domain (not modu-forge.co.uk) so the subscriber
  // stays in the customer's branded environment when they click
  // through. The customer site has /confirm-subscription/[token]
  // and /unsubscribe/[token] pages that POST back to /api/public/
  // confirm-subscription and /api/public/unsubscribe to do the
  // actual Notion mutation.
  //
  // Falls back to the marketing-site URL if the customer's domain
  // isn't on file yet (shouldn't happen for a launched customer
  // — Step 2 captures it before the newsletter module ever ships)
  // — keeps the link working rather than emitting a broken URL.
  const env = getServerEnv();
  const customerDomain = (() => {
    const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
    const domainSlice = (ob.domain ?? {}) as { domain?: unknown };
    return typeof domainSlice.domain === "string"
      ? domainSlice.domain.trim()
      : "";
  })();
  const baseUrl = customerDomain
    ? `https://${customerDomain}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? site.url);
  const confirmUrl = `${baseUrl.replace(/\/$/, "")}/confirm-subscription/${confirmationToken}?c=${customerToken}`;
  const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/unsubscribe/${unsubscribeToken}?c=${customerToken}`;

  try {
    await sendCustomerEmail(
      env,
      email,
      "newsletter-confirm-subscribe",
      {
        firstName: firstName ?? "there",
        senderName:
          (newsletter.config as { senderName?: string })?.senderName ??
          prospect.business ??
          prospect.name,
        confirmUrl,
        unsubscribeUrl,
      },
      // Customer-branded: subscriber's inbox shows the customer's
      // business name in the From header, header uses their primary
      // colour, footer shows their domain. The email is from THEIR
      // newsletter, not from ModuForge.
      { senderBrand: customerSenderBrand(prospect) },
    );
  } catch (e) {
    console.warn(
      `[subscribe] confirm-email send failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    // Continue — visitor still gets the success message.
  }

  return NextResponse.json(
    { success: true },
    { status: 200, headers: corsHeaders() },
  );
}

function jsonError(status: number, message: string) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: corsHeaders() },
  );
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
