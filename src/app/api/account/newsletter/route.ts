// POST /api/account/newsletter — customer dashboard composer endpoint.
//
// Customer fills the composer modal → submits → this endpoint:
//   1. Validates subject + body + template + optional image + CTA
//   2. Checks the monthly send cap (currently 1/customer/month —
//      separate counter from the 2 change-requests/month)
//   3. Renders the newsletter HTML via lib/newsletter/render
//   4. Sends to all CONFIRMED, NON-UNSUBSCRIBED subscribers via
//      Resend's batch endpoint (or loops in pages if > 100 recipients)
//   5. Stamps a history entry on the prospect with the send result
//   6. Notifies admin (FYI)
//
// Auto-applied — no admin moderation in Phase 1B. Length caps in
// the schema + composer act as the safety net (no rambling sends,
// no enormous images). Phase 2 can add Cowork content classification
// if needed.
//
// Auth: customer session via middleware (matcher covers /api/account
// indirectly through /account/[token]).

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProspectByToken,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import {
  renderNewsletter,
  type NewsletterTemplateId,
} from "@/lib/newsletter/render";
import {
  NEWSLETTER_SUBJECT_MAX,
  NEWSLETTER_BODY_MAX,
  NEWSLETTER_MONTHLY_SEND_LIMIT,
  NEWSLETTER_HISTORY_CAP,
} from "@/lib/newsletter/limits";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  template: z.enum([
    "announcement",
    "monthly-update",
    "promo",
    "personal-note",
  ]),
  subject: z.string().trim().min(1).max(NEWSLETTER_SUBJECT_MAX),
  body: z.string().trim().min(1).max(NEWSLETTER_BODY_MAX),
  imageUrl: z.string().trim().url().max(2000).optional(),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaUrl: z.string().trim().max(500).optional(),
});

