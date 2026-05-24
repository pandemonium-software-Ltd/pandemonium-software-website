// GET /api/admin/preview-template — render any customer email
// template in the browser to verify branding, copy, and CTAs.
//
// Auth: basic auth via middleware (matches /api/admin/*).
//
// Query params:
//   id=<template-id>   Required. e.g. "domain-no-action-needed".
//   values=<json>      Optional JSON-encoded slot values. Defaults
//                      to representative placeholders below so the
//                      page renders for any template without forcing
//                      Ben to supply slot data each time.
//
// Render-only — never sends. Just returns the HTML produced by
// wrapInBrandedHtml so Ben can eyeball the ModuForge branding.

import { NextResponse } from "next/server";
import { getTemplate, renderTemplate, listTemplates } from "@/lib/templates";
import { wrapInBrandedHtml } from "@/ops-worker/notify";

export const runtime = "nodejs";

// Sensible defaults so any template renders without query plumbing.
// Slots not in this map fall back to "[slot-name]" which still
// renders — it just visually flags an unsupplied value.
const DEFAULT_VALUES: Record<string, string> = {
  customerName: "Alex",
  businessName: "Alex's Bakery",
  domain: "alexsbakery.co.uk",
  ns1: "aron.ns.cloudflare.com",
  ns2: "nina.ns.cloudflare.com",
  confirmUrl: "https://modu-forge.co.uk/api/onboarding/dns-confirm/preview",
  hubUrl: "https://modu-forge.co.uk/onboarding/preview",
  qualifyUrl: "https://modu-forge.co.uk/qualify/preview",
  intakeUrl: "https://modu-forge.co.uk/intake/preview",
  hubLoginUrl: "https://modu-forge.co.uk/onboarding/preview",
  previewUrl: "https://preview.modu-forge.co.uk/alexsbakery",
  liveUrl: "https://alexsbakery.co.uk",
  dashboardUrl: "https://modu-forge.co.uk/dashboard/preview",
  resetUrl: "https://modu-forge.co.uk/reset/preview",
  unsubscribeUrl: "https://alexsbakery.co.uk/unsubscribe/preview",
  confirmSubscribeUrl: "https://alexsbakery.co.uk/confirm/preview",
  changeRequestSummary: "Update the opening hours on the homepage",
  originalMessage: "Update the opening hours on the homepage",
  timeline: "by end of week",
  modulesAdded: "Newsletter",
  modulesRemoved: "Offers",
  monthlyDelta: "+£18.00",
  effectiveDate: "1 June 2026",
  cardLast4: "4242",
  cardBrand: "Visa",
  monthLabel: "May 2026",
  pageviews: "234",
  uniques: "187",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    // Absolute href avoids ambiguity around how the browser
    // canonicalises a relative `?id=...` against /api/admin/...
    // (Next.js sometimes serves /api routes with a virtual trailing
    // slash which then resolves the query against the wrong base
    // and 404s on click.)
    const base = `${url.origin}${url.pathname}`;
    const ids = listTemplates()
      .map(
        (t) =>
          `<li><a href="${base}?id=${encodeURIComponent(t.id)}" style="color:#0f1d30;font-family:monospace;text-decoration:none;border-bottom:1px solid #b4c6dd;">${t.id}</a> <span style="color:#5d82ab;font-size:12px;">(${t.riskTier})</span></li>`,
      )
      .join("");
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ModuForge — Template previews</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:32px 24px;background:#fdfcf9;color:#172a42;max-width:720px;margin:0 auto;">
<div style="font-family:Georgia,serif;font-size:26px;font-weight:600;color:#0f1d30;letter-spacing:-0.02em;">ModuForge</div>
<div style="margin-top:6px;font-size:11px;color:#5d82ab;text-transform:uppercase;letter-spacing:0.12em;">by Pandamonium Software</div>
<div style="margin:14px 0 28px;width:32px;height:2px;background-color:#f97316;border-radius:1px;"></div>
<h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 8px;color:#0f1d30;">Email template previews</h1>
<p style="margin:0 0 20px;color:#5d82ab;">Pick a template to render with default placeholder values:</p>
<ul style="line-height:2.2;padding-left:20px;">${ids}</ul>
</body>
</html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  let template;
  try {
    template = getTemplate(id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown template" },
      { status: 404 },
    );
  }

  // Build values: query override > defaults > "[slot]" placeholder
  // for anything still missing.
  let overrides: Record<string, string> = {};
  const valuesParam = url.searchParams.get("values");
  if (valuesParam) {
    try {
      overrides = JSON.parse(valuesParam);
    } catch {
      return NextResponse.json(
        { error: "values param must be valid JSON" },
        { status: 400 },
      );
    }
  }
  const values: Record<string, string> = {};
  for (const key of template.required) {
    values[key] =
      overrides[key] ?? DEFAULT_VALUES[key] ?? `[${key}]`;
  }
  for (const key of template.optional ?? []) {
    if (key in overrides) values[key] = overrides[key];
    else if (key in DEFAULT_VALUES) values[key] = DEFAULT_VALUES[key];
  }

  const rendered = renderTemplate(template, values);
  const html = wrapInBrandedHtml({
    subject: rendered.subject,
    body: rendered.body,
    cta: rendered.cta,
    secondaryCta: rendered.secondaryCta,
  });
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
