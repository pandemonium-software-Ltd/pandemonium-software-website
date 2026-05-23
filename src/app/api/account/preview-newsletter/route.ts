// POST /api/account/preview-newsletter — render a newsletter preview.
//
// Takes the same content shape as the send endpoint, returns the
// rendered HTML — but doesn't send anything, doesn't update Notion,
// doesn't increment any counter. Used by the composer's live
// preview pane so the customer sees the exact output their
// subscribers would receive before hitting send.
//
// Auth: session-gated like the rest of /api/account/*. A customer
// can only preview newsletters for their own token.
//
// Same brand-resolution helpers as the send route — preview output
// matches what we actually send.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProspectByToken } from "@/lib/notion-prospects";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import {
  renderNewsletter,
  type NewsletterTemplateId,
} from "@/lib/newsletter/render";
import {
  NEWSLETTER_SUBJECT_MAX,
  NEWSLETTER_BODY_MAX,
} from "@/lib/newsletter/limits";
import { pickLogoUrl, pickBrandColor } from "@/lib/newsletter/brand";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Looser schema than the send route — preview is forgiving so the
// customer can start typing and see the layout before they've
// written a full subject line. min(0) on the body / subject lets
// the preview render with placeholders ("(empty subject)").
// Mirror the send route's cap so preview rejects requests the
// send would too (4 inline images). Kept in lock-step via a
// shared constant would be nicer, but the value rarely changes.
const MAX_IMAGES_PER_NEWSLETTER = 4;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  template: z.enum([
    "announcement",
    "monthly-update",
    "promo",
    "personal-note",
  ]),
  subject: z.string().max(NEWSLETTER_SUBJECT_MAX).default(""),
  body: z.string().max(NEWSLETTER_BODY_MAX).default(""),
  images: z
    .array(
      z.object({
        url: z.string().max(2000),
        size: z.enum(["small", "medium", "large"]).optional(),
      }),
    )
    .max(MAX_IMAGES_PER_NEWSLETTER)
    .optional(),
  ctaLabel: z.string().max(40).optional(),
  ctaUrl: z.string().max(500).optional(),
});

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
  const { token, template, subject, body, images, ctaLabel, ctaUrl } =
    parsed.data;
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }
  const ob = (prospect.onboardingData ?? {}) as Record<string, unknown>;

  // Placeholder unsubscribe URL — preview is never sent so the
  // URL doesn't need to be real, but we include it so the footer
  // renders + sizes correctly.
  const previewUnsubscribeUrl = "#preview-no-unsubscribe";
  // Customer's domain if captured, for the "View site" footer link.
  const domainCaptured = (ob.domain ?? {}) as { domain?: string };
  const websiteUrl = domainCaptured.domain
    ? `https://${domainCaptured.domain}`
    : undefined;

  // Strip empty-URL slots — the composer may include a placeholder
  // row before the customer has uploaded/pasted a URL, and we don't
  // want the renderer to emit an <img src=""> for those.
  const validImages = (images ?? []).filter((i) => i.url && i.url.trim());
  const rendered = renderNewsletter(
    {
      template: template as NewsletterTemplateId,
      subject: subject || "(no subject yet)",
      body: body || "(start typing your newsletter — the preview updates as you type)",
      images: validImages.length > 0 ? validImages : undefined,
      ctaLabel: ctaLabel || undefined,
      ctaUrl: ctaUrl || undefined,
    },
    {
      senderName: prospect.business || prospect.name,
      logoUrl: pickLogoUrl(ob),
      primaryColor: pickBrandColor(ob, "primary"),
      secondaryColor: pickBrandColor(ob, "secondary"),
    },
    { unsubscribeUrl: previewUnsubscribeUrl, websiteUrl },
  );

  return NextResponse.json({
    success: true,
    subject: rendered.subject,
    html: rendered.html,
  });
}
