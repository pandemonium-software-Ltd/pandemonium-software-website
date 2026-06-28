# ModuForge — Master Development Plan
### Pandemonium Software Ltd · build-to-revenue-and-saleability roadmap

**Owner:** Ben Pandher
**Last reconciled against codebase:** 2026-06-03
**Relationship to other docs:** This is the canonical strategic plan. `docs/ROADMAP.md`
is the tactical priority list and feeds into the phases here. When they disagree, this
document's status annotations win (they were reconciled against the actual code).

**Purpose:** Take ModuForge from "excellent product, unproven business" to "proven,
retentive, automated, founder-removable engine." One workstream per Claude Code session.

---

## Status legend

- ✅ **Done** — built and (where relevant) deployed
- 🟡 **Partial** — meaningful pieces exist; specific gaps remain
- 🔴 **Not started** — greenfield

## Golden rules (apply to every workstream)

- **Irreversible = code-guarded + approved** for the first ~20 clients. Always. (Charges,
  subscription creation, builds, go-live sends, deletes — guarded by deterministic code,
  never model judgment alone.)
- **Everything consequential routes through the approval queue** until graduated.
- **Every automated action is audit-logged** with reasoning.
- **Nothing reaches production without a green `preflight` + a staging run.**
- **No onboarding-flow change ships without a green E2E harness run** (3 persona runs)
  **and a regression test** for any issue it fixes.
- **Replace every `[CONFIRM £]`** with real current pricing before building that workstream.
- A workstream isn't done until its **DoD is genuinely all-true**, including any
  deliberately-break-it test.

## Platform note (important — corrects the original plan)

Production runs on **OpenNext + Cloudflare Workers** (`npm run deploy`), **not Cloudflare
Pages**. The ops cron is a second Worker (`wrangler-ops.jsonc`). Any "staging environment"
work must use **`wrangler` environments / a second Worker + staging secrets**, not a Pages
preview. Bindings in play: D1 (`pandemonium_analytics`), R2 (`ASSETS_BUCKET` =
`moduforge-customer-assets`), Notion, Stripe, Resend, Sentry.

## Current reality in one paragraph

The **product and the ops spine already exist and are live**: the `/admin` control centre
(pipeline, build/run/customer-insight/marketing panels, business-health, Sentry inbox), an
approval/exceptions queue (Ops Activity panel), Notion-backed audit logging, Stripe
**sandbox** fully wired (checkout, webhooks, idempotency, dunning handlers, daily applier
cron), GBP automation, GDPR retention crons, and a 290-test vitest suite. The **gaps are
business-maturity, not product**: no staging env, no live Stripe, no synthetic E2E journey
test, no onboarding funnel instrumentation, no revenue mechanics (prepay/referrals), no
per-client health score, and none of the retention/expansion/saleability layers.

---

# PHASE 0 — Safety Foundations

*Prerequisite for everything. The difference between "automation as moat" and "automation as liability."*

## 0.1 — Branch strategy & staging environment — 🔴 Not started · **TOP PRIORITY**

**Objective:** Never test on live clients. Every change proves itself in a full staging
mirror before production.

**Today:** Single-branch `main → prod` only. `npm run deploy` ships straight to
modu-forge.co.uk. No staging, no isolated env vars, no PR gate.

**Remaining (the whole thing), Workers-correct:**
- Three-tier git model: `main` (prod), `staging`, short-lived `feature/*`.
- Staging as a **second Worker** via `wrangler` environments (or `wrangler-staging.jsonc`)
  on a `staging.modu-forge.co.uk` route or `.workers.dev` URL, with its own secrets:
  Stripe **test** keys, a separate Notion **staging** workspace/databases, Resend sandbox
  sender, test Cal.com. Provably isolated from prod Notion/Stripe/Resend.
- `DEPLOY.md`: feature → PR to staging → verify → PR to main → deploy.

**DoD:** staging deploys to a separate URL with separate env vars (visible test change
appears on staging not prod) · a staging test payment creates nothing in prod ·
`DEPLOY.md` exists and followed once end-to-end.

## 0.2 — Idempotency & deterministic guards — 🟡 Partial (~80%)

**Objective:** Structurally impossible to double-charge, double-build, or double-send.

**Today:** Stripe idempotency keys on all mutations (`src/lib/stripe.ts`); webhook signature
verification + double-apply protection (`/api/webhooks/stripe`); status-check guards on
module-change apply, build triggers (anti-spam latches `previewBuildTriggeredAt` /
`finalLaunchTriggeredAt`), and GBP confirm flow.

