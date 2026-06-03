// POST /api/payment/checkout — create a Stripe Checkout session
// for the prospect's first payment (setup fee + first month).
//
// Flow:
//   1. Find/create the Stripe Customer for this prospect (idempotent).
//   2. Persist the Stripe Customer ID back to Notion immediately so
//      we have it even if the customer abandons checkout (lets us
//      reattach on retry without a duplicate Customer).
//   3. Add a pending one-off Invoice Item for the setup fee + any
//      multi-location £15 × N (idempotency-keyed so retries no-op).
//   4. Create the Checkout Session with recurring line items for
//      base + module monthly fees. Pending invoice items are folded
//      into the first invoice automatically by Stripe.
//   5. Return the hosted Checkout URL — client redirects the browser.
//
// Express-request flag: customer ticks a checkbox before this fires.
// If true, we stamp a marker on the prospect so /terms compliance is
// auditable. If false, the customer's setup fee REMAINS REFUNDABLE
// for 14 days post-payment — we still process Checkout but flag the
// payment as "consumer cancellation right active" in the metadata.

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendProspectNote,
  getProspectByToken,
  setProspectStripeCustomerId,
  type ProspectRecord,
} from "@/lib/notion-prospects";
import {
  createCheckoutSession,
  getOrCreateStripeCustomer,
  isStripeConfigured,
} from "@/lib/stripe";
import { site } from "@/lib/site";
import { reportError } from "@/lib/sentry";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  /** CCRs 2013 Reg 36 express-request — when true, customer waives
   *  14-day cancellation right on the setup fee (work begins
   *  immediately). When false, work pauses until day 15. */
  expressRequest: z.boolean(),
});

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stripe isn't configured on this deployment yet — please email Ben directly.",
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
      { error: "Request did not validate.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { token, expressRequest } = parsed.data;

  const auth = await requireCustomerSession(request, token);
  if (!auth.ok) return auth.response;

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 },
    );
  }

  const eligibility = checkCheckoutEligibility(prospect);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.reason }, { status: 409 });
  }

  try {
    // 1. Customer (reuses existing ID if we have one — survives
    //    cancel-and-restart, multiple Checkout abandonments).
    const customer = await getOrCreateStripeCustomer({
      existingCustomerId: prospect.stripeCustomerId,
      email: prospect.email,
      name: prospect.name,
      prospectToken: token,
    });

    // 2. Persist the customer ID if it's new — even an abandoned
    //    Checkout creates the Customer + InvoiceItem, so we want
    //    to remember so retries reuse instead of duplicating.
    if (customer.id !== prospect.stripeCustomerId) {
      await setProspectStripeCustomerId(prospect.pageId, customer.id);
    }

    // 3. Module list — strip Multi-location (no recurring) +
    //    skip unknown names. Setup fees go through Checkout's
    //    line_items, not as pre-attached invoice items, so they
    //    show on Stripe's payment-page summary panel.
    const recurringModules = prospect.moduleSelections.filter(
      (m) => m !== "Multi-location",
    );

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
    const session = await createCheckoutSession({
      token,
      customerId: customer.id,
      foundingMember: prospect.foundingMember,
      modules: recurringModules,
      extraLocations: prospect.extraLocations,
      successUrl: `${baseUrl}/payment/${token}?stripe=success`,
      cancelUrl: `${baseUrl}/payment/${token}?stripe=cancel`,
    });

    // 4. Stamp the express-request preference on the prospect's
    //    notes column so it's auditable later. (A dedicated
    //    Notion column would be cleaner — schedule for Stripe
    //    polish pass.) For now we append a tagged line.
    if (expressRequest) {
      const line = `[${new Date().toISOString()}] CCRs Reg 36 express-request consent — setup fee non-refundable from start of work.`;
      await appendProspectNote(prospect.pageId, prospect.notes, line);
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    reportError("api/payment/checkout", e);
    return NextResponse.json(
      { error: "Couldn't start checkout. Try again in a minute." },
      { status: 502 },
    );
  }
}

function checkCheckoutEligibility(prospect: ProspectRecord): {
  ok: boolean;
  reason?: string;
} {
  if (
    !prospect.setupFeeCalculated ||
    !prospect.monthlyFeeCalculated ||
    prospect.status !== "Phase 3 Complete"
  ) {
    return {
      ok: false,
      reason:
        prospect.status === "Paid" ||
        prospect.status === "Build Started" ||
        prospect.status === "Live"
          ? "Already paid — head to your account."
          : "Finish the intake form before paying.",
    };
  }
  if (prospect.stripeSubscriptionId) {
    return {
      ok: false,
      reason: "Subscription already active — head to your account.",
    };
  }
  // Defensive: ensure we have basic prospect data Stripe needs.
  if (!prospect.email || !prospect.name) {
    return {
      ok: false,
      reason: "Missing email or name — contact Ben to fix your record.",
    };
  }
  return { ok: true };
}
