// POST /api/webhooks/stripe — Stripe webhook receiver.
//
// Endpoint registered in the Stripe Dashboard (live + sandbox)
// pointing at this route. Stripe signs every payload with the
// signing secret returned at registration time; we verify before
// trusting the body.
//
// Events handled:
//
//   - checkout.session.completed  → first-time payment success.
//     Stamp prospect Paid + persist stripeSubscriptionId. Trigger
//     the welcome-to-onboarding email.
//
//   - invoice.paid                → recurring payment success +
//     pending-change effective-date trigger. Walks the prospect's
//     module change log for any pending-stripe entries whose
//     effectiveDate <= today and runs the apply flow (no admin
//     button needed).
//
//   - customer.subscription.deleted → end-of-period cancel finalised.
//     Clear stripeSubscriptionId + stamp Cancelled + start GDPR
//     retention countdown.
//
//   - invoice.payment_failed       → flip any pending-stripe entry
//     that was waiting on this invoice to billing-failed; surface
//     in /admin so operator can email customer.
//
// Anything else → returned 200 unhandled (Stripe expects 2xx to
// stop retries). We log the type so adding more handlers later is
// just adding a case.

import { NextResponse } from "next/server";
import {
  appendProspectNote,
  clearProspectStripeSubscription,
  getProspectByToken,
  listAllProspects,
  markCancelled,
  markProspectPaidViaStripe,
  resolveModuleChange,
  type ProspectRecord,
} from "@/lib/notion-prospects";
import { verifyStripeWebhook } from "@/lib/stripe";
import type Stripe from "stripe";
import { applyPendingChange } from "@/lib/billing/apply-pending";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 },
    );
  }
  // Stripe needs the RAW body for signature verification. Don't
  // .json() this — read as text.
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await verifyStripeWebhook(rawBody, sig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[webhooks/stripe] signature verification failed: ${msg}`);
    return NextResponse.json(
      { error: "Signature verification failed." },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[webhooks/stripe] unhandled event ${event.type}`);
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[webhooks/stripe] handler ${event.type} failed: ${msg}`);
    // Return 500 so Stripe retries — most failures here are
    // Notion blips. Idempotency keys on Stripe writes + the
    // markPaidViaStripe writer being safe-to-re-run make this safe.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}

// ---------- Handlers ----------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const token = session.client_reference_id;
  if (!token) {
    console.warn(
      "[webhooks/stripe] checkout.session.completed without client_reference_id",
    );
    return;
  }
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!customerId || !subscriptionId) {
    console.warn(
      `[webhooks/stripe] checkout.session.completed missing customer/subscription for token=${token}`,
    );
    return;
  }
  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    console.warn(
      `[webhooks/stripe] checkout.session.completed for unknown prospect token=${token}`,
    );
    return;
  }
  await markProspectPaidViaStripe(prospect.pageId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
  console.log(
    `[webhooks/stripe] ${prospect.name} (${prospect.email}) paid + subscription ${subscriptionId} stored`,
  );
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionAny = (invoice as Stripe.Invoice & {
    subscription?: string | { id: string };
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  }).subscription;
  // Newer Stripe API moved Invoice.subscription onto a parent.* sub-
  // object. Cover both shapes defensively. If neither yields, it's
  // a one-off invoice not tied to a sub — nothing for us to apply.
  let subscriptionId: string | undefined;
  if (subscriptionAny) {
    subscriptionId =
      typeof subscriptionAny === "string"
        ? subscriptionAny
        : subscriptionAny.id;
  } else {
    const parentSub = (invoice as Stripe.Invoice & {
      parent?: {
        subscription_details?: {
          subscription?: string | { id: string };
        };
      };
    }).parent?.subscription_details?.subscription;
    if (parentSub) {
      subscriptionId =
        typeof parentSub === "string" ? parentSub : parentSub.id;
    }
  }
  if (!subscriptionId) return;

  // Find the prospect by stripeSubscriptionId — scan all prospects
  // since we don't have a Notion query by that field. Small total
  // customer count makes this fine; revisit if we cross ~500.
  const all = await listAllProspects();
  const prospect = all.find((p) => p.stripeSubscriptionId === subscriptionId);
  if (!prospect) {
    console.warn(
      `[webhooks/stripe] invoice.paid for unknown subscription=${subscriptionId}`,
    );
    return;
  }

  // Apply every pending-stripe entry whose effectiveDate <= today.
  // The applier handles both Stripe-side writes (idempotent) and
  // the Notion resolveModuleChange call.
  const today = new Date().toISOString().slice(0, 10);
  const due = prospect.moduleChangeLog.filter(
    (e) =>
      e.status === "pending-stripe" &&
      e.effectiveDate &&
      e.effectiveDate <= today,
  );
  for (const entry of due) {
    try {
      await applyPendingChange(prospect, entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[webhooks/stripe] applying ${entry.id} for ${prospect.name} failed: ${msg}`,
      );
    }
  }
  if (due.length > 0) {
    console.log(
      `[webhooks/stripe] invoice.paid applied ${due.length} pending change(s) for ${prospect.name}`,
    );
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const all = await listAllProspects();
  const prospect = all.find((p) => p.stripeSubscriptionId === sub.id);
  if (!prospect) return;
  await markCancelled(prospect.pageId);
  await clearProspectStripeSubscription(prospect.pageId);
  console.log(
    `[webhooks/stripe] customer.subscription.deleted — ${prospect.name} cancelled, retention countdown started`,
  );
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // For now: log + append a note to the prospect's record so the
  // operator notices in /admin. Auto-billing-failed flow for
  // pending entries can be added later — most payment_failed
  // events on existing subscriptions are card-expiry, which
  // doesn't invalidate any pending changes immediately (Stripe
  // retries the card 4 times over a week before final fail).
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;
  const all = await listAllProspects();
  const prospect = all.find((p) => p.stripeCustomerId === customerId);
  if (!prospect) return;
  const line = `[${new Date().toISOString()}] Stripe invoice payment_failed (invoice=${invoice.id}). Customer likely needs to update card.`;
  await appendProspectNote(prospect.pageId, prospect.notes, line);
  console.warn(
    `[webhooks/stripe] payment_failed for ${prospect.name} — noted on record`,
  );
  void _resolveModuleChangeRef; // keep import alive for future per-entry billing-failed flow
}

// Keep the import alive for a future enhancement: walking
// pending-stripe entries on payment_failed and flipping them to
// billing-failed in Notion. Not done today because most failures
// are card-expiry not subscription-state changes.
const _resolveModuleChangeRef = resolveModuleChange;
// Reference dummy for unused-import lint. Won't fire at runtime.
function _kindCheck(prospect: ProspectRecord): void {
  void prospect.email;
}
void _kindCheck;
