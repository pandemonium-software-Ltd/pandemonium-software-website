// Stripe client — Stage 2A Part 2 (live 2026-05-25).
//
// Owns every Stripe API call from the marketing site. Cloudflare
// Workers require the fetch http client (no node:https). API version
// is pinned so future Stripe upgrades don't surprise the response
// shapes — bump deliberately when upgrading via the `@upgrade-stripe`
// skill.
//
// What lives here:
//   - createCheckoutSession  — first-pay Subscription flow with
//     setup-fee + multi-location as one-off invoice items
//   - constructEventAsync    — async webhook signature verification
//     (Workers don't have synchronous crypto, hence the async API)
//   - addSubscriptionItem / removeSubscriptionItem — per-module
//     monthly add-on edits triggered by post-launch module changes
//   - addOneOffInvoiceItem   — setup-fee delta + multi-location
//     £15 × N invoice items on the customer's NEXT invoice
//   - cancelSubscription      — cancel-now (immediate) or
//     cancel-at-period-end (free) variants
//
// Idempotency keys are passed by callers per-change (the
// ModuleChangeLogEntry.id is the natural key — re-running the same
// apply path with the same change ID is a no-op).

import Stripe from "stripe";
import { getServerEnvOptional } from "./env";
import {
  STRIPE_BASE_FOUNDING_PRICE_ID,
  STRIPE_BASE_STANDARD_PRICE_ID,
  STRIPE_MODULE_PRICE_IDS,
} from "./stripe-products";
import {
  BASE_SETUP_GBP,
  FOUNDING_MEMBER_SETUP_GBP,
  MODULE_BOOKING_SETUP_GBP,
  MODULE_ENQUIRY_SETUP_GBP,
  MODULE_NEWSLETTER_SETUP_GBP,
  MODULE_OFFERS_SETUP_GBP,
  GBP_ADDON_ONE_OFF_GBP,
  MODULE_MULTILOCATION_SETUP_GBP,
} from "./fees";

/** Per-module setup-fee map (pence) — drives the itemised
 *  one-time line items on Checkout. Customer sees a separate
 *  line per module setup on the Stripe payment page. */
const MODULE_SETUP_PENCE: Readonly<Record<string, number>> = {
  "Online Booking": MODULE_BOOKING_SETUP_GBP * 100,
  "Enquiry Form": MODULE_ENQUIRY_SETUP_GBP * 100,
  Newsletter: MODULE_NEWSLETTER_SETUP_GBP * 100,
  Offers: MODULE_OFFERS_SETUP_GBP * 100,
  "Google Business Profile Setup/Audit": GBP_ADDON_ONE_OFF_GBP * 100,
};

let cachedStripe: Stripe | null = null;

/**
 * Returns a Stripe client, or null if STRIPE_SECRET_KEY isn't set.
 * Callers MUST handle the null case — every Stripe-touching endpoint
 * returns a 503 "Stripe not configured" when the key is missing
 * rather than crashing.
 */
export function getStripe(): Stripe | null {
  if (cachedStripe) return cachedStripe;
  const env = getServerEnvOptional();
  if (!env.STRIPE_SECRET_KEY) return null;
  cachedStripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 8_000,
  });
  return cachedStripe;
}

/** Quick boolean for UI gating ("show real Checkout vs placeholder"). */
export function isStripeConfigured(): boolean {
  const env = getServerEnvOptional();
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

// ---------- Customer + Checkout session ----------

/**
 * Find an existing Stripe Customer by ID or create one keyed by
 * the prospect's token + email. Idempotent on the ID-path; on the
 * create-path, the prospect_token metadata + idempotency key
 * combine to ensure a single Customer per prospect across retries.
 */
export async function getOrCreateStripeCustomer(args: {
  existingCustomerId?: string;
  email: string;
  name: string;
  prospectToken: string;
}): Promise<Stripe.Customer> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured.");
  if (args.existingCustomerId) {
    const c = await stripe.customers.retrieve(args.existingCustomerId);
    // Stripe returns a DeletedCustomer placeholder if the customer
    // was deleted in the dashboard — treat as missing and create
    // a new one rather than failing.
    if (!c.deleted) return c;
  }
  return stripe.customers.create(
    {
      email: args.email,
      name: args.name,
      metadata: { prospect_token: args.prospectToken },
    },
    { idempotencyKey: `customer:${args.prospectToken}` },
  );
}

