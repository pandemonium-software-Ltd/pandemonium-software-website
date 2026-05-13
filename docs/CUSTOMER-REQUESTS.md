# Customer-driven requests — audit table

Every action a prospect, customer, or visitor can take that costs
ModuForge anything (compute, LLM tokens, email, ops time). Use this
to spot expensive paths to optimise + to price modules accurately.

Last audited: 2026-05-13 (after the post-commit modules + enquiry-
form + dashboard refactor).

## Unit-cost reference

Numbers below assume current pricing as of 2026-05:

| Resource | Rate | Notes |
|---|---|---|
| Claude Haiku 4.5 — input | $0.80 / 1M tokens | Classifier + build-time polish |
| Claude Haiku 4.5 — output | $4.00 / 1M tokens | Same |
| Resend transactional | $0/mo for 100/day, $20/mo for 50k | ~$0.0004 per email at scale |
| Cloudflare Workers | $5/mo flat (Paid plan) | Already paid; marginal cost ≈ £0 per request |
| R2 storage | $0.015 / GB / mo | ~5 MB per customer ≈ $0.000075/mo each |
| R2 Class A ops (writes) | $4.50 / 1M | ~10 writes per customer setup ≈ $0.000045 |
| GitHub Actions (private repo) | $0.008 / Linux minute | Customer-site-build takes 2-4 min |
| Notion API | free | No rate-limit headroom concern today |
| Ben's time | priceless / £? | Listed in minutes per request type |

## The table

Grouped by phase. "Cost to Ben" only lists non-trivial line items
(any single per-request cost over ~$0.001 OR > 1 min of human time).

### 0. Public marketing site

| # | Request | Triggered by | Delivery | High-level process | Cost per request | Limit |
|---|---|---|---|---|---|---|
| 1 | Visit homepage / about / pricing / FAQ | Anyone | Static | Cloudflare Workers serves SSR'd page from cache | Negligible | None |
| 2 | Submit `/enquiry` form | Public visitor | Auto | POST `/api/enquiry` → zod validate → create Notion prospect → email Ben + send "thanks" template to visitor | ~$0.0008 (2 emails × Resend) + 1 Notion write | None (rate-limited by IP via Cloudflare) |

### 1. Pre-payment pipeline

| # | Request | Triggered by | Delivery | High-level process | Cost per request | Limit |
|---|---|---|---|---|---|---|
| 3 | Submit qualification form | Prospect (token-gated) | Auto | POST `/api/qualify` → zod validate → run **deterministic compatibility rules engine** (Playbook §6) → update Notion + email customer with "accepted" / "soft reject" / "flag for review" / "clarification needed". *No LLM call.* | ~$0.0004 (1 email) | None |
| 4 | Submit Phase 3 intake | Prospect (token-gated) | Auto | POST `/api/intake` → zod validate 8 sections → calculate fee (deterministic) → update Notion + send phase3-thanks + phase4-onboarding-hub-ready emails (auto-flips to Paid until Stripe Phase 2 lands) | ~$0.0008 (2 emails) | None — saved partials let them iterate |
| 5 | Resume partial intake | Prospect | Auto | GET `/intake/[token]` reads saved partial; customer continues | Negligible | None |

### 2. Hub onboarding (post-payment, pre-launch)

