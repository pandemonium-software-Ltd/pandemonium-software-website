# Stripe Phase 2 — Auto-charge / refund / subscription proration

## Status

**Phase 1A (legacy, no longer in production)**: customer-initiated
module change → Notion log entry as `pending-stripe` → manual
operator action via `/admin/[token]` → operator does the Stripe op
(charge, refund, sub-update) by hand → operator clicks "Apply" /
"Billing failed" / "Reject" → customer email auto-sent.

**Phase 1B (current — 2026-05-14 onward, Stripe-placeholder mode)**:
customer-initiated module change → Notion log entry as `applied`
DIRECTLY in the same atomic write that flips Module Selections +
Setup Fee + Monthly Fee. No operator step. A `[STRIPE-TODO]` line
gets written to `wrangler tail` for each money movement (charge /
refund / subscription update) so the operator can manually
reconcile until Stripe is wired. Customer gets the
`module-change-applied` email confirming immediate apply. **No
actual Stripe ops happen — the operator is on the hook to charge /
refund manually for now.**

**Phase 2 (this doc — TODO)**: same customer flow as Phase 1B but
real Stripe ops fire automatically when the customer hits Confirm.
Operator only gets involved when something fails or the policy
needs human review.

The Phase 1B architecture is intentionally compatible with Phase 2 —
all the Phase 2 pieces drop into existing seams. This doc is the
contract.

### Switching from Phase 1B → Phase 2 (when Stripe is wired)

In `src/app/api/onboarding/module-change/route.ts`:

1. Change `entry.status = "applied"` → `"pending-stripe"`.
2. Drop `resolutionNote: "Auto-applied (Stripe Phase 1 placeholder mode)"`
   and `resolvedAt: submittedAt` from the entry (they get set later
   by `resolveModuleChange`).
3. Replace the `[STRIPE-TODO]` console.warn block with the actual
   Stripe SDK calls (charge / refund / sub-update). Use
   `idempotencyKey: mc-${entry.id}-{setup,refund,sub}` exactly as
   the placeholders are formatted today — keeps the audit trail
   continuous.
4. Drop the `applyImmediately` argument from `submitModuleChange`
   so Module Selections + fees no longer flip in the same write
   (the Stripe webhook handler will call `resolveModuleChange` to
   flip them once the charge/refund completes).
