# ModuForge — Pandamonium Software Ltd

The customer-facing site and operations platform for **ModuForge**, the
flat-fee modular website service from **Pandamonium Software Ltd**.

ModuForge sells, qualifies, intakes and onboards UK trades and small
businesses; once a customer is live, the same codebase runs the
ongoing maintenance, content updates and performance reporting via
Cowork — the AI operations layer that means Ben never has to log into
a customer dashboard.

> **Architecture deep-dive:** see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
> for the full PRD: per-service automation feasibility, Cowork Ops
> Worker design, post-launch operations contracts, and the operational
> guardrails baked into every Cowork action.

---

## Stack

- **Next.js 15** (App Router, TypeScript)
- **React 19**
- **Tailwind CSS 3** + Fraunces (serif) + Inter (sans)
- **@opennextjs/cloudflare** — runs Next.js as a Cloudflare Worker (SSR)
- **Notion** (private workspace) — the operational source of truth for
  every prospect, client, asset and exception
- **Resend** — transactional + customer-owned newsletter sending
- **Cal.com** (URL-embedded) — customer-owned booking pages
- **Stripe** — subscriptions (Stage 2A Part 2 — placeholder for now)
- **Cloudflare R2** — customer brand asset storage (Stage 2B H4)

---

## Routes

The site has three concentric surfaces:

### Public marketing

| Route | Purpose |
| --- | --- |
| `/` | Hero, modular pricing pitch, trust strip, CTA |
| `/pricing` | Live module calculator + FAQ |
| `/about` | Ben's story + how AI fits into the operation |
| `/enquiry` | Phase 1 enquiry form |
| `/privacy` | UK GDPR privacy policy |
| `/terms` | Plain-English working agreement |

### Token-gated prospect pipeline

Each customer's journey is keyed by a UUID token issued at enquiry
and surfaced through every subsequent email.

| Route | Phase | Status gate |
| --- | --- | --- |
| `/qualify/[token]` | Phase 2 — qualification questions | After Phase 1 reply |
| `/intake/[token]` | Phase 3 — full 7-section intake wizard | After Phase 2 acceptance |
| `/payment/[token]` | Phase 3 → Stripe handoff | After intake submission |
| `/onboarding/[token]` | Stage 2B — 5-step Onboarding Hub | After payment |

### Operator surface

| Route | Purpose | Auth |
| --- | --- | --- |
| `/admin` | Pipeline dashboard, prospect list, copy-link tools | HTTP Basic Auth (`ADMIN_PASSWORD`) |

### API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/enquiry` | POST | Phase 1 form → Notion + email |
| `/api/qualify` | POST | Phase 2 form → compatibility engine → Notion |
| `/api/intake` | POST | Phase 3 partial saves + final submission |
| `/api/onboarding` | POST | Hub per-step partial saves + mark-done |
| `/api/prospect/[token]` | GET | Server lookup for token-gated pages |

---

## Lifecycle: from enquiry to ongoing operations