export type CheckoutSelection = {
  /** Customer's prospect token — used as Checkout's `client_reference_id`
   *  so the webhook can map session → prospect without a separate lookup. */
  token: string;
  /** Stripe Customer ID — created via getOrCreateStripeCustomer
   *  BEFORE this call so the same customer record persists across
   *  abandoned Checkout retries. */
  customerId: string;
  /** Whether the customer qualifies for the founding-member price.
   *  Picks STANDARD vs FOUNDING base subscription. */
  foundingMember: boolean;
  /** Module names selected (canonical Notion strings — same set as
   *  MODULE_OPTIONS). Maps to per-module monthly price IDs + setup
   *  fees. Multi-location is treated separately. */
  modules: readonly string[];
  /** Multi-location counter — adds £15 × N as a one-off line item. */
  extraLocations: number;
  /** Success / cancel return URLs. */
  successUrl: string;
  cancelUrl: string;
};

/**
 * Create a Subscription-mode Checkout Session for a prospect's
 * first payment. Mixes one-time setup-fee line items with the
 * recurring monthly subscription items so the customer sees an
 * itemised breakdown on Stripe's payment page:
 *
 *   ─ ModuForge — Site setup ............ £299  one-time
 *   ─ ModuForge — Newsletter setup ......  £49  one-time
 *   ─ ModuForge — Offers setup .......... £19  one-time
 *   ─ ModuForge — Multi-location setup
 *     (1 extra location)  .................... £15  one-time
 *   ─ Standard subscription .............. £29 / month
 *   ─ Newsletter ..........................  £9 / month
 *   ─ Offers ..............................  £6 / month
 *
 * Setup fees use Stripe `price_data` (inline price create) rather
 * than pre-created Prices so we can name each line dynamically
 * (e.g. "Multi-location setup (3 extra locations)"). Recurring
 * lines use the Price IDs created at S1.
 */
export async function createCheckoutSession(
  selection: CheckoutSelection,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe not configured — set STRIPE_SECRET_KEY.");
  }
  const basePriceId = selection.foundingMember
    ? STRIPE_BASE_FOUNDING_PRICE_ID
    : STRIPE_BASE_STANDARD_PRICE_ID;

  const baseSetupPence = selection.foundingMember
    ? FOUNDING_MEMBER_SETUP_GBP * 100
    : BASE_SETUP_GBP * 100;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  // 1. Base setup fee (one-time). The "Setup:" prefix is the
  //    visual cue separating one-off lines from recurring lines
  //    on Stripe Checkout — Stripe doesn't expose section headers
  //    so the prefix is the cleanest way to make the split obvious.
  lineItems.push({
    price_data: {
      currency: "gbp",
      unit_amount: baseSetupPence,
      product_data: {
        name: selection.foundingMember
          ? "Setup: Site + hosting (Founding Member)"
          : "Setup: Site + hosting",
      },
    },
    quantity: 1,
  });

  // 2. Per-module setup fees (one-time). Same "Setup:" prefix.
  for (const moduleName of selection.modules) {
    const setupPence = MODULE_SETUP_PENCE[moduleName];
    if (!setupPence) continue;
    const friendlyName =
      moduleName === "Google Business Profile Setup/Audit"
        ? "Google Business Profile + reviews"
        : moduleName;
    lineItems.push({
      price_data: {
        currency: "gbp",
        unit_amount: setupPence,
        product_data: { name: `Setup: ${friendlyName}` },
      },
      quantity: 1,
    });
  }

  // 3. Multi-location setup fee (one-time) — quantity > 1 when
  //    multiple extra locations; Stripe renders as "qty × £15".
  if (selection.extraLocations > 0) {
    lineItems.push({
      price_data: {
        currency: "gbp",
        unit_amount: MODULE_MULTILOCATION_SETUP_GBP * 100,
        product_data: {
          name: "Setup: Multi-location (per extra location)",
        },
      },
      quantity: selection.extraLocations,
    });
  }

  // 4. Base recurring subscription (Standard or Founding)
  lineItems.push({ price: basePriceId, quantity: 1 });

  // 5. Per-module recurring fees (no Multi-location — no monthly)
  for (const moduleName of selection.modules) {
    const priceId = STRIPE_MODULE_PRICE_IDS[moduleName];
    if (!priceId) continue;
    lineItems.push({ price: priceId, quantity: 1 });
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer: selection.customerId,
      client_reference_id: selection.token,
      success_url: selection.successUrl,
      cancel_url: selection.cancelUrl,
      subscription_data: {
        metadata: { prospect_token: selection.token },
      },
      // Small note under the submit button for extra clarity on
      // top of the "Setup:" line prefixes — Stripe Checkout
      // doesn't allow section headers between line items, so we
      // belt-and-brace with this paragraph.
      custom_text: {
        submit: {
          message:
            "Lines prefixed 'Setup:' are charged once today. The rest are billed monthly until you cancel from your dashboard.",
        },
      },
    },
    {
      // Same idempotency key per prospect token — re-submitting
      // returns the same session rather than spawning duplicates.
      idempotencyKey: `checkout:${selection.token}`,
    },
  );
  if (!session.url) {
    throw new Error("Stripe didn't return a Checkout URL.");
  }
  return { url: session.url, sessionId: session.id };
}

