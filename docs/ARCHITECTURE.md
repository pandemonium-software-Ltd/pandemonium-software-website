# Pandamonium Software Ltd — Architecture & Operations PRD

> **Living document.** Captures the architectural decisions for ModuForge
> (the Pandamonium Software Ltd product). Updated as Stage 2 phases ship.

## 1. Product positioning

ModuForge is a flat-fee, modular website service for UK trades and small
businesses. The customer-facing brand is **ModuForge**; the legal entity
is **Pandamonium Software Ltd**.

The single most important design constraint behind everything in this
doc:

> **Ben never logs into a customer's SaaS dashboard. The AI
> operations layer ("Cowork Ops") does all configuration via APIs
> against accounts the customer owns and has invited Ben/Cowork into
> as a team member.**

If a feature can't be automated end-to-end without Ben touching a
dashboard, it doesn't ship in Stage 2. Stage 3 may revisit edge cases.

## 2. System map (Stage 2 target)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   Customer                                                          │
│      │                                                              │
│      │  fills in Hub steps                                          │
│      ▼                                                              │
│   /onboarding/[token]  ◄──── (Cloudflare Worker, Next.js 15 SSR)    │
│      │                                                              │
│      │  POST /api/onboarding (per-step partial save + mark-done)    │
│      ▼                                                              │
│   Notion Prospects DB  ◄──── source of truth                        │
│      │                                                              │
│      │  poll every 60s                                              │
│      ▼                                                              │
│   Cowork Ops Worker  ◄──── separate Cron-triggered Worker           │
│      │                                                              │
│      ├─► Cloudflare API   (customer account, my user-token)         │
│      ├─► Resend API       (customer Teams membership)               │
│      ├─► Cal.com (URL capture only)                                 │
│      ├─► GBP API / browser (Stage 3 / fallback)                     │
│      ├─► Resend transactional emails  (notify customer)             │
│      └─► Notion Exceptions DB         (escalate to Ben)             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. Operations automation: per-service feasibility

| Service | Automation path | Status |
|---|---|---|
| Cloudflare (DNS, Pages, Workers) | API-driven via my user token after the customer adds my email as a team member (Administrator) | ✅ Confirmed |
| Resend (sender DNS, transactional, newsletter) | API-driven via Teams membership; customer-owned account (free tier covers expected volume); sending-only API key stored encrypted in Notion | ✅ Confirmed |
| Cal.com (booking page) | Customer signs up themselves; pastes booking URL into Hub; ModuForge embeds the URL. **No SaaS administration on Ben's side.** Programmatic Managed Users API is gated behind a $99/mo Platform plan — not justified yet | ✅ via URL capture |
| Google Business Profile | URL capture in Hub for embedding "find us on Google" link. Full API integration (claim/update profile programmatically) requires a verified Google Cloud OAuth app — multi-day approval process from Google. Stage 2 uses URL capture only; Stage 3 may add full API or browser-fallback via `claude-in-chrome` | ⚠️ Stage 3 |
| Domain registration | Cloudflare Registrar via API once their card is on file | ✅ Confirmed |
| Site build & deploy | OpenNext + Wrangler, parametrized per customer (forthcoming Stage 2C work) | ✅ Confirmed |

## 4. Cowork Ops Worker — design

### 4.1 Why a separate Worker

The customer-facing site (Next.js + OpenNext) handles requests in
milliseconds and returns. The ops worker has different needs: long-
running tasks (DNS verification can take minutes), retries, rate-limit
backoff, and non-customer-facing failure modes. Mixing them risks user-
facing latency from API ratelimits or worker timeouts.

### 4.2 Trigger model

Cloudflare **Cron Triggers**, every 60 seconds. Each tick:

1. Query Notion Prospects DB for records with `Status` ∈ {Onboarding
   Started, Onboarding Complete} where any Step Done flag has changed
   since `Cowork Last Run At` (new schema field).
2. For each matched prospect, build the per-step task list (e.g. step
   2 complete → Cloudflare DNS + Resend domain).
3. Run tasks. Each task is idempotent: it checks current state on the
   target service and no-ops if already done.
4. Update Notion with audit trail entries.
5. On failure: write to Exceptions DB, email Ben.

We can graduate to **Cloudflare Workflows** (durable orchestration)
later if 60-second polling becomes insufficient. For Stage 2C scope,
Cron is enough.

### 4.3 Per-step automations

#### Step 1 (Cloudflare)
- Poll my Cloudflare account memberships for invitations from
  `prospect.onboardingData.cloudflare.cloudflareEmail`
- Accept invitation
- Verify access by listing accounts
- Mark `Cloudflare Membership Verified At` in Notion
- Notify customer: "I'm in your Cloudflare account, ready to deploy"

#### Step 2 (Domain + optional Resend)
- Read prospect's stored `domain`
- On their Cloudflare account: create zone if missing → check if
  domain is registered → if registered elsewhere, instruct customer
  to point nameservers (skip DNS until pointed); if registered via
  Cloudflare, proceed
- Create DNS records for ModuForge Pages (CNAME / A records)
- If Newsletter or Enquiry: poll Resend Teams API for invitations
  matching `resendSignupEmail` → accept → POST /domains → fetch
  DKIM/SPF/Return-Path records → apply to their Cloudflare DNS via
  Cloudflare API → poll Resend `domain.status` until `verified` (max
  ~10 min)
- Generate sending-only Resend API key, store encrypted in Notion
- Notify customer when verified

#### Step 3 (Tools — H3 scope)
- Booking module: capture `calcomBookingUrl` (validated as a Cal.com
  URL); store; the build step embeds it into the customer's site
