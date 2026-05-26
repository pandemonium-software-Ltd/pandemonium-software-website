// POST /api/account/billing-portal — mints a one-shot Stripe
// Billing Portal session URL for the authenticated customer and
// returns it. Browser redirects to the URL; Stripe hosts the rest
// (card updates, invoice history, upcoming charges).
//
// Auth: customer session cookie tied to the token (same as the
// other /api/account/* endpoints). Returns 401 if the cookie is
// missing or stale.
//
// Requirements:
//   - Customer must have a stripeCustomerId on their prospect
//     record (set during Checkout). Without it there's nothing to
//     open a portal for — return 409 with a helpful message.
//   - The Stripe Customer Portal must be configured in the Stripe
//     Dashboard at Billing → Customer Portal. We DON'T pass
//     feature flags here; the dashboard config wins. Sub
//     cancellation is intentionally OFF in the portal — we own
//     that flow in /account/cancel so the confirm modal + email
//     + Notion log all match.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProspectByToken } from "@/lib/notion-prospects";
import {
  createCustomerPortalSession,
  isStripeConfigured,
} from "@/lib/stripe";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";
import { site } from "@/lib/site";
import { reportError } from "@/lib/sentry";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
});

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stripe isn't configured on this deployment yet — email Ben directly.",
      },
      { status: 503 },
    );
  }
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
      { error: "Request did not validate." },
      { status: 400 },
    );
  }
  const { token } = parsed.data;

  const auth = await requireCustomerSession(request, token);
  if (!auth.ok) return auth.response;

  const prospect = await getProspectByToken(token);
  if (!prospect) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 },
    );
  }
  if (!prospect.stripeCustomerId) {
    return NextResponse.json(
      {
        error:
          "We can't find your Stripe customer record on file. Email Ben and he'll sort it.",
      },
      { status: 409 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  try {
    const { url } = await createCustomerPortalSession({
      customerId: prospect.stripeCustomerId,
      returnUrl: `${baseUrl}/account/${token}`,
    });
    return NextResponse.json({ url });
  } catch (e) {
    reportError("api/account/billing-portal", e);
    return NextResponse.json(
      {
        error:
          "Couldn't open the billing portal just now. Try again in a minute.",
      },
      { status: 502 },
    );
  }
}