```
┌──────────────────────────────────────────────────────────────┐
│  Marketing                                                   │
│     /  /pricing  /about  /enquiry                            │
│                          │                                   │
│                          ▼                                   │
│  Pipeline (tokenised)                                        │
│     /qualify/[token]  →  /intake/[token]  →  /payment/[token]│
│                                                  │            │
│                                                  ▼            │
│  Onboarding (post-payment, Stage 2B)                         │
│     /onboarding/[token] — 5 steps                            │
│        1. Cloudflare account + invite Ben                    │
│        2. Domain + (optional) Resend Teams invite            │
│        3. Cal.com booking URL + GBP URL                      │
│        4. Brand assets upload                                │
│        5. Review + sign-off + go-live date                   │
│                                                  │            │
│                                                  ▼            │
│  Cowork Ops (Stage 2C, see docs/ARCHITECTURE.md §4)          │
│     • Accepts the customer's invitations                     │
│     • Provisions DNS, sender domain, sending API key         │
│     • Builds + deploys the site                              │
│     • Goes live on the agreed date                           │
│                                                  │            │
│                                                  ▼            │
│  LIVE                                                        │
│                                                  │            │
│                                                  ▼            │
│  Post-launch operations (docs/ARCHITECTURE.md §6)            │
│     • Recurring health checks (uptime, DNS, deps audit)      │
│     • Customer change requests (30 min/month included)       │
│     • Monthly performance reports                            │
│     • Module add/remove lifecycle                            │
│     • Incident response (3-tier escalation)                  │
│     • Stripe subscription monitoring                         │
│     • Cancellation handover                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Every line of "Cowork Ops" and "Post-launch operations" runs without
Ben touching a dashboard. He's the human-in-the-loop only when:

- Tier 3 incidents fire (genuinely broken, customer-impacting)
- The classifier flags an inbound request as ambiguous
- The first-20-clients period requires draft review on customer
  emails (auto-send for status updates only, after that)

For the full automation contracts — what triggers each duty, what
inputs it needs, what state it changes, and how failures escalate —
see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §6.

---

## Running locally

```bash
npm install
cp .dev.vars.example .dev.vars  # then fill in real values
npm run dev
```

Opens on <http://localhost:3000>.

For the full Cloudflare Workers preview (recommended before pushing):

```bash
npm run preview
```

This runs the OpenNext-built worker against Wrangler's local emulator
with `.dev.vars` providing secrets.

### Required env vars

See `src/lib/env.ts` for the validated schema. Production secrets live
in Cloudflare Dashboard (Workers & Pages → `pandemonium-software-website`
→ Settings → Variables and Secrets); local dev values live in
`.dev.vars` (gitignored).

Mandatory:

- `NOTION_API_KEY`
- `NOTION_PROSPECTS_DB_ID`, `NOTION_CLIENTS_DB_ID`,
  `NOTION_ASSETS_DB_ID`, `NOTION_EXCEPTIONS_DB_ID`
- `RESEND_API_KEY`
- `ADMIN_PASSWORD`

Optional:

- `BEN_CLOUDFLARE_EMAIL` (Onboarding Hub team-invite email — see
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §4.4)
- `STRIPE_*` (placeholder until Stage 2A Part 2)

---

## Build

```bash
npm run build
```

This runs:

1. `next build` — generates the optimised production bundle
2. `opennextjs-cloudflare build --skipNextBuild` — wraps the Next.js
   output as a Cloudflare Worker (`.open-next/worker.js`) plus static
   assets (`.open-next/assets/`)

Built output is what `wrangler deploy` uploads.

---

## Deploying

`git push origin main` triggers Cloudflare's auto-deploy via the
GitHub integration. Manual deploy:

```bash
npx wrangler deploy
```

The deployed worker is available at
<https://pandemonium-software-website.benpandher.workers.dev>.

> **Note on the worker name vs the brand.** The worker URL still uses
> the original "pandemonium-software-website" spelling because
> renaming would break previously-emailed Hub / Intake / Payment
> links. The customer-facing brand is **ModuForge** (and the legal
> entity **Pandamonium Software Ltd** — note the *a* vs *e*). When a
> custom domain registers, the worker URL becomes invisible to
> customers.

---

## Cowork — what it is and what it isn't

**Cowork** is the AI operations assistant that handles the routine
work of running ModuForge: reading enquiries, drafting replies,
running compatibility checks, accepting team invitations, provisioning
DNS, generating performance reports, processing change requests,
escalating incidents.

Cowork is **not**:

- A separate product or service customers see — they only see
  ModuForge
- A replacement for Ben on judgment calls (acceptance / rejection /
  scope / pricing — those stay human)
- An autonomous agent — it operates inside well-defined contracts (see
  `docs/ARCHITECTURE.md` §4 and §6) with idempotent actions, audit
  trails and explicit escalation tiers

The first 20 clients run with Ben reviewing every customer-facing
email before send. After that, status updates ("DNS verified",
"preview ready", "report ready") send automatically; everything else
stays human-reviewed.

---

## Design tokens

- Primary: `navy` (deep navy — trustworthy)
- Accent: `ember` (warm orange)
- Surface: `cream` (warm neutral)
- Serif: Fraunces · Sans: Inter

---

## Status: what's done, what's next

### Done

- Stage 1 — full marketing site
- Stage 2A — pre-payment pipeline (enquiry → qualification →
  compatibility engine → intake → fee calculation → payment placeholder)
- Stage 2B Phase H1 — Onboarding Hub scaffolding + Step 1 (Cloudflare)
- Stage 2B Phase H2 — Step 2 (Domain + conditional Resend Teams flow)
- ModuForge brand introduced; legal entity Pandamonium Software Ltd
  preserved
- AI transparency disclosures (Privacy §5, About page, enquiry copy)

### In progress

- Stage 2B Phase H3 — Step 3 (Cal.com URL capture + GBP URL capture)
- Stage 2B Phase H4 — Step 4 (Brand assets + R2 upload binding)
- Stage 2B Phase H5 — Step 5 (Review + go-live)

### Next

- Stage 2A Part 2 — real Stripe Checkout integration
- Stage 2C — Cowork Ops automation worker (the milestone that makes
  the "Ben never touches a dashboard" promise real). 5 commits, see
  `docs/ARCHITECTURE.md` §5
- Stage 3 — full GBP API integration, custom domain, Plausible
  analytics, real client photography and testimonials

---

## Licence

All rights reserved © Pandamonium Software Ltd.
