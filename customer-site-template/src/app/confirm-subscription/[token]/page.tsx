// /confirm-subscription/[token]?c=<customerToken> — landing page
// the subscriber lands on when they click the confirm link in the
// newsletter-confirm-subscribe email.
//
// Lives on the CUSTOMER's site (not the marketing site) so the
// subscriber stays in the customer's branded environment after
// clicking through. The actual Notion mutation happens on the
// marketing site via POST /api/public/confirm-subscription —
// this page just wraps the API call in a branded success/failure
// UI.

import type { Metadata } from "next";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Confirming your subscription…",
  description:
    "Confirming your subscription to our newsletter.",
  robots: { index: false, follow: false },
};

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIRM_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

// Force dynamic rendering — this page does a server-side fetch
// per request (the confirm token differs per visitor). Without
// `force-dynamic` Next.js would try to statically generate it
// at build time, which would fail because there's no static
// confirmToken to use.
export const dynamic = "force-dynamic";

export default async function ConfirmSubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { token: confirmToken } = await params;
  const { c: customerToken = "" } = await searchParams;
  const { business, modules } = SITE_DATA;

  if (!CONFIRM_TOKEN_RE.test(confirmToken) || !TOKEN_RE.test(customerToken)) {
    return (
      <ResultCard
        title="That link doesn't look right."
        body="It might be a typo, or the link might have expired. Try subscribing again from the homepage."
        kind="error"
      />
    );
  }

  // Marketing-site origin for the API call. Newsletter module
  // config carries it; if absent (shouldn't be — newsletter is
  // bought iff the module is configured), fall back to the canonical
  // production URL so we never hit "undefined" in the URL.
  const apiOrigin = (modules.newsletter?.apiOrigin ?? "https://modu-forge.co.uk")
    .replace(/\/$/, "");

  type ApiSuccess = {
    success: true;
    businessName?: string;
    alreadyConfirmed?: boolean;
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
  function errorMessageOf(r: unknown): string | undefined {
    if (
      typeof r === "object" &&
      r !== null &&
      (r as ApiResult).success === false
    ) {
      return (r as ApiFailure).error;
    }
    return undefined;
  }

  let raw: unknown = null;
  try {
    const res = await fetch(`${apiOrigin}/api/public/confirm-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmToken, customerToken }),
      // No-cache: this is a one-shot mutation, never cache the
      // response.
      cache: "no-store",
    });
    raw = await res.json().catch(() => null);
    if (!res.ok && !raw) {
      raw = { success: false, error: `HTTP ${res.status}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[confirm-subscription page] fetch failed:", msg);
    raw = { success: false, error: msg };
  }

  if (!isSuccess(raw)) {
    return (
      <ResultCard
        title="Couldn't confirm just now."
        body={
          errorMessageOf(raw) ??
          "Try refreshing in a minute. If it still doesn't work, the business will follow up."
        }
        kind="error"
      />
    );
  }

  const senderName = raw.businessName ?? business.name;
  return (
    <ResultCard
      title="You're in 🎉"
      body={`Thanks for confirming. You'll get a short update from ${senderName} roughly once a month — no spam, ever. You can unsubscribe any time using the link at the bottom of every email.`}
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
          <p className="eyebrow text-brand-primary-700">Confirmed</p>
        )}
        <h1 className="heading-2 mt-2">{title}</h1>
        <p className="prose-body mt-4 text-navy-700">{body}</p>
      </div>
    </main>
  );
}