| # | Request | Triggered by | Delivery | High-level process | Cost per request | Limit |
|---|---|---|---|---|---|---|
| 6 | Save Hub step partial | Customer | Auto | POST `/api/onboarding` → validate slice → write Notion → return ok | Negligible | None (autosave on every change) |
| 7 | Mark Hub step done | Customer | Auto | Same as 6 + flip the per-step done flag in Notion | Negligible | None |
| 8 | Brand asset upload (logo / hero / about / service / background / gallery) | Customer | Auto | POST `/api/onboarding/upload` multipart → validate file type + size (≤5 MB) → put to R2 → merge asset into Step 4 slice in Notion | ~$0.000045 per upload (R2 Class A) | 60 uploads/customer total cap |
| 9 | Asset delete | Customer | Auto | DELETE `/api/onboarding/upload` → remove from R2 + Notion slice | Negligible | None |
| 10 | Module re-selector (add/remove pre-launch) | Customer | **Manual today** | Customer hits Confirm → Notion log entry → Ben actions Stripe op manually from `/admin/[token]` (charge/refund) → customer email auto-sent. *Phase 2 will automate this via webhook.* | 5-15 min ops time + Stripe fees (~£0.20 per charge) | 1 module change pre-launch |
| 11 | Request site preview | Customer | Auto | Step 5 Phase 1 Request button → stamps `Preview Build Triggered At` in Notion → next step5-review cron tick (within 5 min) dispatches `customer-site-build` workflow (mode=preview) → GitHub Actions runs `/api/internal/site-data` (which runs adapter + Haiku enrich) → build → upload version → callback stamps `previewUrl` in Notion + emails customer "preview ready" | ~$0.016–0.032 (GitHub Actions 2-4 min) + ~$0.002 (Haiku enrich on uncached fields; cached after) + 1 email | Implicit (rate-limited by latch) |
| 12 | Pre-commit review edit (Step 5) | Customer | Auto (mostly) | Customer writes free-text edit on Step 5 review → POST `/api/onboarding/review-edit` → multi-item-detector check → **Haiku classifier** for in-scope text changes → in-scope: apply patch to onboardingData + dispatch live build; out-of-scope / ambiguous: escalate to Ben | ~$0.0032 (Haiku CR classify) + ~$0.024 build + 1 email | 3 edits/launch pre-commit |
| 13 | Final sign-off (commit) | Customer | Auto | Step 5 Phase 3 sign-off button → flips status to "Onboarding Complete" + stamps `goLiveDate` → email "all signed off" sent | 1 email | 1× |

### 3. Launch day

| # | Request | Triggered by | Delivery | High-level process | Cost per request | Limit |
|---|---|---|---|---|---|---|
| 14 | Launch build (final) | Cron (`step7-go-live`) — checks `goLiveDate <= today` | Auto | step7 dispatches `customer-site-build` workflow mode=live finalLaunch=true → GitHub Actions builds → wrangler deploy → build-callback flips status `Build Started` → `Live`, sends "you're live 🎉" email | ~$0.024 (build) + 1 email | 1× per customer at launch |

### 4. Visitor actions on the customer's live site

| # | Request | Triggered by | Delivery | High-level process | Cost per request | Limit |
|---|---|---|---|---|---|---|
| 15 | Submit enquiry form | Visitor on customer site | Auto | EnquiryFormWidget POSTs to `/api/public/enquiry` on marketing site → validate + honeypot check → forward as transactional Resend email to customer's `recipientEmail` (replyTo = visitor) | ~$0.0004 (1 email) | None (per-IP rate-limit TBD) |
| 16 | Newsletter signup | Visitor on customer site | Auto | SubscribeWidget POSTs to `/api/public/subscribe` → create unconfirmed subscriber in Notion + send confirmation email with one-click link | ~$0.0004 (1 email) | Subscriber cap 1000 per customer |
| 17 | Confirm newsletter subscription | Visitor (one-click link) | Auto | GET `/confirm-subscription/[token]` → flip `confirmedAt` in Notion → send welcome email | ~$0.0004 (1 email) | N/A |
| 18 | Unsubscribe | Visitor (one-click link) | Auto | GET `/unsubscribe/[token]` → flip `unsubscribedAt` in Notion → send "you're unsubscribed" confirmation | ~$0.0004 (1 email) | N/A |

### 5. Post-launch customer actions

