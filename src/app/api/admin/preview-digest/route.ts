// GET /api/admin/preview-digest — preview + manually trigger a
// monthly digest send for any customer.
//
// Auth: basic auth via middleware (matches /api/admin/*).
//
// Query params:
//   token=<uuid>       Customer token. Defaults to Lucas-MyGem.
//   month=YYYY-MM      Month the digest covers. Defaults to the
//                      CURRENT month so test data lands somewhere.
//   send=true          Actually email. Otherwise returns HTML for
//                      browser preview.
//   to=<email>         Override recipient. Defaults to prospect.email.
//
// Render-only mode is the default — Ben hits the URL in a browser
// and sees the email as it would arrive in an inbox. Add ?send=true
// only when ready to fire for real.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getProspectByToken } from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";
import {
  readDigestPayload,
  lastCompletedMonth,
} from "@/lib/monthly-digest";
import { renderMonthlyDigest } from "@/lib/monthly-digest-email";
import { site } from "@/lib/site";
import type { D1Database } from "@/lib/d1-analytics";

export const runtime = "nodejs";

const LUCAS_TOKEN = "d930bdb5-f015-44e5-afcc-f741a3c98d8a";
const FROM_ADDRESS = "ModuForge <results@modu-forge.co.uk>";
const REPLY_TO = "benpandher@proton.me";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || LUCAS_TOKEN;
  const monthParam = url.searchParams.get("month");
  const send = url.searchParams.get("send") === "true";
  const toOverride = url.searchParams.get("to");

  // Month resolution: explicit YYYY-MM wins; otherwise default to
  // the current calendar month so Lucas's recent backfill data
  // actually shows up in preview.
  let month: { monthKey: string; monthLabel: string };
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map((s) => Number.parseInt(s, 10));
    const labelDate = new Date(Date.UTC(y, m - 1, 15));
    month = {
      monthKey: monthParam,
      monthLabel: labelDate.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  } else {
    // Default = current calendar month (in-progress) so test data
    // shows. Differs from the cron, which uses lastCompletedMonth().
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    month = {
      monthKey,
      monthLabel: now.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json(
      { error: `Prospect not found for token=${token}` },
      { status: 404 },
    );
  }

  const cfCtx = getCloudflareContext();
  const cfEnv = cfCtx.env as Record<string, unknown>;
  const db = cfEnv.pandemonium_analytics as D1Database | undefined;
  if (!db) {
    return NextResponse.json(
      { error: "D1 binding missing." },
      { status: 503 },
    );
  }

  const payload = await readDigestPayload({ db, prospect, month });

  const firstName = (prospect.name.split(/\s+/)[0] ?? prospect.name).trim();
  const businessName = prospect.business || prospect.name;
  const dashboardUrl = `${site.url.replace(/\/$/, "")}/account/${prospect.token}`;
  const rendered = renderMonthlyDigest({
    firstName,
    businessName,
    dashboardUrl,
    payload,
  });

  if (!send) {
    // Render-only: return the HTML directly so browsers display
    // the email. Useful for visual review without spamming inboxes.
    return new Response(rendered.html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Actually send via Resend.
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not set." },
      { status: 503 },
    );
  }
  const recipient = toOverride || prospect.email;
  if (!recipient) {
    return NextResponse.json(
      { error: "No recipient email. Provide ?to= or set the prospect's email." },
      { status: 400 },
    );
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [recipient],
      reply_to: REPLY_TO,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [
        { name: "kind", value: "monthly_digest_test" },
        { name: "token", value: prospect.token },
        { name: "month", value: month.monthKey },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    return NextResponse.json(
      {
        error: `Resend ${res.status}`,
        detail: errText.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const resendData = (await res.json().catch(() => ({}))) as {
    id?: string;
  };
  return NextResponse.json({
    success: true,
    sentTo: recipient,
    month: month.monthKey,
    subject: rendered.subject,
    resendEmailId: resendData.id,
    summary: {
      pageviews: payload.website.pageviews,
      uniques: payload.website.uniques,
      pageviewsDeltaPct: payload.website.pageviewsDeltaPct,
      topPagesCount: payload.website.topPages.length,
      hasNewsletter: payload.newsletter !== null,
    },
  });
}