const ELIGIBLE_STATUSES = new Set(["Live"]);

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
  const { token, template, subject, body, imageUrl, ctaLabel, ctaUrl } =
    parsed.data;
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  if (ctaLabel && !ctaUrl) {
    return NextResponse.json(
      {
        error:
          "If you set a button label, add a link too (or clear the label).",
      },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (!ELIGIBLE_STATUSES.has(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Newsletter sending unlocks once your site is live. Hold tight.",
      },
      { status: 403 },
    );
  }
  if (!prospect.moduleSelections.includes("Newsletter")) {
    return NextResponse.json(
      { error: "Newsletter module isn't on this account." },
      { status: 403 },
    );
  }

  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as {
    config?: {
      senderName?: string;
      senderEmailLocal?: string;
    };
    subscribers?: Array<{
      email?: string;
      firstName?: string;
      confirmedAt?: string;
      unsubscribedAt?: string;
      unsubscribeToken?: string;
    }>;
    history?: Array<Record<string, unknown>>;
  };

  // Monthly cap — count sends this calendar month from history.
  const history = newsletter.history ?? [];
  const sentThisMonth = countSendsThisMonth(history);
  if (sentThisMonth >= NEWSLETTER_MONTHLY_SEND_LIMIT) {
    const nextReset = nextMonthStartIso();
    return NextResponse.json(
      {
        error: `You've sent your ${NEWSLETTER_MONTHLY_SEND_LIMIT} included newsletter this month. Allowance resets on ${formatDateNice(nextReset)}. For extra sends, reply to me directly and I'll set one up.`,
        resetsOn: nextReset,
      },
      { status: 429 },
    );
  }

  // Active subscriber list — confirmed + not unsubscribed.
  const subscribers = (newsletter.subscribers ?? []).filter(
    (s) =>
      typeof s.email === "string" &&
      typeof s.confirmedAt === "string" &&
      !s.unsubscribedAt,
  );
  if (subscribers.length === 0) {
    return NextResponse.json(
      {
        error:
          "No confirmed subscribers yet. Once people sign up via your site's footer, you'll be able to send.",
      },
      { status: 400 },
    );
  }

  // Build From line. Display name uses the customer's senderName /
  // business name; technical sender domain has to be modu-forge.co.uk
  // because that's the only domain verified with Resend right now.
  // Subscribers' inboxes show "MyGem" (display name) — the technical
  // <…@modu-forge.co.uk> appears only in raw headers / on hover.
  //
  // 2026-05-15: was using customerDomain (`news@<customer>.tld`)
  // which produced 403 "domain not verified" from Resend on every
  // send. When per-customer Resend domain verification ships
  // (Stage 2C C5+), restore the customer-domain From line — until
  // then verifiedDomain is the only way the send actually goes out.
  //
  // Reply-to is set further down to the customer's public email so
  // subscriber replies go to them, not to us.
  const customerDomain =
    (ob.domain as { domain?: string } | undefined)?.domain ?? null;
  const senderName =
    newsletter.config?.senderName ?? prospect.business ?? prospect.name;
  const senderLocal =
    newsletter.config?.senderEmailLocal &&
    /^[a-z0-9._-]+$/.test(newsletter.config.senderEmailLocal)
      ? newsletter.config.senderEmailLocal
      : "news";
  if (!customerDomain) {
    return NextResponse.json(
      {
        error:
          "Your domain isn't fully set up — sender needs a verified address. I'll be in touch.",
      },
      { status: 503 },
    );
  }
  const VERIFIED_SENDER_DOMAIN = "modu-forge.co.uk";
  const fromAddress = `${senderName} <${senderLocal}@${VERIFIED_SENDER_DOMAIN}>`;
  // Reply-to: subscriber hits Reply → message lands with the
  // customer (their public email), not with us. Falls back to the
  // prospect's main email if no public override is set.
  const contentBusiness = (
    (ob.content ?? {}) as { business?: { publicEmail?: unknown } }
  ).business;
  const replyToAddress =
    (typeof contentBusiness?.publicEmail === "string" &&
      contentBusiness.publicEmail.trim()) ||
    prospect.email;

  const env = getServerEnv();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const websiteUrl = `https://${customerDomain}`;

  // Render once per recipient — unsubscribe link is per-token,
  // so each email gets a unique URL. Resend's batch endpoint
  // accepts up to 100 messages per call; we chunk if more.
  type SendEntry = {
    to: string;
    subject: string;
    html: string;
    text: string;
  };
  const messages: SendEntry[] = [];
  for (const sub of subscribers) {
    if (!sub.email || !sub.unsubscribeToken) continue;
    const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/unsubscribe/${sub.unsubscribeToken}?c=${token}`;
    const rendered = renderNewsletter(
      {
        template: template as NewsletterTemplateId,
        subject,
        body,
        imageUrl,
        ctaLabel,
        ctaUrl,
      },
      {
        senderName,
        // Logo URL — read from assets slice if present.
        logoUrl: pickLogoUrl(ob),
        primaryColor: pickBrandColor(ob, "primary"),
        secondaryColor: pickBrandColor(ob, "secondary"),
      },
      { unsubscribeUrl, websiteUrl },
    );
    messages.push({
      to: sub.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  // Send via Resend batch endpoint. Chunks of 100 to stay under
  // the API's documented limit.
  const recipientCount = messages.length;
  let sentCount = 0;
  const errors: string[] = [];
  const resendBatchIds: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        chunk.map((m) => ({
          from: fromAddress,
          to: [m.to],
          reply_to: replyToAddress,
          subject: m.subject,
          html: m.html,
          text: m.text,
        })),
      ),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      errors.push(`Chunk ${i / 100}: ${res.status} ${errText.slice(0, 200)}`);
      continue;
    }
    sentCount += chunk.length;
    try {
      const json = (await res.json()) as { data?: { id?: string }[] };
      for (const d of json.data ?? []) {
        if (d.id) resendBatchIds.push(d.id);
      }
    } catch {
      /* ignore parse errors — sentCount is correct */
    }
  }

  // Stamp history entry. Capped at NEWSLETTER_HISTORY_CAP entries.
  const historyEntry = {
    id: crypto.randomUUID(),
    status: errors.length === 0 ? "sent" : "failed",
    template,
    subject,
    body,
    imageKey: undefined,
    ctaLabel,
    ctaUrl,
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    recipientCount,
    resendBatchId: resendBatchIds[0],
  };
  const updatedHistory = [historyEntry, ...history].slice(
    0,
    NEWSLETTER_HISTORY_CAP,
  );
  const updatedNewsletter = { ...newsletter, history: updatedHistory };
  const updatedContent = { ...content, newsletter: updatedNewsletter };
  const updatedOb = { ...ob, content: updatedContent };
  try {
    await updateProspectOnboarding(prospect.pageId, {
      data: updatedOb as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
  } catch (e) {
    console.error(
      `[newsletter] history write failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Admin FYI — fail-soft.
  try {
    await notifyAdmin(env, {
      category: "change-request",
      subject:
        errors.length === 0
          ? `Newsletter sent — ${prospect.name} (${sentCount} recipients)`
          : `🚨 Newsletter PARTIAL/FAILED — ${prospect.name}`,
      body:
        `${prospect.name} just sent a newsletter from the dashboard.\n\n` +
        `Subject: ${subject}\n` +
        `Template: ${template}\n` +
        `Recipients: ${sentCount}/${recipientCount}\n` +
        (errors.length > 0 ? `\nERRORS:\n${errors.join("\n")}\n` : "") +
        `\n` +
        adminFooter({
          prospectName: prospect.name,
          prospectToken: token,
        }),
    });
  } catch (e) {
    console.warn(
      `[newsletter] admin FYI failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (errors.length > 0 && sentCount === 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Send failed: ${errors[0]}`,
        recipientCount: 0,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    recipientCount: sentCount,
    historyId: historyEntry.id,
    partialErrors: errors.length > 0 ? errors : undefined,
  });
}

// ---------- Helpers ----------

function countSendsThisMonth(
  history: Array<Record<string, unknown>>,
): number {
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  let count = 0;
  for (const h of history) {
    const sentAt = typeof h.sentAt === "string" ? h.sentAt : undefined;
    if (!sentAt) continue;
    if (sentAt.startsWith(monthKey) && h.status !== "failed") count += 1;
  }
  return count;
}

function nextMonthStartIso(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return next.toISOString();
}

function formatDateNice(iso: string): string {
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

function pickLogoUrl(ob: Record<string, unknown>): string | undefined {
  const assets = (ob.assets ?? {}) as {
    logo?: { key?: string };
  };
  const key = assets.logo?.key;
  if (!key) return undefined;
  const base = process.env.R2_PUBLIC_URL_BASE;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/${key}`;
}

function pickBrandColor(
  ob: Record<string, unknown>,
  which: "primary" | "secondary",
): string {
  const branding = (ob.branding ?? {}) as {
    brandColorPrimary?: string;
    brandColorSecondary?: string;
  };
  const fromBranding =
    which === "primary"
      ? branding.brandColorPrimary
      : branding.brandColorSecondary;
  if (fromBranding && /^#[0-9a-fA-F]{6}$/.test(fromBranding))
    return fromBranding;
  // Fallback to a neutral default — same shape as adapter.ts
  // fallback so the rendered email looks sensible without
  // brand colours set yet.
  return which === "primary" ? "#1e3a8a" : "#f97316";
}