// ---------- Webhook signature verification ----------

/**
 * Verify the Stripe-Signature header against the raw request body.
 * Returns the parsed Stripe.Event on success; throws on bad signature.
 *
 * Uses the async variant — Workers don't have synchronous crypto
 * available in the SubtleCrypto runtime constraints.
 */
export async function verifyStripeWebhook(
  body: string,
  signatureHeader: string,
): Promise<Stripe.Event> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe not configured — set STRIPE_SECRET_KEY.");
  }
  const env = getServerEnvOptional();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured.");
  }
  return stripe.webhooks.constructEventAsync(
    body,
    signatureHeader,
    env.STRIPE_WEBHOOK_SECRET,
  );
}

// ---------- Subscription mutations ----------

/**
 * Add a recurring price (a module monthly fee) to an existing
 * subscription. Idempotency key required so the auto-applier
 * cron can re-run safely. proration_behavior=none — the next
 * invoice picks up the new line at the new monthly rate, no
 * mid-month proration (matches our "effective next billing date"
 * promise on the dashboard).
 */
export async function addModuleToSubscription(args: {
  subscriptionId: string;
  priceId: string;
  idempotencyKey: string;
}): Promise<Stripe.SubscriptionItem> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured.");
  return stripe.subscriptionItems.create(
    {
      subscription: args.subscriptionId,
      price: args.priceId,
      proration_behavior: "none",
      quantity: 1,
    },
    { idempotencyKey: args.idempotencyKey },
  );
}

/**
 * Remove a recurring price from a subscription. Finds the
 * matching SubscriptionItem by priceId then deletes it.
 * Proration: none — line drops off the next invoice cleanly.
 *
 * No-ops gracefully if the item isn't found (already removed).
 */
export async function removeModuleFromSubscription(args: {
  subscriptionId: string;
  priceId: string;
  idempotencyKey: string;
}): Promise<void> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured.");
  const sub = await stripe.subscriptions.retrieve(args.subscriptionId);
  const item = sub.items.data.find((i) => i.price.id === args.priceId);
  if (!item) return;
  await stripe.subscriptionItems.del(item.id, {
    proration_behavior: "none",
  });
}

