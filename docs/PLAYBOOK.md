# ModuForge Operations Playbook

> The day-to-day operating manual. For "what should I build next?", see
> [`ROADMAP.md`](./ROADMAP.md) — that is the single source of truth for
> priorities. This file is the **how to operate what is already built**.

---

## What's next?

**Always check [`docs/ROADMAP.md`](./ROADMAP.md) first.** It carries the
ranked priority list (Critical / High-value / Optional) with complexity,
duration, monthly cost, and status for every outstanding item.

The current top priority is the **pricing-live cutover** (item #0 on the
roadmap). The file-by-file implementation queue is in the section below.

---

## Implementation queue — pricing-live cutover

**Source of truth:** the "🧭 Strategic decisions locked 2026-05-25"
section in `ROADMAP.md`. Every price below comes from there. If the
ROADMAP and this section disagree, ROADMAP wins.

### Phase A — Constants (do first, sets up everything else)

Files: `src/lib/fees.ts`, `src/lib/schemas.ts`, `src/lib/billing/module-policy.ts`

- Update all `MODULE_*_GBP` constants to new numbers:
  - Booking: 19 / 6
  - Enquiry: 19 / 6
  - Newsletter: 49 / 9
  - Offers: 19 / 6
  - GBP add-on: 59 / 3
- Add `MODULE_MULTILOCATION_SETUP_GBP = 15` (no monthly constant — multi-location is one-off only)
- Add `"Multi-location"` to `MODULE_OPTIONS` enum in `schemas.ts` AND the duplicate in `module-policy.ts`
- Extend `ModuleSelection` type with `extraLocations: number` (multi-location is a counter, not a boolean)
- Update `calculateFees`: add `selection.extraLocations * MODULE_MULTILOCATION_SETUP_GBP` to setup, no monthly contribution
- Founding/Standard base constants: confirm `BASE_SETUP_GBP = 299` and `BASE_MONTHLY_GBP = 29` (live currently has 129/19 — UPDATE)
- Founding constants: confirm `FOUNDING_MEMBER_SETUP_GBP = 99` and `FOUNDING_MEMBER_MONTHLY_GBP = 15` (already correct)

### Phase B — Pricing page, intake, home

Files: `src/app/pricing/page.tsx`, `src/components/IntakeForm.tsx`, `src/components/PricingCalculator.tsx`, `src/app/page.tsx`, `src/components/OptionalExtras.tsx`

