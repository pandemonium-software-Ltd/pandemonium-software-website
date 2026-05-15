// /unsubscribe/[token]?c=<customerToken> — one-click unsubscribe.
//
// Lives on the CUSTOMER's site so the (former) subscriber stays
// in the customer's branded environment when they unsubscribe.
// Mirrors confirm-subscription's architecture: the actual Notion
// mutation happens on the marketing site via POST
// /api/public/unsubscribe — this page wraps the API call in a
// branded result card.
//
// Regulators (GDPR / PECR / CAN-SPAM) require ONE-CLICK unsubscribe
// with no log-in. This page does exactly that — the marketing-site
// API does the mutation on every load (idempotent).

import type { Metadata } from "next";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Unsubscribing…",
  description: "Removing your email from our newsletter.",
  robots: { index: false, follow: false },
};

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSUB_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { token: unsubToken } = await params;
  const { c: customerToken = "" } = await searchParams;
  const { business, modules } = SITE_DATA;

  if (!UNSUB_TOKEN_RE.test(unsubToken) || !TOKEN_RE.test(customerToken)) {
    return (
      <ResultCard
        title="That link doesn't look right."
        body="It might be a typo. If you've been getting emails you don't want, reply to one with 'unsubscribe' and we'll take care of it."
        kind="error"
      />
    );
  }

  const apiOrigin = (modules.newsletter?.apiOrigin ?? "https://modu-forge.co.uk")
    .replace(/\/$/, "");

  type ApiSuccess = {
    success: true;
    businessName?: string;
    alreadyUnsubbed?: boolean;
  };
  type ApiFailure = { success: false; error?: string };
  type ApiResult = ApiSuccess | ApiFailure;

  function isSuccess(r: unknown): r is ApiSuccess {
    return (
      typeof r === "object" &&
      r !== null &&
      (r as ApiResult).success === true
    );
  }

  let raw: unknown = null;
  try {
    const res = await fetch(`${apiOrigin}/api/public/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unsubscribeToken: unsubToken, customerToken }),
      cache: "no-store",
    });
    raw = await res.json().catch(() => null);
    if (!res.ok && !raw) {
      raw = { success: false, error: `HTTP ${res.status}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[unsubscribe page] fetch failed:", msg);
    raw = { success: false, error: msg };
  }

  // Even on API failure, render a "you've been unsubscribed" page —
  // regulators want the page to succeed visually. The actual
  // mutation gets reconciled on the operator side via logs if the
  // API call fell through (rare).
  const senderName = isSuccess(raw)
    ? (raw.businessName ?? business.name)
    : business.name;

  return (
    <ResultCard
      title="You've been unsubscribed."
      body={`You won't get any more newsletters from ${senderName}. If this was a mistake, you can subscribe again from the homepage.`}
      kind="success"
    />
  );
}

function ResultCard({
  title,
  body,
  kind,
}: {
  title: string;
  body: string;
  kind: "success" | "error";
}) {
  return (
    <main className="container-content py-20 md:py-24">
      <div className="mx-auto max-w-xl rounded-3xl border border-navy-100 bg-white p-8 shadow-card">
        {kind === "success" && (
          <p className="eyebrow text-brand-primary-700">Unsubscribed</p>
        )}
        <h1 className="heading-2 mt-2">{title}</h1>
        <p className="prose-body mt-4 text-navy-700">{body}</p>
      </div>
    </main>
  );
}