**Remaining:**
- `IRREVERSIBLE_ACTIONS.md` — explicit inventory of every irreversible action + its specific
  code guard (currently implicit/scattered).
- Confirm a **processed-Stripe-event-ID store** exists so webhook *replays* (not just
  double-resolution) are provable no-ops; add if missing.
- Ensure every guard failure **escalates to the approval queue**, never silently skips.

**DoD:** `IRREVERSIBLE_ACTIONS.md` complete · replaying a Stripe event twice → exactly one
effect (proven on staging) · forced duplicate build trigger is blocked + escalated.

## 0.3 — Audit logging — 🟡 Partial (mostly done)

**Objective:** Every automated decision/action recorded immutably (debugging + safety + buyer asset).

**Today:** Notion ops audit log (`src/lib/notion-ops.ts`, `listAuditEntries`); Ops Activity
panel surfaces recent automated actions + a 24h count; exceptions DB for escalations.

**Remaining:** verify coverage is *universal* (every cron + Cowork step writes a run-summary
with reasoning + inputs hash + outcome + Haiku verdict where applicable); confirm no raw PII
in log payloads (reference by ID). Add an "Audit & Observability" item to the monthly cadence.

**DoD:** every automated action → audit record with reasoning · "what did the system do for
client X and why" reconstructable from the log alone · failed/escalated visually distinct.

## 0.4 — Regression test harness & `preflight` — 🟡 Partial

**Objective:** A growing suite that must pass before any production deploy.

**Today:** 290 vitest unit tests (compatibility engine, fees, admin-metrics, d1-analytics,
templates, GBP lifecycle, etc.). CI `security-check.yml` runs `tsc` + `vitest` + `npm audit`.

**Remaining:**
- A single **`npm run preflight`** script = `tsc --noEmit` + `vitest run` + `npm audit`
  (+ later the E2E harness T.1), with clear pass/fail. (Trivial — scripts today are only
  `test`/`lint`.)
- Make "every bug gets a regression test before it's closed" an explicit rule in `DEPLOY.md`.

**DoD:** `npm run preflight` green on clean build · breaking a compatibility rule turns it
red · wired into the pre-deploy habit.

---

# MODULE T — Onboarding Test Flow & Feedback Loop

*Proves the journey works before real users; surfaces real friction after. The Onboarding Hub is the highest-risk surface (fully self-service, no human mid-flow).*

## T.1 — Synthetic end-to-end harness — 🔴 Not started

**Objective:** Drive the full prospect → qualified → paid → onboarded → live journey as
scripted fake users on staging, repeatedly, before any real person.

**Today:** Only unit tests. No Playwright / browser-level journey test.

**Remaining:** Playwright harness on staging asserting state across Notion/Stripe(test)/
Resend(sandbox)/audit at each stage. **Three persona runs:** easy client (happy path),
difficult client (wrong file types, oversize uploads, abandon+resume via token,
contradictory options, blank required fields), drop-out (2 of 5 Hub steps then stalls →
nudge + clean resume). Step-by-step Hub assertions (loads, video present, validation,
progress persists). Inject third-party failures → assert safe/escalated. Wire into
`preflight`. Every real onboarding issue (T.4) becomes a new assertion here.

**DoD:** all 3 persona runs pass E2E · every Hub step individually exercised incl.
resume-after-leave · injected failures → safe escalated outcomes · runs in `preflight`.

## T.2 — Onboarding instrumentation (funnel) — 🔴 Not started

**Today:** Cloudflare edge analytics exist for the **marketing site** (`@self`), surfaced in
the admin Marketing panel. No **per-step onboarding funnel** (enquiry → qualify → intake →
Hub) — the highest-dropout journey is currently unmeasured.

**Remaining:** privacy-respecting per-step events keyed by token (started/completed/
time-on-step/validation-errors-by-field/upload-failures/abandon/resume); funnel view +
highest-friction steps in the control centre; real-time stuck-user flag → approved nudge.

**DoD:** every step emits start/complete/error/abandon (no PII) · control centre shows funnel
+ friction steps · stuck user flagged near-real-time.

## T.3 — In-flow feedback capture — 🔴 Not started

**Today:** Customers have change-request / quick-edit forms post-launch, but no
"I'm stuck"/"not clear here?" control *during onboarding*, and no post-go-live micro-survey.

**Remaining:** per-step quick-feedback control → Notion "Onboarding Feedback"; optional
approved Cowork help response on "I'm stuck"; 2–3 question post-go-live micro-survey.

**DoD:** each step has a working feedback control · "I'm stuck" can trigger approved help ·
micro-survey fires + captured.

