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
import { effectiveMonthlyCap } from "@/lib/admin-grants";
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
import { pickLogoUrl, pickBrandColor } from "@/lib/newsletter/brand";
import { site } from "@/lib/site";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cap on inline images per send. Beyond this it stops being an
// email and starts being a brochure — open rates suffer and
// Gmail starts clipping. 4 is the sweet spot from email best
// practice + matches the composer UI's add-image cap.
const MAX_IMAGES_PER_NEWSLETTER = 4;

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
  images: z
    .array(
      z.object({
        url: z.string().trim().url().max(2000),
        // 25-100 in 5% steps from the composer slider. Server
        // clamps + snaps too in the renderer (clampPct) for
        // belt-and-braces.
        widthPct: z.number().min(25).max(100).optional(),
        crop: z.enum(["original", "square", "16:9", "4:3"]).optional(),
      }),
    )
    .max(MAX_IMAGES_PER_NEWSLETTER)
    .optional(),
  imageLayout: z
    .enum(["stacked", "side-by-side", "grid"])
    .optional(),
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
  const {
    token,
    template,
    subject,
    body,
    images,
    imageLayout,
    ctaLabel,
    ctaUrl,
  } = parsed.data;
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
  // Effective cap = default + admin grant for this month (operator
  // can extend the customer's allowance from /admin/[token]).
  const history = newsletter.history ?? [];
  const sentThisMonth = countSendsThisMonth(history);
  const effectiveCap = effectiveMonthlyCap({
    prospect,
    defaultCap: NEWSLETTER_MONTHLY_SEND_LIMIT,
    kind: "newsletters",
  });
  if (sentThisMonth >= effectiveCap) {
    const nextReset = nextMonthStartIso();
    return NextResponse.json(
      {
        error: `You've sent your ${effectiveCap} included newsletter${effectiveCap === 1 ? "" : "s"} this month. Allowance resets on ${formatDateNice(nextReset)}. For extra sends, reply to me directly and I'll set one up.`,
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
        images,
        imageLayout,
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

  // Pre-generate the send id so we can tag every Resend message
  // with it. Tags come back on webhook events (delivered, opened,
  // clicked etc.) which lets the webhook receiver route an event
  // to the right customer + send with zero database lookup.
  const sendId = crypto.randomUUID();

  // Send via Resend batch endpoint. Chunks of 100 to stay under
  // the API's documented limit. We capture per-recipient Resend
  // email IDs (one ID per message in each batch response) and zip
  // them back to the recipient emails so the dashboard can
  // display "sent to a@b.com" with per-recipient open/click status.
  const recipientCount = messages.length;
  let sentCount = 0;
  const errors: string[] = [];
  const resendBatchIds: string[] = [];
  const recipients: Array<{ email: string; resendEmailId: string }> = [];
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
          // Tags travel through to every webhook event for this
          // email. The receiver reads tags.token + tags.send_id
          // to insert an event row without scanning Notion.
          // Resend tag rules: name ≤ 256, value ≤ 256, only
          // alphanumeric + - + _ allowed. Tokens are UUIDs and
          // send ids are too, so both fit.
          tags: [
            { name: "token", value: token },
            { name: "send_id", value: sendId },
          ],
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
      // Resend returns `data` in the same order as the request
      // array, so index N in the response corresponds to chunk[N]
      // in the request.
      (json.data ?? []).forEach((d, idx) => {
        if (d.id) {
          resendBatchIds.push(d.id);
          const recipient = chunk[idx];
          if (recipient) {
            recipients.push({ email: recipient.to, resendEmailId: d.id });
          }
        }
      });
    } catch {
      /* ignore parse errors — sentCount is correct */
    }
  }

  // Stamp history entry. Capped at NEWSLETTER_HISTORY_CAP entries.
  // The id was generated earlier (sendId) so it could be tagged
  // on every Resend message — same id appears in webhook events,
  // letting the dashboard correlate events back to this row.
  const historyEntry = {
    id: sendId,
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
    recipients,
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

// Brand helpers (pickLogoUrl, pickBrandColor) live in
// @/lib/newsletter/brand and are imported below — same source for
// the send + the preview routes so what customers see in preview
// matches what subscribers receive.