5. Switch `sendCustomerEmail(env, prospect.email, "module-change-applied", ...)`
   back to `"module-change-pending"` so the customer is told their
   change is in flight (correct UX once there's a real wait).
6. In `src/app/onboarding/[token]/page.tsx`, the
   `pendingModuleChange` filter on `status === "pending-stripe"`
   already handles the in-flight UI — no change needed.

In `src/lib/notion-prospects.ts`:

7. The `applyImmediately` parameter on `submitModuleChange` can stay
   in place for any future "skip operator step for $reason" flow,
   or be removed entirely for cleanliness. Either is fine.

---

## Why this isn't built yet

Stripe is currently a placeholder (`src/lib/stripe.ts`):
`getStripe()` returns `null`, `isStripeConfigured()` returns false,
no checkout sessions, no webhooks. `/api/intake` auto-flips status
to "Paid" without taking any actual money. No customer is being
charged anything in production right now.

Building Phase 2 means first building **Stage 2A Part 2** — the
real initial-payment Stripe integration (Checkout + webhook +
subscription). Then auto module-changes drop on top.

Estimated effort: 2-3 focused days for Stage 2A Part 2, then 1 day
for the auto module-change layer.

---

## What lives where today (Phase 1)

| Layer | File | Notes |
|---|---|---|
| Policy (pure functions) | `src/lib/billing/module-policy.ts` | `canChangeModules`, `calculateModuleDelta`, refund-window helpers. **No I/O — already Phase-2-ready.** |
| Notion data model | `src/lib/notion-prospects.ts` | `ModuleChangeLogEntry` type + `submitModuleChange` + `resolveModuleChange`. Status-machine: `pending-stripe → applied | rejected | billing-failed`. |
| Customer endpoint | `src/app/api/onboarding/module-change/route.ts` | POST: validates eligibility, calculates delta, writes log entry as `pending-stripe`, emails Ben + customer. |
| Operator endpoint | `src/app/api/admin/module-change/route.ts` | PATCH: operator picks `applied` / `billing-failed` / `rejected` + provides customer-facing payment line. Writes resolution + sends customer email. |
| Customer UI | `src/components/onboarding/Step3Modules.tsx` (`ModuleReSelector`) | 3-state UI: button → picker → in-flight. Live delta calculator client-side. |
| Operator UI | `src/components/admin/ModuleChangeEditor.tsx` | One per pending entry. Shows diff + money + 3 action buttons. |
| Email templates | `src/lib/templates/templates/module-change-{pending,confirmed}.ts` + `payment-method-update-needed.ts` | Branded HTML + plain text. |
| T&Cs | `src/app/terms/page.tsx` §4-§6 | Refund policy + module-change rules customer-facing. |

---

## What changes for Phase 2

### Step A — Wire real Stripe (Stage 2A Part 2 prerequisite)

Files to add:

- `src/lib/stripe.ts`: implement `createCheckoutSession()`,
  `verifyWebhookSignature()`, `findOrCreateCustomer()`,
  `createOrUpdateSubscription()`. Stub functions are already
  scaffolded with `// TODO(Part 2):` comments.
- `src/app/api/stripe/checkout-session/route.ts`: POST that creates
  a Stripe Checkout session and returns the URL. Called by the
  payment page.
- `src/app/api/stripe/webhook/route.ts`: POST that verifies
  signatures + dispatches on event type:
  - `checkout.session.completed` → write `Stripe Customer ID` +
    `Setup Payment Intent ID` + `Subscription ID` to Notion;
    flip status to `Paid`; send phase4 email.
  - `payment_intent.succeeded` → if metadata has
    `module_change_id`, call `resolveModuleChange(...,
    { status: "applied" })` (replaces operator click).
  - `payment_intent.payment_failed` →
    `resolveModuleChange(..., { status: "billing-failed" })`.
  - `customer.subscription.updated` → log to audit (no-op on Notion,
    just a paper trail).
  - `charge.refunded` → if metadata has `module_change_id`, mark
    applied + send customer email.

Notion fields to add (writers + parser):

- `Stripe Customer ID` (rich_text)
- `Setup Payment Intent ID` (rich_text)
- `Subscription ID` (rich_text)
- `Setup Paid At` (date) — drives `canRefundSetup()`
- `Latest Monthly Charge At` (date) — drives `canRefundLatestSubscription()`

Update `/payment/[token]/page.tsx`: replace the placeholder with
a button that calls the new checkout-session endpoint and
redirects to the returned URL.

Remove the auto-flip-to-Paid hack from `/api/intake/route.ts`
(noted in its head comment) — Stripe webhook owns it now.

### Step B — Auto-charge / refund the module change

Add to `/api/onboarding/module-change/route.ts`, after Notion
write succeeds:

```ts
const stripe = getStripe();
if (stripe && prospect.stripeCustomerId) {
  // Setup-fee delta (one-off)
  if (delta.setupDelta > 0) {
    await stripe.invoiceItems.create({
      customer: prospect.stripeCustomerId,
      amount: delta.setupDelta * 100,
      currency: "gbp",
      description: `Module change: ${delta.added.join(", ")}`,
      metadata: { module_change_id: entry.id },
    });
    await stripe.invoices.create({
      customer: prospect.stripeCustomerId,
      auto_advance: true,
      metadata: { module_change_id: entry.id },
    }, { idempotencyKey: `mc-charge-${entry.id}` });
  } else if (delta.setupDelta < 0) {
    await stripe.refunds.create({
      payment_intent: prospect.setupPaymentIntentId,
      amount: Math.abs(delta.setupDelta) * 100,
      metadata: { module_change_id: entry.id },
    }, { idempotencyKey: `mc-refund-${entry.id}` });
  }

  // Monthly subscription delta (proration)
  if (delta.monthlyDelta !== 0 && prospect.subscriptionId) {
    await stripe.subscriptions.update(prospect.subscriptionId, {
      items: [{ price_data: {
        unit_amount: delta.toFees.monthly * 100,
        currency: "gbp",
        recurring: { interval: "month" },
        product: process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID,
      }}],
      proration_behavior: "create_prorations",
      metadata: { module_change_id: entry.id },
    }, { idempotencyKey: `mc-sub-${entry.id}` });
  }
}
```

The webhook handler reconciles: when Stripe acknowledges the
charge or refund, the webhook calls `resolveModuleChange(...,
{ status: "applied" })` — which is the exact same code path the
operator's "Apply" button takes today. **Zero changes to admin
UI; the resolveModuleChange() function is already idempotent.**

### Step C — Idempotency keys (the big rule)

Every Stripe write MUST use an idempotency key derived from
`entry.id`:

- Setup charge: `mc-charge-${entry.id}`
- Setup refund: `mc-refund-${entry.id}`
- Subscription update: `mc-sub-${entry.id}`

This is the contract that lets reconciliation work safely. If we
retry any Stripe call (network blip, server crash mid-flow), the
key tells Stripe "we've seen this before" and returns the previous
result instead of double-charging.

Stripe stores idempotency keys for 24 hours. After that the key
is forgotten and a retry would be treated as a new request — this
is fine because the Notion log entry's `status="applied"` gates
re-processing.

### Step D — Reconciliation cron

Add to the ops worker (`src/ops-worker/`):

- New step: `step-reconcile-module-changes.ts`
- Cron tick (every 5 min):
  1. Query Notion for prospects with `pending-stripe` entries
     older than 10 minutes (gives webhook reasonable time).
  2. For each, look up Stripe by `metadata.module_change_id`
     to find the corresponding charge / refund / sub update.
  3. If found and successful → call `resolveModuleChange()`
     with `applied`. (Re-triggers customer email.)
  4. If found and failed → call `resolveModuleChange()` with
     `billing-failed`. (Re-triggers customer email.)
  5. If not found AND elapsed > 30 min → log Cowork exception,
     escalate to Ben (`step2 fail` style). Likely a webhook
     delivery problem.

This is the third layer of defence after idempotency keys +
webhook redundancy. In normal operation it should never need to
do anything — the webhook gets there first.

### Step E — Customer Portal link for "update payment method"

When billing-failed: instead of asking customer to reply to email,
the customer email's CTA links to a Stripe-hosted Customer Portal
page (`stripe.billingPortal.sessions.create({ customer, return_url })`).
Customer updates card themselves; webhook fires → cron picks it up
on next tick → re-runs the failed module change → emails customer
the confirmed version.

Update `payment-method-update-needed` template's CTA URL key from
`accountUrl` → `customerPortalUrl`. Build the portal URL in the
admin endpoint when `billing-failed` is set.

---

## Failure modes + redundancy

| Failure | Phase 1 outcome | Phase 2 outcome |
|---|---|---|
| Stripe charge succeeds, our endpoint crashes before Notion write | n/a (no auto-Stripe) | Webhook fires → `resolveModuleChange()` writes Notion. Idempotency: webhook is the source of truth. |
| Webhook delivery fails (network blip) | n/a | Stripe retries for 3 days. If still failing: cron picks it up (Step D) and reconciles. |
| Customer double-clicks Confirm | Notion write protected by `moduleChangeRoundUsedAt` lock — second attempt rejected with "round-already-used". | Same lock holds; Stripe op never fires twice because second submit is rejected before reaching it. |
| Stripe charge fails (card declined) | n/a (no auto-Stripe) | Webhook handler dispatches to `resolveModuleChange(..., billing-failed)`. Customer emailed payment-method-update template. Modules they were adding are NOT credited. |
| Refund fails (e.g. > 180 days from original charge) | Operator sees error in admin, takes manual action | Stripe error caught in the auto path; falls back to `pending-stripe` so operator sees it in admin. |
| Reconciliation cron + webhook BOTH succeed | n/a | Idempotent — `resolveModuleChange()` rejects double-resolution with `409`. |

---

## Testing checklist for Phase 2 ship

- Stripe test-mode end-to-end: customer changes modules → charge
  fires → webhook lands → Notion synced → customer emailed.
- Refund path: customer downgrades → refund fires → webhook lands.
- Subscription proration: monthly fee delta applied with proration.
- Failure injection: deliberately fail webhook delivery (block
  endpoint), confirm cron picks it up.
- Idempotency: replay same webhook event twice, confirm only one
  Notion write.
- Card decline: use Stripe test card `4000 0000 0000 0002`,
  confirm `payment-method-update-needed` template lands.
- 180-day refund cliff: change `paidAt` to >180 days ago in test,
  confirm refund attempt fails gracefully with `pending-stripe`
  staying for operator action.

---

## Out of scope for Phase 2

- **VAT registration**: when Ben registers for VAT, refunds need
  proportional VAT credit. Stripe Tax handles this automatically
  if enabled. Add a `STRIPE_TAX_ENABLED` env flag and conditional
  in the charge / refund calls. (Not blocking; deal with it when
  VAT registration completes.)
- **Multi-currency**: assumed GBP throughout. Adding USD/EUR
  customers means a separate price object per currency.
- **Volume discounts on additional setup fees**: e.g. add 2
  modules at once for a discount. Currently each module change is
  a single-shot, so this doesn't apply.
- **Annual billing toggle**: subscription is monthly-only.

---

## ⚠️ Pre-launch refund-review gate (not for now — flag for later)

Before Stripe Phase 2 goes live to real customers, we want a
deliberate "pause and think" moment around refunds + churn. The
failure mode we're guarding against: customer adds a module
(Stripe charges) → realises they don't want it → request a refund
→ we refund → repeat. Net-negative work: we built/wired the
module, the customer briefly used it (or didn't), and we end up
with no revenue plus burned setup time.

Specifically, the following decisions must be recorded BEFORE
shipping Phase 2 to live customers:

1. **Trial / probation window** — should new modules have a
   72-hour or 7-day "soft launch" period before the charge fires?
   Customer sees the module configured in their hub but the
   Stripe charge only commits once the window elapses without a
   cancel request. Stops "I clicked Add → realised I didn't want
   it → got charged anyway" friction.
2. **Refund eligibility rules** — current Phase 2 doc allows
   refund up to 180 days post-charge. That's generous and could
   be abused. Tighter alternatives:
   - 14-day no-questions-asked window
   - After 14 days, partial refund only (50% pro-rated against
     time elapsed)
   - After 60 days, no refund — counts as a module-removal
     downgrade for future billing only
3. **"Already-used-it can't be refund-removed" guard** — block
   the module re-selector from initiating a refund on a module
   the customer has actually used. "Used" definitions to lock
   in:
   - Newsletter: any subscriber added OR any send fired
   - Offers: any offer published (current OR history non-empty)
   - Online Booking: any Cal.com booking received via the link
   - Enquiry Form: any enquiry submitted
   - GBP: any review fetched / displayed
   The hub UI tells the customer "this module's been used — you
   can downgrade for the next billing cycle, but no refund."
4. **Anti-churn email sequence** — before processing a refund:
   - Auto-reply asking what went wrong (single-question survey)
   - Offer a 50% discount for 3 months as a save attempt
   - Operator review (one of us) before the Stripe refund fires
   Stops the "instant refund button" being one click away when
   the customer might've been fixable.
5. **Cooling-off period audit** — UK consumer law gives a 14-day
   cooling-off period on online subscriptions in most cases.
   Confirm our Terms align. Sole traders / personal-name limited
   companies count as consumers under UK CRA 2015 for these
   purposes, so even though ModuForge is B2B-ish, the rule still
   applies to most of our customer base.

ACTION: do not ship Stripe Phase 2 to live customers until each
of these 5 points has an explicit decision recorded (in this doc
or in the playbook). The default scaffolding from Phase 2 above
gives full refund power on day one — exactly the failure mode we
want to gate against.