/**
 * Add a one-off invoice item to the customer's next invoice.
 * Two modes:
 *
 *   - `subscriptionId` set     → attaches to that subscription's
 *     next invoice. Used post-launch for module-setup deltas +
 *     multi-location £15 × N counter changes.
 *
 *   - `subscriptionId` omitted → pending on the customer until
 *     the next invoice (the first subscription invoice from
 *     Checkout, in practice). Used for the initial setup fee
 *     that needs to land on the FIRST Checkout invoice
 *     alongside the recurring lines.
 *
 * Amount in pence. Description shows on the customer's invoice
 * + receipt — keep it customer-facing.
 */
export async function addOneOffInvoiceItem(args: {
  customerId: string;
  subscriptionId?: string;
  amountPence: number;
  description: string;
  idempotencyKey: string;
}): Promise<Stripe.InvoiceItem> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured.");
  return stripe.invoiceItems.create(
    {
      customer: args.customerId,
      ...(args.subscriptionId
        ? { subscription: args.subscriptionId }
        : {}),
      amount: args.amountPence,
      currency: "gbp",
      description: args.description,
    },
    { idempotencyKey: args.idempotencyKey },
  );
}

/**
 * Cancel a subscription. Two flavours:
 *   - "immediate": ends now (used by the dashboard's "cancel now
 *     with prorated refund" flow — the refund itself is a separate
 *     Stripe refund call, NOT done here)
 *   - "at-period-end": runs to end of current period then cancels
 *     (used by the dashboard's "cancel at end of month, no fees" flow)
 */
export async function cancelSubscription(args: {
  subscriptionId: string;
  mode: "immediate" | "at-period-end";
  idempotencyKey: string;
}): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured.");
  if (args.mode === "immediate") {
    return stripe.subscriptions.cancel(args.subscriptionId, {
      invoice_now: false,
      prorate: false,
    });
  }
  return stripe.subscriptions.update(
    args.subscriptionId,
    { cancel_at_period_end: true },
    { idempotencyKey: args.idempotencyKey },
  );
}

/**
 * Create a Stripe Billing Portal session for an existing Customer.
 *
 * The portal is Stripe-hosted: card updates, invoice history,
 * upcoming charges, address changes — all in one self-service UI.
 * We mint a one-shot URL here and redirect the browser; the
 * portal session has a short TTL and is single-use per click.
 *
 * Portal configuration (what features are enabled — sub cancel,
 * sub update, etc.) is set ONCE in the Stripe Dashboard at
 * Billing → Customer Portal. We don't pass configuration here;
 * the default config wins. Cancellation is intentionally NOT
 * enabled in the portal — we own that flow in our own UI so the
 * confirm modal + email + Notion log all match.
 *
 * `returnUrl` is where Stripe sends the customer when they close
 * the portal — typically back to /account/<token>.
 */
export async function createCustomerPortalSession(args: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe not configured — set STRIPE_SECRET_KEY.");
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.returnUrl,
  });
  return { url: session.url };
}

/**
 * Refund part or all of the most recent payment for a subscription.
 * Used by the "cancel now with prorated refund" flow — amount is
 * computed by proratedRefundPounds() on the dashboard and passed
 * through here in pence.
 *
 * Idempotency key required so the auto-applier cron can re-run.
 */
export async function refundLatestSubscriptionPayment(args: {
  customerId: string;
  amountPence: number;
  idempotencyKey: string;
}): Promise<Stripe.Refund | null> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured.");
  // The newer Stripe API moved payment_intent off Invoice to the
  // InvoicePayments list. Simpler path: walk the customer's most
  // recent successful charge, refund that. Works for any single-
  // subscription customer (which is every ModuForge customer
  // today — we don't offer multi-sub bundles).
  const charges = await stripe.charges.list({
    customer: args.customerId,
    limit: 1,
  });
  const latest = charges.data[0];
  if (!latest || latest.status !== "succeeded" || !latest.payment_intent) {
    return null;
  }
  const piId =
    typeof latest.payment_intent === "string"
      ? latest.payment_intent
      : latest.payment_intent.id;
  return stripe.refunds.create(
    {
      payment_intent: piId,
      amount: args.amountPence,
      reason: "requested_by_customer",
    },
    { idempotencyKey: args.idempotencyKey },
  );
}