- `/pricing`: rewrite tier section — Founding + Standard only (drop any Premium copy). Update module list rows. Update worked example. FAQ already aligned (today's commit `632064e`).
- `IntakeForm`: refresh module rows; **add Multi-location** with a `<input type="number">` for "How many extra locations?" (defaults to 0, min 0)
- `PricingCalculator`: handle multi-location counter in the live total — it's `extraLocations × £15` setup contribution
- Home: remove `<TestimonialBlock>` placeholder. Whatever section that was, drop it. Surrounding spacing may need a small adjustment.

### Phase C — Dashboard

Files: `src/components/account/ModulesEditor.tsx`, `src/components/account/BillingPanel.tsx`, `src/components/onboarding/Step3Modules.tsx`

- `ModulesEditor.ALL_MODULES`: stop hardcoding prices — read from `fees.ts` exported constants
- **Add Multi-location row** with counter UI: shows current `extraLocations`, "+" / "-" buttons, calls a new endpoint to update. Reuses the modal for confirmation showing "+£15 setup".
- Verify `BeforeAfterPanel` still computes the new monthly correctly with new numbers (it should — it reads delta from server, not constants)
- `BillingPanel` cancel modal: spot-check that the new £29 vs £15 numbers render sensibly
- `Step3Modules`: pricing references in the module cards — update to read from constants

### Phase D — Tests + golden fixtures

- `src/lib/billing/__tests__/module-policy.test.ts`: fee-delta assertions — update for new numbers. Add multi-location counter tests (`{extraLocations: 0}` → 0; `{extraLocations: 3}` → 45 setup, 0 monthly).
- `src/lib/templates/golden/*.json`: any fixture quoting old prices needs updating. Likely candidates: `module-scheduled-add.json`, `module-scheduled-remove.json`, `module-add-applied-*.json`, `phase3-thanks-fees-and-payment-coming-*.json`.

### Phase E — Docs

- ROADMAP: move "pricing-live cutover" (#0) to ✅ Shipped section
- PLAYBOOK: delete this whole "Implementation queue" section once shipped (it'll be obsolete)

### Phase F — Deploy

```bash
npm run deploy         # ships A-E + today's compliance work
npm run deploy:ops     # ships GDPR scrub cron from today
```

### Watch-items after deploy

- **Multi-location at £15 setup** is acknowledged under-priced vs operator effort (2-4h per location). Add a `console.warn` in the admin grant-module flow if a customer's extraLocations exceeds 3 so you notice early.
- **Standard at £299/£29** is ~70% above the previous live price. Watch conversion rate on /enquiry over the first 10 enquiries post-deploy. If it craters, you have data to negotiate the price down — DON'T just react to early friction without seeing the rate.

---

---

## Quick reference

| You want to… | Run this |
|---|---|
| Deploy the marketing site | `npm run deploy` |
| Deploy the ops worker (cron) | `npm run deploy:ops` |
| Tail live ops worker logs | `npx wrangler tail --config wrangler-ops.jsonc` |
| Tail marketing-site logs | `npx wrangler tail` |
| Run all tests | `npm test -- --run` |
| Typecheck both repos | `npx tsc --noEmit && (cd customer-site-template && npx tsc --noEmit)` |
| Apply a new D1 migration | `npx wrangler d1 execute pandemonium-analytics --remote --file=migrations/<N>_<name>.sql` |
| Add a Notion column | See "Adding a Notion column" below |
| Set a worker secret | `npx wrangler secret put <NAME> --config wrangler-ops.jsonc` |
| Preview any email template | `https://modu-forge.co.uk/api/admin/preview-template` |
| Preview the monthly digest | `https://modu-forge.co.uk/api/admin/preview-digest` |

---

## Cron schedule (ops worker)

Five schedules live in `wrangler-ops.jsonc`. All UTC.

| Cron | When | Purpose |
|---|---|---|
| `* * * * *` | Every minute | Onboarding dispatcher — runs each Step against each prospect with work to do |
| `0 2 * * *` | Daily 02:00 | Cloudflare analytics snapshot for every Live customer + @self |
| `30 2 * * *` | Daily 02:30 | GBP reviews refresh for every customer with a resolved place_id |
| `0 3 * * *` | Daily 03:00 | GDPR scrub — deletes personal data for Cancelled prospects past their 30-day retention |
| `0 8 1 * *` | 1st of month 08:00 | Monthly analytics digest email to every Live customer |

---

## Deploy sequence

A normal "ship today's work" cycle:

```bash
npm test -- --run                              # 1. Tests pass?
npx tsc --noEmit                               # 2. Marketing-site TS clean?
(cd customer-site-template && npx tsc --noEmit) # 3. Customer-site TS clean?
git push                                       # 4. Push to GitHub
npm run deploy                                 # 5. Marketing site → Cloudflare
npm run deploy:ops                             # 6. Ops worker → Cloudflare (only if /src/ops-worker/ changed)
```

Customer sites build via GitHub Actions — no manual deploy.

---

## Adding a Notion column

Notion API DOES support adding columns programmatically — use it
rather than the dashboard for repeatable / scriptable schema changes.

```bash
KEY=$(grep "^NOTION_API_KEY=" .dev.vars | cut -d= -f2- | tr -d '"' | tr -d "'")
DB=$(grep "^NOTION_PROSPECTS_DB_ID=" .dev.vars | cut -d= -f2- | tr -d '"' | tr -d "'")
curl -s -X PATCH "https://api.notion.com/v1/databases/$DB" \
  -H "Authorization: Bearer $KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"properties":{"My New Field":{"date":{}}}}'
```

Property type shapes:
- `{"date":{}}`
- `{"rich_text":{}}`
- `{"number":{}}`
- `{"checkbox":{}}`
- `{"select":{"options":[{"name":"Foo"},{"name":"Bar"}]}}`
- `{"multi_select":{"options":[{"name":"Foo"}]}}`
- `{"url":{}}` / `{"email":{}}` / `{"phone_number":{}}`

After adding a column, update `pageToProspect` in
`src/lib/notion-prospects.ts` to read it into the `ProspectRecord`.

---

## Common operator actions

### Apply a customer's pending module change immediately

If a customer paid via their dashboard for a new module and you want
it live NOW (rather than waiting for the 1st of next month):

1. Go to `https://modu-forge.co.uk/admin/<token>`
2. Scroll to **Module changes**
3. Find the row with `Pending Stripe` + `Dashboard` badges
4. Click **Applied**, paste a customer-safe `paymentLine` like
   `Activated immediately for testing — no real charge yet.`

That writes the new module + new fees to Notion AND, if the entry
was a cancellation kind, also stamps `Cancelled At` and starts the
30-day GDPR retention countdown.

### Add a module to a customer out-of-band

Use `/api/admin/grant-module` — bypasses the customer self-service
flow, useful for missed-at-intake corrections:

```bash
PW=$(grep "^ADMIN_PASSWORD=" .dev.vars | cut -d= -f2- | tr -d '"' | tr -d "'")
curl -s -u "ben:$PW" -X POST https://modu-forge.co.uk/api/admin/grant-module \
  -H 'Content-Type: application/json' \
  -d '{
    "token":"<customer-token>",
    "module":"Google Business Profile Setup/Audit",
    "action":"add"
  }'
```

Returns the new module list + recomputed fees. Idempotent — re-running
with the same args is a no-op.

### Unlock a Hub step for re-editing

Customer needs to change something they already marked done:

```bash
curl -s -u "ben:$PW" -X POST https://modu-forge.co.uk/api/admin/unlock-step \
  -H 'Content-Type: application/json' \
  -d '{"token":"<customer-token>","stepId":"tools"}'
```

`stepId` is one of: `cloudflare`, `domain`, `tools`, `content`,
`assets`, `review`.

### Preview an email template

Open in browser (basic auth):
- `https://modu-forge.co.uk/api/admin/preview-template` — index of all templates
- `https://modu-forge.co.uk/api/admin/preview-template?id=<template-id>` — render one
- `https://modu-forge.co.uk/api/admin/preview-template?id=<id>&values=<url-encoded-json>` — render with custom slot values

Send a real test of the monthly digest:
- `https://modu-forge.co.uk/api/admin/preview-digest?token=<token>&send=true&to=<your-email>`

---

## When something breaks

### Customer email failed to send

- Check `wrangler tail --config wrangler-ops.jsonc` — confirmation
  email failures log "[api/account/...] confirmation email failed"
  but don't fail the request (Notion is the source of truth).
- Resend dashboard: `https://resend.com/emails` — look for the
  message ID, check Status. Common: domain not yet verified, signing
  secret wrong, recipient address malformed.

### GBP reviews not appearing on a customer's site

1. Open `/admin/<token>` and look at the **Google reviews** card.
2. State colour codes:
   - **Green border** → healthy, last fetched recently
   - **Amber** → stale (last fetch > 48h ago)
   - **Ember** → last refresh failed; `Last error` shown
   - **Navy** → place_id not yet resolved (waiting for step3-tools)
3. If place_id resolved but reviews don't appear in the customer's
   site widget: it's a snapshot age problem (widget hides itself
   when fetched_at > 14 days). Trigger a manual cron run.

### Customer dashboard pending change shows but never applies

Pending changes need YOU to action them in /admin (until Stripe is
wired in #1). Workflow:

1. /admin/<token> → Module changes section
2. Read the inline **Stripe action** line on each pending entry
3. Do the Stripe op in Stripe Dashboard (or wait for #1 to ship and
   it becomes automatic)
4. Click **Applied** on the entry → flips Module Selections + fees
   in Notion

---

## Working with secrets

Local development (`.dev.vars`) is in `.gitignore` — never commit.
Production secrets are set per-worker via `wrangler secret put`.

| Secret | On which worker? | What it does |
|---|---|---|
| `NOTION_API_KEY` | Both | Notion API access |
| `RESEND_API_KEY` | Both | Email sending |
| `RESEND_WEBHOOK_SECRET` | Marketing | Svix signature verification on inbound Resend webhooks |
| `ADMIN_PASSWORD` | Marketing | Basic-auth on `/admin/*` and `/api/admin/*` |
| `SESSION_SECRET` | Marketing | Signs customer session cookies |
| `BEN_CLOUDFLARE_API_TOKEN` | Ops | Manage customer Cloudflare zones |
| `GOOGLE_PLACES_API_KEY` | Ops + Marketing | GBP reviews resolution + refresh |
| `INTERNAL_BUILD_SECRET` | Marketing + Ops + GitHub | Shared secret for customer-site-build pipeline |
| `GITHUB_TOKEN` | Ops | Dispatch customer-site-build workflow |
| `ANTHROPIC_API_KEY` | Marketing | Haiku copy polish at site-build time |
| `STRIPE_SECRET_KEY` | TBD (task #1) | Real Stripe ops |
| `STRIPE_WEBHOOK_SECRET` | TBD (task #1) | Stripe webhook signature verification |

---

## Compliance / legal touchstones

- **Terms:** `/terms` is the authoritative cancellation + refund policy.
  Source: `src/app/terms/page.tsx`. Cross-references the
  Companies-House details in `src/lib/site.ts/legal`.
- **GDPR retention:** 30 days personal / 7 years financial (HMRC).
  Enforced by the `gdpr-scrub-tick` cron. See
  `src/lib/gdpr-retention.ts` for the policy constants.
- **Express-request mechanism:** customer must tick a consent box at
  payment to start work immediately within their 14-day cooling-off
  window. Checkbox lands with Stripe in task #1; informational notice
  is already on the payment page.
- **Companies House disclosures:** company number + registered office
  appear in the footer of every page + the trader-identity block at
  the top of /terms. Source of truth: `src/lib/site.ts/legal`.