- GBP addon: capture `gbpUrl`; store; build step embeds the link.
  Audit/update of the GBP listing itself is done by Ben in batch (or
  via browser fallback later)

#### Step 4 (Brand assets — H4 scope, needs R2)
- Customer uploads logo + photos directly to a Cloudflare R2 bucket
  (presigned URLs from `/api/onboarding/upload`)
- Cowork Ops normalises: resize, optimise, convert to WebP, store
  derivatives
- Updates Notion with R2 keys for the build step

#### Step 5 (Review — H5 scope)
- Customer ticks final sign-off and picks go-live date
- Cowork Ops triggers a build via `wrangler deploy --env preview` on
  their Cloudflare account, parametrised by their data
- Generates a preview link, emails customer + Ben
- On go-live date: production deploy + DNS swap

### 4.4 Credentials & state

| Secret / state | Where | Notes |
|---|---|---|
| My Cloudflare API token (high-scope, account-level) | Cloudflare Worker secret `BEN_CLOUDFLARE_API_TOKEN` | Scopes: `User: User Details:Read`, `Account: Account Settings:Read`, `Zone: DNS:Edit`, `Account: Workers Scripts:Edit`, `Account: Pages:Edit`, `Account: Workers Routes:Edit` |
| My Resend API key | Worker secret `RESEND_API_KEY` (already exists) | Used as the team-member identity for accepting invites |
| Per-customer Resend sending API key | Notion `Onboarding Data` JSON, AES-encrypted; key in `RESEND_KEY_ENCRYPTION_KEY` Worker secret | Used for sending campaigns / transactional from their domain |
| Customer Cloudflare account ID | Notion `Onboarding Data.cloudflare.accountId` | Discovered after invitation acceptance |
| Customer Resend team ID | Notion `Onboarding Data.domain.resendTeamId` | Discovered after invitation acceptance |

### 4.5 Customer-side notifications

Cowork drafts customer-facing email copy → Ben approves in his email
client during the first-20-clients period (per Playbook §8) → sends.
After 20 clients, automation level goes up: status notifications
("DNS verified", "preview ready") send automatically without Ben
review. Acceptance / rejection / clarification stay human-reviewed
forever.

### 4.6 Failure & escalation

Every Cowork action wraps in:

```typescript
try {
  await action(prospect);
  await audit(prospect, action.name, "ok");
} catch (e) {
  await writeException(prospect, action.name, e);
  await emailBen({ subject: "Cowork escalation", ... });
}
```

Exceptions DB schema (TODO in Stage 2C kickoff):
- Prospect (relation)
- Step (select)
- Action (text)
- Error message (text)
- Stack trace (text)
- Resolved (checkbox)
- Resolution notes (text)

Ben is the human-in-the-loop ONLY when an exception fires. For
green-path operations, he never touches a dashboard.

## 5. Stage 2 phasing (revised)

### Stage 2A — Pre-payment pipeline (DONE)
Phase 1 enquiry → Phase 2 qualification → Phase 3 intake → fee
calculation → payment placeholder.

### Stage 2A Part 2 — Real Stripe (LATER)
Stripe Checkout integration, webhook → status flip to Paid.

### Stage 2B — Onboarding Hub UI (IN PROGRESS)
Customer-facing Hub for capturing onboarding data. **No automation
yet — captures data only.**
- H1: Scaffolding + Step 1 (Cloudflare) — DONE
- H2: Step 2 (Domain + optional Resend) — DONE
- H3: Step 3 (Tools — Cal.com booking URL + GBP URL capture)
- H4: Step 4 (Brand assets + R2 upload binding checkpoint)
- H5: Step 5 (Review + sign-off + go-live date)

### Stage 2C — Cowork Ops automation (NEW MILESTONE)

This is the milestone that delivers the "Ben never touches a
dashboard" promise. Estimated 16-20 hours. Five commits:
- C1: Ops Worker scaffolding (separate Worker, Cron Trigger, Notion
  poller, audit log table, Exceptions DB schema)
- C2: Cloudflare automation (membership accept; DNS + Pages project
  setup for Step 1 and Step 2-website parts)
- C3: Resend automation (Teams accept; domain add; DNS apply via
  Cloudflare; sending key generation; encryption)
- C4: Cal.com URL capture + GBP URL capture + browser-fallback for
  GBP (`claude-in-chrome` if needed)
- C5: Customer notification email pipeline (drafts → Ben approves
  during first-20-clients period → sends automatically thereafter)

### Stage 3 (LATER)
Full GBP API integration, custom domain `pandamoniumsoftware.co.uk`,
Plausible analytics, real photography, real testimonials, paid
Cal.com Platform if scale justifies it.

## 6. Open questions / pending decisions

- **Encryption library for Resend keys** — Web Crypto API (built into
  Workers) using AES-GCM, key from a Worker secret. Pin the choice in
  Stage 2C C3.
- **Cron interval** — 60s feels right; verify by simulating 10
  customers in flight at once.
- **Per-customer Cloudflare project naming** — proposal:
  `mf-<prospect-token-prefix>` (e.g. `mf-d2f42fb6`). Globally unique
  across the account. Confirm in Stage 2C C2.
- **Build pipeline parametrization** — currently the worker name is
  hardcoded (`pandemonium-software-website`). Stage 2C C5 needs to
  generalise this to deploy per-customer Workers with their data.
  Possibly via a templated `wrangler.jsonc` rendered at build time.
- **GBP browser fallback** — viable using `claude-in-chrome` MCP, but
  fragile (Google UI changes). Defer until first real customer needs
  it; URL-only suffices for many cases.

---

_Last updated by Cowork: see git log for `docs/ARCHITECTURE.md`._
