// Stripe client — PLACEHOLDER for Stage 2A Part 2.
//
// Stage 2A Part 1 only collects intake data. Real Stripe Checkout,
// webhooks, and subscription management arrive in Stage 2A Part 2.
//
// All five Stripe env vars are declared optional in src/lib/env.ts so
// that builds and runtime work without them in Part 1. When Part 2
// lands, we'll:
//   - flip them to required in env.ts
//   - implement createCheckoutSession() below
//   - add /api/stripe-webhook route to listen for payment events
//   - update /payment/[token]/page.tsx to redirect to the Checkout URL
//
// Notes for Part 2:
//   - Stripe SDK works in Cloudflare Workers via the global `fetch`,
//     but you must instantiate it with `httpClient: Stripe.createFetchHttpClient()`
//     because Workers don't have the Node `https` module.
//   - Webhook signature verification needs the async variant:
//     `await stripe.webhooks.constructEventAsync(body, sig, secret)`.
//   - Idempotency keys go in the request options object, not headers.

import Stripe from "stripe";
import { getServerEnvOptional } from "./env";

let cachedStripe: Stripe | null = null;

/**
 * Returns a Stripe client, or null if STRIPE_SECRET_KEY isn't set.
 * Callers must handle the null case gracefully (e.g. show a "payment
 * coming soon" placeholder).
 */
export function getStripe(): Stripe | null {
  if (cachedStripe) return cachedStripe;
  const env = getServerEnvOptional();
  if (!env.STRIPE_SECRET_KEY) return null;
  cachedStripe = new Stripe(env.STRIPE_SECRET_KEY, {
    // Pin the API version so future Stripe upgrades don't silently change
    // response shapes. Update this string deliberately when upgrading.
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
    // Mirror the Notion client's CPU-budget-aware timeout.
    timeout: 8_000,
  });
  return cachedStripe;
}

/**
 * Returns whether Stripe is configured. Use this in the payment page
 * to decide between showing the real Checkout flow or the placeholder.
 */
export function isStripeConfigured(): boolean {
  const env = getServerEnvOptional();
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_PUBLIC_KEY &&
      env.STRIPE_SETUP_PRICE_ID &&
      env.STRIPE_SUBSCRIPTION_PRICE_ID,
  );
}

// ---------- Stage 2A Part 2 — implementations to add ----------

// TODO(Part 2): export async function createCheckoutSession({
//   prospectToken,
//   prospectEmail,
//   setupFeePence,
//   monthlyFeePence,
// }: {
//   prospectToken: string;
//   prospectEmail: string;
//   setupFeePence: number;
//   monthlyFeePence: number;
// }): Promise<{ url: string }> { ... }

// TODO(Part 2): export async function verifyWebhookSignature(
//   body: string,
//   signature: string,
// ): Promise<Stripe.Event> { ... }

// TODO(Part 2): export async function handlePaymentSucceeded(
//   event: Stripe.Event,
// ): Promise<void> { ... }