| # | Request | Triggered by | Delivery | High-level process | Cost per request | Limit |
|---|---|---|---|---|---|---|
| 19 | **Free-text change request** | Customer (dashboard "Need a change?" form) | **Auto + manual** | POST `/api/account/change-request` → multi-item detect → **Haiku classifier** (in-scope / ambiguous / out-of-scope) → in-scope auto-applies via `applyChangeRequestPatches()` + dispatches preview build for customer approval → out-of-scope / ambiguous escalates to Ben's inbox | ~$0.0032 (Haiku) + ~$0.024 (build, if auto-applied) + 1-2 emails. Manual review: **10-30 min ops time** when escalated | **2 / mo** included |
| 20 | **Offer update** | Customer (OfferCard composer) | Auto | POST `/api/account/change-request` `kind=offer-update` → structured form, **no Haiku** → pre-baked patch on `content.offers.current` → applyChangeRequestPatches → dispatch live build → auto-resolved CR | ~$0.024 (build) + 1 email | **2 / mo** independent budget |
| 21 | **Newsletter send** | Customer (NewsletterCard composer) | Auto | POST `/api/account/newsletter` → zod validate (subject, body, template, image, CTA) → check monthly cap → render per-recipient → batch via Resend (chunks of 100) → stamp history | $0.0004 × N subscribers + ~$0.0001 render. **Note: scales linearly with list size.** | **2 / mo** independent budget |
| 22 | Newsletter image upload | Customer | Auto | POST `/api/account/upload-newsletter-image` multipart → R2 put → return public URL | ~$0.000045 per upload | None (per send: 1 image cap) |
| 23 | Subscriber add (manual) | Customer | Auto | POST `/api/account/newsletter/subscribers` → idempotent add, cap-checked | Negligible | Cap 1000 |
| 24 | Subscriber remove | Customer | Auto | DELETE `/api/account/newsletter/subscribers` | Negligible | None |
| 25 | Subscriber CSV export | Customer | Auto | GET `/api/account/newsletter/subscribers?format=csv` | Negligible | None |
| 26 | Approve auto-applied change request | Customer (one-click link in CR preview-ready email) | Auto | GET `/account/[token]/approve-change/[crId]` → validate approval token → stamp `customerApprovedAt` → dispatch `customer-site-promote` workflow → on success, send `change-request-applied-live` email | ~$0.016 (promote build) + 1 email | N/A (per CR) |
| 27 | Reject auto-applied change request | Customer (one-click link) | Auto | GET `/account/[token]/reject-change/[crId]` → revert patches → flip CR status pending → notify Ben | 1 email | N/A |
| 28 | Retract own change request | Customer (dashboard, pending only) | Auto | DELETE `/api/account/change-request` → flip status retracted | Negligible | N/A |
| 29 | Password reset | Customer (Forgot password) | Auto | POST `/api/account/password-reset` → generate new password → hash + persist + send `password-reset` template email | 1 email | None |
| 30 | Post-launch module change | Customer | **Manual today** | Same as #10 — pre-Stripe-Phase-2, charges/refunds are operator-driven | 10-15 min ops time + Stripe fees | Per the §refund-review-gate notes in `STRIPE-PHASE-2.md` |

### 6. Operator-driven actions (NOT customer-driven, but listed for completeness)

| # | Request | Triggered by | Delivery | High-level process | Cost per request |
|---|---|---|---|---|---|
| – | Resolve free-text CR manually | Ben | Manual | `/admin/[token]` → write reply → "Resolve" → triggers `change-request-resolved` email | 5-20 min |
| – | Reject CR | Ben | Manual | Same UI → "Reject" → triggers `change-request-rejected` email | 5-20 min |
| – | Dictate patch | Ben | Manual | `/admin/[token]` → "Dictate a patch" panel → force-apply through Cowork's applier | 5-15 min |
| – | Stripe charge/refund (pre-Phase-2) | Ben | Manual | Stripe dashboard → action → mark applied on /admin → `module-change-confirmed` / `payment-method-update-needed` email auto-sent | 5 min + Stripe fees |

## Cost-to-Ben rollups

### Per customer to reach Live