## T.4 — Issue triage → fix → regression loop — 🔴 Not started

**Today:** Ops Activity panel aggregates *automation* exceptions, but no unified onboarding
triage queue fusing harness failures + funnel drop-offs + user feedback.

**Remaining:** single triage queue (control centre + Notion) with source/step/severity/
frequency/status; documented loop in `DEPLOY.md`/`RUNBOOK.md` (triage → reproduce on staging
→ fix on branch → **add regression assertion** → green → ship); trend onboarding completion
rate over time.

**DoD:** all 3 sources → one queue · "fix must add a regression test" documented + followed
once · completion-rate trended.

## T.5 — Guided first-cohort pilot — 🔴 Not started (operating protocol)

**Objective:** First three founding clients = the real, watched, fully-instrumented test.

**Remaining:** "pilot mode" flag forcing max logging + approval on every step; structured
debrief after each of the first three → triage loop; onboarding autonomy (Phase 4.1) gated
behind **three clean guided runs**. The founding discount is the trade for being forgiving
early testers.

**DoD:** pilot mode forces full instrumentation + approval · each of first 3 has a completed
debrief feeding triage · autonomy gated behind 3 clean runs (documented).

---

# PHASE 1 — Fast Revenue Wins

> **Prerequisite (from `docs/ROADMAP.md` #1): Stripe LIVE-mode — 🔴 Not started, ~1.5–2h.**
> Sandbox is 100% wired. Live needs: create live products/prices, add `STRIPE_MODE` env
> flag (a `TODO(go-live)` already sits in `stripe-products.ts`), register the live webhook,
> set `sk_live_*`/`pk_live_*`/`whsec_*` secrets, deploy, smoke-test. **No real revenue —
> and therefore no real Phase 1 — until this is done.**

## 1.1 — Prepay annual discount — 🔴 Not started

**Today:** Only monthly Stripe prices exist (`stripe-products.ts`). No annual SKUs, no
billing-term field.

**Remaining:** annual Stripe prices for base + each module at `[CONFIRM £]` ("pay 10, get
12"?); monthly/annual toggle on pricing + payment flow; same deterministic guards; Notion
`Billing Term` + `Renewal Date`; day-60 annual offer for engaged monthly clients (gated by
health score once 2.3 exists).

**DoD:** annual prices purchasable on staging + guarded · Notion records term + renewal ·
Terms page reflects annual terms.

## 1.2 — Referral engine — 🔴 Not started

**Remaining:** unique code per client on activation; redemption path (referee setup discount
`[CONFIRM £]`, referrer reward `[CONFIRM £]` — **decide cash vs free-month**); Notion
"Referrals" DB; Cowork "ask at a win" trigger (post-review / enquiry-spike / 30-day check-in),
draft-and-approve; reward issuance = guarded + approved.

**DoD:** every active client has a code · test referral flows issue→redeem→reward-queued→
recorded · "ask at a win" lands in approval.

## 1.3 — Failed-payment recovery (dunning) — 🟡 Partial (substantially built)

**Today:** Webhook handles `invoice.payment_failed` → reverts module selection, flips
pending-change to `billing-failed`, emails customer with Billing Portal link
(`payment-method-update-needed` template). Billing failures now surface in the admin Panel D
payment-health section.

**Remaining:** enable Stripe **Smart Retries** + Stripe dunning emails (dashboard, live mode);
confirm `customer.subscription.past_due` handling + a Notion `Payment Status = Past Due`
field/flag; recovery sequence with approved personal nudge for first cohort; **no
auto-cancellation without Level-3 escalation + approval**.

**DoD:** simulated failed payment → recovery sequence + Notion update · recovery on retry
clears flag · no auto-cancel without escalation.

---

# PHASE 2 — Control Centre & Intelligence Layer

*The spine. Largely built already — the gap is the client-intelligence half.*

## 2.1 — Control centre skeleton — ✅ Done (as `/admin`)

`/admin` is the control centre (ROADMAP #5, complete + deployed 2026-06-03): KPI strip +
service-health strip; Pipeline (AdminProspectList); Build/Customer-Insight/Run/Marketing
panels; Business Health; Ops Activity; Sentry inbox. Server-rendered, auth-gated, mobile-ok.
*Optional:* it lives at `/admin` not `/control` (no need to rename); Panel B location list →
heatmap is low-value polish.

## 2.2 — Exceptions / approval queue — ✅ Done

Ops Activity panel: pending admin actions (change-requests + review-edits) + unresolved
incidents + 24h audit log, with **multi-select bulk approve/retry/resolve**. *Verify:* that
**every** irreversible action type routes here for the first cohort (audit the coverage as
part of 0.2's `IRREVERSIBLE_ACTIONS.md`).

## 2.3 — Client health score — 🔴 Not started

**Important distinction:** the existing **Business Health** panel is *ops* health (GDPR/CI/
secret-rotation/audit-freshness) — **not** a per-client churn score. That is still greenfield.

**Remaining:** composite per-client score from payment status, site uptime, enquiry/booking
trend, report engagement, Haiku-classified support sentiment (advisory), recency; cron-
computed; Notion `Health Score`/`Health Trend`/`Risk Flags`; R/A/G in control centre;
health *actions* route through approval.

**DoD:** every active client scored + trended on schedule · a "sick" test client flags red ·
sortable in control centre.

## 2.4 — Onboarding-to-first-value tracking — 🔴 Not started

**Remaining:** per client track go-live date, first real enquiry/booking, elapsed
time-to-first-value; 30-day-zero-enquiry → churn-risk flag + approved "let's get you
enquiries" intervention; feed health score.

**DoD:** first-value recorded · 30-day-no-enquiry → approved intervention · feeds health score.

## 2.5 — Cost monitoring on your own APIs — 🔴 Not started

**Today:** Haiku client + Resend + Places calls exist but spend isn't tracked/capped/surfaced.

**Remaining:** per-day/per-run Claude(+Haiku)/Resend/other consumption tracking → control
centre; budget thresholds + alerts; per-run caps / circuit breakers on the cron so a runaway
loop is capped + escalated.

**DoD:** daily spend visible · simulated runaway loop hits cap + escalates · threshold alerts fire.

## 2.6 — Segmentation data capture — 🟡 Partial

**Today:** `businessType`/vertical captured + shown (Panel B pipeline-by-niche, location
spread). **Acquisition source is NOT captured.**

**Remaining:** add `acquisitionSource` (referral / free-preview / direct / …) to every
record; control-centre conversion + retention **by segment and by source**.

**DoD:** every record carries vertical + source · control centre shows conversion/retention
by both · can answer "which vertical + channel convert best?"

---

# PHASE 3 — Retention & Expansion Revenue Layer

*Moat, LTV, NRR — the metric a buyer underwrites. Mostly greenfield; design as one coherent layer.*

## 3.1 — Premium "Done-For-You" tier — 🔴 Not started
`[CONFIRM £]/mo`. Managed hosting/domain, premium templates, higher change allowance,
written-for-them newsletter, priority SLA, monthly review campaigns. Stripe product + Notion
`Tier` unlocking entitlements. **Transfer-on-exit path** so "you own everything" survives.

## 3.2 — Retention features (reviews · loyalty · lists) — 🟡 Partial
- **Review collection automation** (ROADMAP #9): post-job approved SMS/email → one-tap Google
  review link, `[CONFIRM £]/mo`. 🔴 (live-reviews *display* exists; *collection* doesn't.)
- **Loyalty** (wallet-pass, no app). **Validate demand / resell before bespoke 3–4wk build.**
  `[CONFIRM £]/mo`. 🔴
- **Newsletter list-building as retention** — list infra exists; the "you've built a list of
  N" framing in reports does not. 🟡

## 3.3 — Upsell / expansion triggers — 🔴 Not started
Cowork detects expansion moments (high enquiries → Booking; busy → Premium; repeat customers
→ Loyalty); draft-and-approve signal-tied nudge; track conversion by trigger → NRR.

## 3.4 — Win-back sequences — 🔴 Not started
On cancel, approved touches at ~30/60/90d; re-activation = guarded + approved; track conversion.

## 3.5 — Annual "value delivered" review — 🔴 Not started
Yearly auto-compiled enquiries/bookings/reviews/list-growth/uptime summary, timed to renewal
(pairs with 1.1), approved before send for first cohort.

---

# PHASE 4 — Automation Maturity & Saleability

*Turns a job into a sellable engine. Where the £100k outcome is built.*

## 4.1 — Automation graduation framework — 🔴 Not started
Track per task: runs / correct / escalated / overridden. Graduation criteria (N consecutive
correct, zero overrides) → draft-and-approve becomes autonomous — **except irreversible
actions, which stay guarded+approved regardless.** Surface graduation status in control centre.

## 4.2 — Founder-removability metric — 🔴 Not started
From the audit log, compute % of consequential 30-day actions that required *Ben specifically*
vs system/non-founder-with-runbook. Trend it down. North-star for build-to-sell.

## 4.3 — Operations runbook — 🔴 Not started
`RUNBOOK.md` for a *human owner*: system map (Cloudflare/Notion/Stripe/Resend/GBP/Cal.com/
cron), daily/weekly cadence from the control centre, every escalation type, manual onboarding
if automation is down, key rotation. Test: a competent stranger could run a day from runbook +
control centre alone.

## 4.4 — Data export / portability — 🟡 Partial
**Today:** per-customer GDPR export exists (`/api/account/export`).
**Remaining:** a **whole-business** export (full client base + configs + billing refs +
history → CSV/JSON) for buyer confidence / disaster recovery, documented for a new owner.
(ROADMAP #26 backup/restore drill belongs here.)

---

# Sequencing (reconciled order to actually build)

1. **0.1 Staging** (Workers, not Pages) — unblocks safe iteration on everything else. **Start here.**
2. **0.4 `preflight` wrapper + 0.2 `IRREVERSIBLE_ACTIONS.md`** — small; mostly formalising
   what exists. (0.3 audit logging is already mostly there — just verify coverage.)
3. **Stripe LIVE** (ROADMAP #1, ~2h) — the revenue gate.
4. **T.1 synthetic E2E harness** — must exist before any real onboarding.
5. **1.1 Prepay + 1.2 Referrals + finish 1.3 Dunning** — fast compounding revenue.
6. **T.2 instrumentation + T.3 feedback + T.4 triage** — live *before* first real client.
7. **2.3 health score + 2.4 first-value + 2.6 segmentation (source) + 2.5 cost monitoring** —
   the intelligence half of Phase 2.
8. **T.5 guided first-cohort pilot** — first three real clients, every net on.
9. **3.1 Premium + 3.2 Retention** (design together).
10. **3.3 Upsell + 3.4 Win-back + 3.5 Annual review** — expansion/NRR.
11. **4.1–4.4 Saleability** — graduation, removability, runbook, whole-business export.

*(2.1 control centre + 2.2 approval queue are already done and feed every step above.)*

---

# Backlog carried from `docs/ROADMAP.md` (mapped into phases)

| ROADMAP # | Item | Maps to / status |
|---|---|---|
| 1 | Stripe LIVE | **Phase 1 prerequisite — 🔴 do next after staging** |
| 5 | Admin dashboard | **✅ 2.1 + 2.2 (done 2026-06-03)** |
| 11 | Privacy/cookie refresh | ✅ Done/N-A (no tracking cookies) |
| 14 | Onboarding walkthroughs | ✅ driver.js guides live; video files outsourced |
| 17 | SEO pass — FAQ page | 🟡 ~75% done; only dedicated `/faq` remains (2–4h) |
| 18 | Perf + a11y audit | 🔴 polish backlog |
| 8 | Lead inbox / mini-CRM | overlaps 2.1/2.2 (partly satisfied); revisit at volume |
| 9 | Review request automation | → **3.2** |
| 10 | Performance pricing tier | needs 1.x + 8; defer |
| 12 | Per-recipient newsletter drill-down | polish; data exists, UI only |
| 13 | Customer lifecycle emails | → T / 3.x (welcome/check-in/anniversary) |
| 15 | Founding-member landing + cap | marketing; pairs with T.5 cohort |
| 16 | Trade-body badges + schema | SEO polish |
| 19 | Cowork email triage | support; → automation maturity |
| 19a | Multi-location dashboard counter | trigger-based (first 2nd-location request) |
| 20 | Cowork content engine | expansion (Phase 3+) |
| 21 | Photo-to-post pipeline | expansion (Phase 3+) |
| 22 | Notify on admin-granted allowance | trivial; approval-loop polish |
| 23 | Backfill analytics days | trivial |
| 24 | Live chat | optional |
| 25 | A/B pricing | wait for ≥50 customers |
| 26 | Backup/restore drill | → **4.4** |
| 27 | VAT registration | trigger-based (£90k rolling turnover) |
| 28 | Trademark wordmark | optional, £170 filing |

---

# Still needed from Ben before specific builds

1. **Real current prices** — base setup/monthly, each module, gut on premium + referral/
   prepay incentives. Everything `[CONFIRM £]` waits on this.
2. **Cash vs free-month** as default referrer reward.
3. **Loyalty: resell-first or build-bespoke** (strong recommendation: resell-to-validate first).

> **On the confidence worry:** you don't reach certainty in a lab — probabilistic automation
> can't. You prove the journey synthetically (T.1), instrument friction (T.2–T.3), run three
> forgiving clients as a watched pilot (T.5), and feed every issue into a loop that adds a
> permanent test (T.4). Confidence is earned through instrumented real use with the safety
> nets on — not by delaying launch until an unmeetable bar is met.
