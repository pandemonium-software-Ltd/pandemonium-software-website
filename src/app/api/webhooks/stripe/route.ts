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
//   - invoice.payment_failed       → flip pending-stripe entries
//     to billing-failed, revert their module selection, email the
//     customer with CTA to update their card, and note on the
//     prospect record for /admin visibility.
//
//   - charge.dispute.created        → note on prospect record +
//     urgent internal email to Ben. Disputes need a response
//     within 7-21 days.
//
// Anything else → returned 200 unhandled (Stripe expects 2xx to
// stop retries). We log the type so adding more handlers later is
// just adding a case.

import { NextResponse } from "next/server";
import {
  appendProspectNote,
  clearProspectStripeSubscription,
  getProspectByToken,
  getProspectByStripeSubscriptionId,
  getProspectByStripeCustomerId,
  listAllProspects,
  markCancelled,
  markCancelledAndClearSubscription,
  markProspectPaidViaStripe,
  resolveModuleChange,
  type ProspectRecord,
} from "@/lib/notion-prospects";
import { verifyStripeWebhook } from "@/lib/stripe";
import type Stripe from "stripe";
import { applyPendingChange } from "@/lib/billing/apply-pending";
import { reportError } from "@/lib/sentry";
import { sendCustomerEmail } from "@/ops-worker/notify";
import { sendInternalNotification } from "@/lib/email";
import { getServerEnv } from "@/lib/env";
import { site } from "@/lib/site";

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
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      default:
        console.log(`[webhooks/stripe] unhandled event ${event.type}`);
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    reportError(`webhooks/stripe:${event.type}`, e);
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
  // Don't re-fire the phase4 email if we've already marked them
  // Paid (e.g. Stripe retried this webhook). Status check before
  // the PATCH keeps the email exactly-once even though the PATCH
  // itself is idempotent.
  const alreadyPaid = prospect.status === "Paid";
  await markProspectPaidViaStripe(prospect.pageId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
  console.log(
    `[webhooks/stripe] ${prospect.name} (${prospect.email}) paid + subscription ${subscriptionId} stored`,
  );

  // Phase 4 email — "your onboarding hub is ready". Fires once,
  // on the first Paid flip. Fail-soft (logged, doesn't error the
  // webhook — Stripe would retry and we'd send a duplicate email
  // to the customer for what is now a Notion-only blip).
  if (!alreadyPaid) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
      await sendCustomerEmail(
        getServerEnv(),
        prospect.email,
        "phase4-onboarding-hub-ready",
        {
          customerName: firstName(prospect.name),
          onboardingUrl: `${baseUrl}/onboarding/${token}`,
        },
      );
    } catch (e) {
      console.warn(
        `[webhooks/stripe] phase4 email failed for ${prospect.email}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
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

  // Find the prospect by stripeSubscriptionId — targeted Notion query.
  const prospect = await getProspectByStripeSubscriptionId(subscriptionId);
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
      reportError(`webhooks/stripe:apply:${entry.kind ?? "unknown"}`, e);
    }
  }
  if (due.length > 0) {
    console.log(
      `[webhooks/stripe] invoice.paid applied ${due.length} pending change(s) for ${prospect.name}`,
    );
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const prospect = await getProspectByStripeSubscriptionId(sub.id);
  if (!prospect) return;
  // Atomic: cancel status + GDPR dates + clear subscription ID in one PATCH.
  await markCancelledAndClearSubscription(prospect.pageId);
  console.log(
    `[webhooks/stripe] customer.subscription.deleted — ${prospect.name} cancelled, retention countdown started`,
  );
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;
  const prospect = await getProspectByStripeCustomerId(customerId);
  if (!prospect) return;

  const line = `[${new Date().toISOString()}] Stripe invoice payment_failed (invoice=${invoice.id}). Customer likely needs to update card.`;
  await appendProspectNote(prospect.pageId, prospect.notes, line);

  // Flip any pending-stripe entries to billing-failed and revert
  // their module selection (customer shouldn't see features they
  // haven't paid for). Same logic as the admin billing-failed flow.
  const pending = prospect.moduleChangeLog.filter(
    (e) => e.status === "pending-stripe",
  );
  for (const entry of pending) {
    try {
      const addedModules = new Set(
        entry.toModules.filter((m) => !entry.fromModules.includes(m)),
      );
      const reverted = entry.toModules.filter((m) => !addedModules.has(m));
      await resolveModuleChange(prospect.pageId, entry.id, {
        status: "billing-failed",
        resolutionNote: `Auto billing-failed via invoice.payment_failed (invoice=${invoice.id}).`,
        revertedSelection: reverted,
      });
    } catch (e) {
      reportError(`webhooks/stripe:billing-failed:${entry.id}`, e);
    }
  }

  // Email the customer — fail-soft (logged, doesn't error the webhook).
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  try {
    await sendCustomerEmail(
      getServerEnv(),
      prospect.email,
      "payment-method-update-needed",
      {
        customerName: firstName(prospect.name),
        failedActionDescription: "process your latest payment",
        removedModulesSummary:
          pending.length > 0
            ? pending
                .flatMap((e) =>
                  e.toModules.filter((m) => !e.fromModules.includes(m)),
                )
                .join(", ") || "(none)"
            : "(none)",
        accountUrl: `${baseUrl}/account/${prospect.token}`,
      },
    );
  } catch (e) {
    console.warn(
      `[webhooks/stripe] payment-method-update-needed email failed for ${prospect.email}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  console.warn(
    `[webhooks/stripe] payment_failed for ${prospect.name} — ${pending.length} entry(s) flipped to billing-failed, customer emailed`,
  );
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;

  // Extract customer ID from the expanded charge object (if Stripe
  // sent it expanded) to match against our prospect records.
  let customerId: string | undefined;
  if (typeof dispute.charge !== "string" && dispute.charge?.customer) {
    customerId =
      typeof dispute.charge.customer === "string"
        ? dispute.charge.customer
        : dispute.charge.customer.id;
  }

  let prospect: ProspectRecord | undefined;
  if (customerId) {
    prospect = await getProspectByStripeCustomerId(customerId) ?? undefined;
  }

  if (prospect) {
    const line = `[${new Date().toISOString()}] ⚠️ DISPUTE opened (dispute=${dispute.id}, charge=${chargeId ?? "unknown"}, reason=${dispute.reason}, amount=£${(dispute.amount / 100).toFixed(2)}). Respond in Stripe Dashboard within 7 days.`;
    await appendProspectNote(prospect.pageId, prospect.notes, line);
  }

  const err = await sendInternalNotification({
    subject: `⚠️ STRIPE DISPUTE — ${prospect?.name ?? "unknown customer"} (£${(dispute.amount / 100).toFixed(2)})`,
    body: [
      `Dispute ID: ${dispute.id}`,
      `Charge: ${chargeId ?? "unknown"}`,
      `Customer: ${prospect?.name ?? "unknown"} (${prospect?.email ?? customerId ?? "no ID"})`,
      `Amount: £${(dispute.amount / 100).toFixed(2)}`,
      `Reason: ${dispute.reason}`,
      `Status: ${dispute.status}`,
      "",
      "Action required: respond in the Stripe Dashboard within 7 days.",
      `https://dashboard.stripe.com/disputes/${dispute.id}`,
    ].join("\n"),
  });
  if (err) {
    console.error(`[webhooks/stripe] dispute notification email failed: ${err}`);
  }

  console.warn(
    `[webhooks/stripe] charge.dispute.created — ${dispute.id} for ${prospect?.name ?? "unknown"}, £${(dispute.amount / 100).toFixed(2)}`,
  );
}