Optimistic / typical / pessimistic per customer through the full
pipeline once:

| Item | Optimistic | Typical | Pessimistic |
|---|---|---|---|
| Resend emails (10-15 transactional) | $0.004 | $0.006 | $0.008 |
| Haiku enrich on first build (about-blurb only, intake-sourced) | $0.0016 | $0.0016 | $0.0016 |
| GitHub Actions (preview + final build) | $0.032 | $0.048 | $0.080 |
| R2 (5 MB assets) | $0.000075 | $0.0002 | $0.0005 |
| Cloudflare Workers | $0 | $0 | $0 |
| Stripe fees (setup £99 + first monthly £15) | $1.91 (Stripe 1.5% + 20p) | $2.27 | $2.27 |
| Ben's time (review-edits, manual CR escalations, ad-hoc fixes) | 20 min | 60 min | 4 hrs |
| **Sub-total (excl. Ben's time)** | **~$1.95** | **~$2.32** | **~$2.36** |
| Implied Ben's-time @ £30/hr | £10 | £30 | £120 |

So a customer paying £99 setup + £15/mo leaves £85ish after Stripe
+ infra in month 1, then £14.50ish per subsequent month. Ben's
time is the dominant cost — keep manual escalations cheap.

### Per month per Live customer

| Item | Cost |
|---|---|
| Per-month emails (newsletter sends × subscribers + change-request lifecycle) | $0.0004 × subs + $0.002 |
| Per-month GitHub Actions (~2 offer updates + 2 change requests × build) | $0.064 |
| Per-month Haiku (~2 free-text classifications) | $0.006 |
| Per-month R2 (storage of accumulated assets) | $0.0002 |
| Per-month Stripe fees on £15 subscription | £0.42 |
| Ben's time (handling 2 CRs / mo, average 15 min each) | 30 min ≈ £15 |
| **Sub-total (excl. Ben's time)** | **~$0.07 + £0.42** |

So infrastructure marginal cost per active customer is around 50p
a month — Ben's time is the only meaningful variable cost.

## Where the cost lives

If we ranked the costs from largest to smallest line item:

1. **Ben's time** — escalated change-requests (#19 manual path), pre-Stripe-Phase-2 module-change handling (#10, #30). Target: keep auto-apply rate high; ship Stripe Phase 2 to remove the manual ops on charges/refunds.
2. **Stripe fees** — fixed at Stripe's 1.5% + 20p UK rate. Already as low as it gets.
3. **GitHub Actions** — every customer-site-build burns 2-4 minutes. We trigger one per signoff, one per accepted change request, one per offer update, one per launch day. ~$0.064 / customer / month.
4. **Resend** — completely negligible at our scale, even with 1000-subscriber newsletter sends.
5. **Claude Haiku** — entirely negligible (~$0.006 / customer / month). Worth keeping but the verbatim-quote guard + dropping polishTagline already minimised cost AND risk.

## Optimisation candidates

- **Skip the customer-site-build on no-op CRs.** Some change-requests
  patch fields that don't actually affect the rendered site (e.g.
  internal notes). Skip dispatch in those cases — save GitHub
  minutes.
- **Cache Haiku enrich by content hash, not just per-customer.**
  If two customers write the same about-blurb the polish output's
  identical. Today we cache per-customer; a global content-hash
  cache would cut Haiku calls for repeated boilerplate.
- **Move newsletter sends to a queued worker.** Today the
  /api/account/newsletter route fires the whole batch synchronously
  in the request handler. For 1000-subscriber lists this is fine
  but if anyone grows beyond that, queue + worker is cleaner.
- **Stripe Phase 2.** Biggest unlock — removes operator time from
  module changes. See `STRIPE-PHASE-2.md` for the refund-review
  gate gating that release.

---

If you spot a customer-driven path that's not in this table, add a
row — the goal is exhaustive coverage so we can spot expensive paths
early. Same applies to operator-driven actions in §6 for context.
