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
- A workstream isn't done until its **DoD is genuinely all-true**, including any
  deliberately-break-it test.

## Pricing

### Current live pricing (code `fees.ts` + Stripe sandbox agree, verified 2026-06-03)

This is what's on the site **today** — kept as a factual record. Changing it is a deliberate
reprice (code + Stripe + staging discipline), not done casually.

| Item | Setup | Monthly |
|---|---|---|
| Standard base | £299 | £29 |
| Founding base (5-yr lock, 3 spots) | £99 → **£199** (raising) | £15 |
| Online Booking | £19 | £6 |
| Enquiry Form | £19 | £6 |
| Newsletter | £49 | £9 |
| Offers | £19 | £6 |
| Google Business Profile + reviews | £59 | £3 |
| Multi-location (per extra location) | £15 | — |

### Target pricing — premium-anchored (start high, come down only on data)

**Strategy (Ben's call):** anchor high and discount down if conversion data demands — never
the reverse (you can't raise on existing customers easily, but you can always run a launch
offer). The current £29/£299 prices the brand like DIY while delivering done-for-you; this
repositions to value-based, with a **visible Premium tier as the anchor** that makes Standard
read as a bargain. Every number has a **floor** = where we retreat to before discounting
further or rethinking the model.

| Tier / module | Setup | Monthly | (from) | Floor (≈ today's price — don't go below without a model rethink) |
|---|---|---|---|---|
| **Founding** | £199 | £15 | £99 → £199 (Ben, 2026-06-03) | — (3 proof spots only, 5-yr lock) |
| **Standard** | £399 | £45 | £299 / £29 | £35/mo, £299 setup |
| **Premium** (new — visible anchor) | £799 | £149 | — | £99/mo, £549 setup |
| Online Booking | £25 | £8 | £19 / £6 | £6 |
| Enquiry Form | £25 | £8 | £19 / £6 | £6 |
| Newsletter | £65 | £12 | £49 / £9 | £9 |
| Offers | £25 | £8 | £19 / £6 | £6 |
| Google Business Profile + reviews | £79 | £5 | £59 / £3 | £3 |
| Multi-location (per extra) | £20 | — | £15 | £15 |

**Why these (middle ground — ~halfway between today and the aggressive anchor):**
- **Premium £149/mo** — still the visible high anchor, agency-retainer framing ("we run your
  leads, reviews and newsletter; priority SLA"). Its job is to *anchor*, lifting willingness
  to pay for Standard even for customers who never buy it. List it (even "by application")
  from launch.
- **Standard £45/mo** (~1.5× current) is value-based for done-for-you, comfortably under a
  £30–100/mo agency retainer. The all-modules loaded price (~£45 + ~£41 = ~£86) sits cleanly
  *between* Standard and Premium, so Premium stays clearly differentiated as a **service
  layer, not a feature bundle**.
- **Founding £199 setup / £15/mo** (setup raised from £99) — still the proof loss-leader and
  far below Standard, but £199 better covers onboarding effort for the 3 spots. The £15/mo 5-yr
  lock is unchanged. **Code reconciliation needed:** `fees.ts` `FOUNDING_MEMBER_SETUP_GBP` is
  still 99 → update to 199 (one-liner; setup is charged inline so no Stripe price change). No
  founding customers exist yet, so safe.
- **Modules** nudged up to lift ARPU/NRR (the build-to-sell multiple) without making à la
  carte feel punitive.

**Rollout rule:** keep current prices live for the **founding cohort** (don't move the goalposts
on early testers). Apply target pricing to **new Standard/Premium sign-ups** once there are
2–3 testimonials to justify the value story. The reprice is itself a tracked decision — record
conversion at each price point before discounting toward the floors.

Setup fees are charged inline at checkout (Stripe `price_data`); monthly fees use pre-created
Stripe prices (all currently `livemode:false` — live + new target prices created at the
Stripe-LIVE toggle). Still-open new products: annual SKUs (1.1), referral credit (1.2),
review-automation + loyalty modules (3.2) — defaults proposed inline.

## Platform note (important — corrects the original plan)

Production runs on **OpenNext + Cloudflare Workers** (`npm run deploy`), **not Cloudflare
Pages**. The ops cron is a second Worker (`wrangler-ops.jsonc`). Any "staging environment"
work must use **`wrangler` environments / a second Worker + staging secrets**, not a Pages
preview. Bindings in play: D1 (`pandemonium_analytics`), R2 (`ASSETS_BUCKET` =
`moduforge-customer-assets`), Notion, Stripe, Resend, Sentry.

## Current reality (reconciled against code + automation audit, 2026-06-03)

The **product and ops spine exist, are live, and the happy path already runs with no human
in it.** A minutely ops-worker cron + daily/monthly crons drive: enquiry → intake → fee calc
→ payment (webhook) → **all 7 onboarding steps** (Cloudflare accept, zone/DNS/Worker, Resend
domain, GBP seed, preview build, go-live build → status flips to Live) → daily analytics, GBP
reviews, GDPR scrub, Stripe applier, monthly digest. Change requests that are form-generated
or single-field high-confidence **auto-apply** via a two-pass Haiku classifier. Supporting
this: the `/admin` control centre, an approval/exceptions queue (Ops Activity panel),
Notion-backed audit logging, Stripe **sandbox** fully wired, and a 290-test vitest suite.

**So the automation goal is much closer than a "Phase 4" framing implies.** Two gap-sets
remain between here and "rock-solid + near-fully-automated":

- **Remaining human touchpoints (the "hands-off" gap):**
  1. **Phase 2 non-accept qualification replies** — Ben hand-drafts responses for ~40% of
     qualifications (soft-reject / flag / clarification). *The single biggest manual surface.*
  2. **Change-request escalations** — multi-field / ambiguous / <75% confidence / multi-item.
  3. **Build-failure investigation** — failures notify but don't self-recover.
  4. Rare edge cases (Cloudflare membership ambiguity; one-time secret setup).

- **Resilience / trust gaps (the "rock-solid" gap):** no retry on GitHub build dispatch or
  Resend email sends; many `.catch(() => {})` admin-notify / Notion-patch calls not wired to
  Sentry (can fail invisibly); classifier failures escalate immediately instead of retrying;
  exception dedup suppresses recurring issues (1 email/24h, no re-alert).

**Separately, the business-maturity gaps** (revenue/saleability track, largely orthogonal to
automation): no staging env, no live Stripe, no synthetic E2E test, no onboarding funnel
instrumentation, no revenue mechanics (prepay/referrals), no per-client health score, and
none of the retention/expansion layers.

## Definition of "full automation" (the target)

Not "never fails" (impossible with external deps + a probabilistic classifier). The achievable
bar is: **no silent failures · no permanent stuck states · automatic recovery from transient
faults · safe escalation of everything else · and a learning loop so each new failure class
can't silently recur.** Built in four layers: per-action hardening (0.5) · system-level
self-healing reconciler (A.4) · total observability (Sentry + audit on everything) · the T.4
regression loop.

**Two-stage involvement target (Ben's decision A):**
- **First ~20 clients — "10-minute approval queue":** machine runs everything; irreversible or
  ambiguous actions park for a one-tap approve. (= the golden rule.)
- **Beyond 20 — "zero daily involvement":** graduated tasks run unattended (4.1); only
  genuinely irreversible OR low-confidence actions ever escalate; Ben checks in weekly.
  Measured by the 4.2 removability metric → near zero.

The whole **Phase A** track plus 0.5 exists to move from today (happy-path autonomous,
~4 manual touchpoints, brittle failure handling) to this target.

---

# PHASE 0 — Safety Foundations

*Prerequisite for everything. The difference between "automation as moat" and "automation as liability."*

## 0.1 — Branch strategy & staging environment — 🟡 Staging LIVE (2026-06)

**Live:** staging Worker at `pandemonium-software-website-staging.benpandher.workers.dev`
with **isolated bindings** — staging D1 (`pandemonium-analytics-staging`,
`22f31661…`) + staging R2 (`moduforge-customer-assets-staging`), separate from
prod. Deploy with `npm run deploy:staging`. `account_id` pinned to proton
(`4954…`). `DEPLOY.md` written; `npm run preflight` added.
**Remaining:** set staging secrets (below) to exercise dynamic routes; create
the `staging` git branch. Marketing-site UI (home, pricing, hero, carousel,
pricing puzzle) can already be previewed on staging **without** secrets.

**Staging secrets — needed only for the dynamic flow (admin, payments, enquiry
→ Notion, onboarding). Set on the staging Worker only (`--env staging`):**

| Secret | Staging value | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` (test mode) | checkout / subscriptions |
| `STRIPE_WEBHOOK_SECRET` | test webhook secret | webhook verification |
| `NOTION_API_KEY` | token for a **separate staging Notion DB** | prospect/client store — never the live DB |
| `RESEND_API_KEY` | test/sandbox sender | emails (sandbox so no real client mail) |
| `ANTHROPIC_API_KEY` | any key (or reuse) | Haiku classification |
| `SESSION_SECRET` | any long random string | auth/session signing |
| `INTERNAL_BUILD_SECRET`, `GITHUB_TOKEN` | as needed | build-callback / dispatch (if testing builds) |

```
npx wrangler secret put STRIPE_SECRET_KEY --env staging
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
npx wrangler secret put NOTION_API_KEY --env staging
npx wrangler secret put RESEND_API_KEY --env staging
npx wrangler secret put ANTHROPIC_API_KEY --env staging
npx wrangler secret put SESSION_SECRET --env staging
```

**The critical isolation:** point `NOTION_API_KEY` at a **separate staging Notion
database** (duplicate the prospect/client DBs into a staging workspace, share with
the integration) — so test enquiries/payments on staging never touch live customer
records. Stripe **test** keys + Resend sandbox give the same isolation for
payments + email. This is what makes the staging flow safe to exercise end-to-end.

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

## 0.5 — Resilience & silent-failure elimination — 🔴 Not started · **the "rock-solid" core**

**Objective:** The system never fails *invisibly* and never gets *stuck* on a transient blip.
This is the half of "rock-solid automation" the original plan omitted — and the precondition
for letting anything graduate to unattended (4.1). Surfaced by the automation audit.

**Today:** Idempotency is good (Stripe keys, status guards). But failure-handling is brittle:
- **No retry** on GitHub build dispatch (`src/lib/github.ts`) or Resend sends
  (`src/ops-worker/notify.ts`, `src/lib/email.ts`) — one 5xx/timeout = stuck record or lost email.
- **Silent failures:** many `notifyAdmin()` / Notion-patch calls use `.catch(() => {})` and
  aren't wired to Sentry (`build-callback`, `cowork-apply`, `step6-change-requests`) — Ben can
  be blind to a failed launch email or an unstamped patch.
- **Classifier failure escalates immediately** (`step6-change-requests.ts`) — a 60-second
  Haiku blip dumps up to 10 requests on Ben instead of retrying.
- **Exception dedup over-suppresses:** one email per error per 24h, no re-alert if it recurs
  all week (`src/ops-worker/exceptions.ts`).
- **No circuit breaker** on Resend 429s (keeps trying to the per-tick cap).

**Remaining:**
- Bounded retry w/ backoff on GitHub dispatch + Resend sends; on exhaustion → escalate, never
  silently drop.
- Wire **every** silent `.catch` on a consequential action to Sentry + an audit-log entry.
- Classifier: retry-before-escalate (e.g. 1 retry next tick) so blips don't flood the queue.
- Recurring-exception re-alert (e.g. re-page after N occurrences or M hours, not just once).
- A "stuck record" sweep: detect prospects parked in a transient state (e.g. preview
  submitted >cooldown) and auto-retry or escalate.

**DoD (with deliberate-break tests):** kill GitHub/Resend on staging mid-flow → action
retries then escalates, nothing lost · force a `notifyAdmin` failure → it appears in Sentry +
audit log · simulate a 60s Haiku outage with 10 pending CRs → they retry, don't all escalate ·
a recurring step error re-alerts, not just once.

## 0.6 — Data-layer consolidation: Notion → D1 — 🔴 Not started · runs in parallel

**Objective (Ben's call):** move the system-of-record off Notion onto **Cloudflare D1**, keep
both **running in parallel (dual-write)**, then **retire Notion** once D1 is proven. Notion's
limits (≈3 req/s rate limit, API latency, no transactions/relational integrity, the 502s seen
in the audit) make it a resilience risk as source-of-truth, and a buyer prefers a real DB —
so this serves both 0.5 resilience and saleability.

**D1 limits (researched 2026-06-03) — comfortably fine for ModuForge:**
- **10 GB per database** (hard cap; can't raise — but per-account up to 1 TB, and sharding is
  possible). Customer records are tiny; the only growth risk is analytics, which already prunes.
- **Single-threaded writes** (~1,000 q/s at 1 ms/query, serialized) — ModuForge's write volume
  (a minutely cron + occasional customer actions) is nowhere near this.
- **Rows-read metered** for billing; **Time Travel** gives 30-day point-in-time restore (a plus).
- SQLite, not Postgres — no stored procedures / rich extensions, but we don't need them.
- *Verdict:* D1 is the right system-of-record for ModuForge on Workers. (Don't add Supabase
  here just for parity with the other apps.)

**Approach (phased, non-breaking):**
1. **Dual-write:** mirror every prospect/customer write to a D1 schema alongside Notion
   (`prospects`, `change_requests`, `module_change_log`, `ops_audit`, …). Notion stays
   authoritative; D1 shadows it.
2. **Switch reads to D1** (D1 becomes source-of-truth); Notion becomes a mirror. Repoint the
   ops worker (`notion-prospects.ts`, `notion-ops.ts`) + `/admin` reads.
3. **Retire Notion writes**; keep Notion as an optional export/admin-view, or drop it entirely
   in favour of the `/admin` control centre (already the real admin UI).

**Not a gate for 0.1–0.5 or Phase A** — it's an independent infra track Ben wants in parallel.

**DoD:** dual-write verified (a write lands in both, identical) · reads served from D1 with
Notion mirror in sync · a Notion outage no longer blocks the system (the resilience win) ·
documented cutover so Notion can be switched off.

---

## 0.7 — Customer-site change safety (preview-all + template canary) — 🔴 Not started

**Objective:** extend the "never push untested to live" discipline to **customer
sites**, not just the marketing site.

**Today:**
- ✅ **Per-customer content changes** (monthly change requests) already preview →
  customer-approve → promote (`customer-site-build` → `customer-site-promote`,
  `/account/[token]/approve-change/[crId]`). Gated.
- ⚠️ **Platform-wide template changes** (perf fixes, framework/dep updates, new
  features in `customer-site-template/`) have **no staging/canary** — a bad change
  reaches every site on its next rebuild. **Biggest gap.**
- ⚠️ **Operator one-off fixes** to a single live site *can* use preview→promote but
  it isn't enforced.

**Remaining:**
- **Template canary rollout:** deploy `customer-site-template` changes to a
  **canary customer site** (a dedicated test site, or the first opted-in client)
  first → automated smoke checks (builds, key pages 200, Core Web Vitals not
  regressed) → only then roll out to the rest (batched, with a kill-switch/rollback).
- **Preview-before-live for all customer-site changes**, operator-initiated ones
  included — never a direct push to a live customer domain.
- **Per-site smoke check** wired into the build callback (HTTP 200 + basic render)
  before a promote completes; failure → escalate, don't promote.

**DoD:** a deliberately-broken template change is caught on the canary and never
reaches other live sites · every customer-site change (content or platform) passes
through preview/approval or an automated smoke gate before promote.

**Policy decision (Ben, 2026-06): the customer's preview-approval is the SOLE human
gate for customer-site content changes — Ben is removed from the change→live path.**
- *Already true for clean changes:* customer Approve → auto-dispatches
  `customer-site-promote` → live in ~2 min; Ben gets an FYI email only, no action
  (`/account/[token]/approve-change/[crId]`).
- *To change:* (a) **stop routing escalated change requests to Ben for approval**
  where the customer's preview approval already covers the risk — let more changes
  build a preview the customer approves (keep escalation ONLY for genuinely unsafe /
  out-of-scope / irreversible cases); (b) **trim operator FYI emails** on the promote
  path to true exceptions (failures), not every successful promote.
- *Guardrail kept:* this is content on the customer's own site, customer-approved —
  low risk. Irreversible/billing actions still guarded. Build/test on **staging**
  (needs staging Notion secret) before prod, per 0.1.

---

## 0.8 — Automated dependency & template-update pipeline — 🔴 Not started

**Objective:** keep both codebases — the **marketing site** and the shared
**`customer-site-template`** — up to date, compatible and always working, with
updates flowing **staging → preflight → auto-deploy to prod when all green**, no
manual step for routine updates. (This is the "auto-promote on green" the routine
updates earned; feature/visual changes still keep a human glance — see 4.1.)

**Update sources:**
- **Dependabot / Renovate** PRs (npm) for both code areas — security patches +
  minor/patch bumps, grouped. Ties to the existing dependency-freshness cadence.
- **Framework/runtime tracking:** Next.js, `@opennextjs/cloudflare`, `wrangler`,
  React — latest stable watched; **majors flagged for human review**, not auto.

**Pipeline (per update PR, via GitHub Actions):**
1. **Preflight** — `tsc --noEmit` + `vitest run` + `npm audit` + `next build`
   (+ the T.1 E2E harness once it lands). Red → stop; never proceeds.
2. **Auto-deploy to staging** (`deploy:staging`).
3. **Automated smoke on staging** — key pages return 200, critical journeys pass,
   **Core Web Vitals not regressed** (Lighthouse budget), no new console/Sentry errors.
4. **All green → auto-merge to `main` → auto-deploy to production.** Zero human
   action for routine patch/minor/dep updates.
5. **`customer-site-template` updates additionally run the 0.7 canary** — deploy to
   a canary customer site → smoke → **batched fleet rollout with kill-switch/rollback**.
   Never blast the fleet on green-staging alone.

**Safety:**
- **Major-version bumps excluded from auto-merge** — they open a review PR + manual
  staging soak.
- **Rollback:** every auto-deploy is a discrete commit; failed post-deploy smoke →
  auto-revert + alert. Cloudflare retains prior Worker versions for instant rollback.
- **Cadence:** weekly dependency run + monthly framework check (`health check`).

**DoD:** a patch/minor dep PR flows green-staging → auto-prod with zero human action ·
a deliberately-breaking bump is caught at preflight or smoke and never deploys ·
a template update is canary-gated before fleet · majors require review · a failed
prod smoke auto-rolls-back.

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

# PHASE A — Autonomy Completion

*The dedicated track to "rock-solid + hands-off." Closes the remaining human touchpoints and
makes the system self-healing. Builds on Phase 0 (esp. 0.5 resilience) + the safety nets
(0.1 staging, 0.4 preflight, T.1 E2E) — those must exist first so we can harden live
automation safely. This phase is the spine of the automation goal; revenue (Phase 1+) can
proceed in parallel once Stripe is toggled live.*

**Two-stage automation target (Ben's decision A):**
- **First ~20 clients:** "10-minute approval-queue" mode — the machine runs everything;
  irreversible/ambiguous actions park in the queue for a one-tap approve. (Matches the golden
  rule.)
- **Beyond 20:** "zero daily involvement" — graduated tasks run unattended (4.1), Ben checks
  in weekly; **only genuinely irreversible OR low-confidence actions ever escalate.** Measured
  by the 4.2 removability metric trending to near-zero.

## A.1 — Phase 2 qualification auto-reply — 🔴 Not started · **biggest single win**

**Objective:** Eliminate the largest manual surface — Ben hand-drafting replies for ~40% of
qualifications (the non-accept outcomes). Referenced in code as the deferred "C6" templates.

**Today:** `accept` path is fully automated (password + intake link emailed). `soft_reject`,
`flag_for_review`, `clarification_needed` route to Ben's drafts inbox for manual reply
(`src/app/api/qualify/route.ts`).

**Remaining:** templated, context-aware responses for each non-accept outcome (soft-reject
with reason, clarification request naming the missing/contradictory field, flag→hold message);
Haiku-personalised within guardrails; **draft-and-approve in the queue for the first 20**, then
graduate to auto-send per 4.1. Clarification replies should round-trip (customer answers →
re-runs the compatibility engine) without Ben.

**DoD:** every non-accept outcome produces a ready reply · approve-to-send in queue (first
cohort) · a clarification reply round-trips and re-qualifies with no human · graduation-eligible
once accuracy proven.

## A.2 — Change-request escalation reduction — 🟡 Partial (engine exists)

**Objective:** Shrink the share of change requests that need Ben (currently multi-field /
ambiguous / <75% confidence / multi-item all escalate).

**Today:** Two-pass Haiku classifier auto-applies form-generated + single-field high-confidence
requests; everything else escalates (`src/ops-worker/steps/step6-change-requests.ts`).

**Remaining:** safely widen the autonomous envelope — handle multi-field requests when each
field is individually high-confidence; auto-split detected multi-item requests instead of
escalating the whole; per-class accuracy tracking feeding 4.1 graduation. **Confidence floor +
irreversible carve-out stay; widening is gated on measured accuracy, never assumed.**

**DoD:** multi-field high-confidence requests auto-apply · multi-item auto-splits · escalation
rate trended down · accuracy tracked per class (no silent quality regression).

## A.3 — Build-failure self-recovery — 🔴 Not started

**Objective:** Build failures recover themselves where safe, instead of waiting on Ben.

**Today:** Preview/go-live build failures notify Ben; recovery is manual via
`/api/admin/cowork-retry`. Dispatch has no retry (see 0.5).

**Remaining:** bounded auto-retry of failed builds (idempotent — safe to re-dispatch); classify
transient (timeout/5xx → retry) vs structural (bad input → escalate with the specific reason);
launch-day failures get priority handling. Go-live *send* stays guarded.

**DoD:** a transient build failure auto-retries to success on staging · a structural failure
escalates with an actionable reason · launch-day path proven.

## A.4 — Self-healing watchdog / state reconciler — 🔴 Not started · **answers "no failure points"**

**Objective:** A continuous control-loop that compares the system's **desired state
(invariants)** to **actual state**, auto-remediates safe drift, and escalates the rest — so
nothing stays broken or stuck, and nothing fails silently. This is the system-level complement
to per-action hardening (0.5).

**Concept (control-systems reconciler, à la Kubernetes):** a watchdog cron asserts invariants
every run and drives toward desired state. Candidate invariants:
- every cron ran within its window (heartbeat) — else alert;
- no prospect parked in a transient state beyond its cooldown (e.g. "preview submitted",
  "onboarding step N") — else auto-retry the step or escalate;
- every `Live` site responds HTTP 200 — else alert/escalate;
- every `Paid`/`Live` customer has a Stripe subscription (no paid-without-sub drift);
- every escalation produced an alert that wasn't dedup-suppressed into silence;
- no change request stuck "in-progress" past a threshold.

**Remediation policy:** idempotent/reversible drift → **auto-fix** (re-run step, re-dispatch
build, re-send email). Irreversible or ambiguous → **escalate only, never auto-execute**
(golden rule). Every check + action → audit log + Sentry. Builds on the "stuck-record sweep"
seeded in 0.5.

**Honest scope:** this does **not** promise zero failures — external deps and the classifier
will still fault. It promises **no silent failures, no permanent stuck states, automatic
recovery from transient faults, safe escalation of the rest**, with the T.4 learning loop
turning every new failure class into a permanent assertion so it can't silently recur.

**DoD (deliberate-break tests):** park a test record in a transient state past cooldown →
watchdog auto-retries then escalates · stop a cron → heartbeat alerts · break a Live site →
flagged · create a paid-without-subscription drift → detected · every watchdog action appears
in audit log + Sentry.

---

# PHASE 1 — Fast Revenue Wins

> **Revenue gate (from `docs/ROADMAP.md` #1): Stripe LIVE-mode — 🔴 Not started, ~1.5–2h.**
> Sandbox is 100% wired. Live needs: create live products/prices, add `STRIPE_MODE` env
> flag (a `TODO(go-live)` already sits in `stripe-products.ts`), register the live webhook,
> set `sk_live_*`/`pk_live_*`/`whsec_*` secrets, deploy, smoke-test. **It's a late toggle, not
> an early blocker (Ben's decision C):** do the automation hardening (Track 1) first, then flip
> this when ready to take money. Phase 1 mechanics below can be built against sandbox meanwhile.

## 1.1 — Prepay annual discount — 🔴 Not started

**Today:** Only monthly Stripe prices exist (`stripe-products.ts`). No annual SKUs, no
billing-term field.

**Pricing rule — "pay 10, get 12", billed upfront (Ben confirmed):** annual = **10× the
then-current monthly, charged in full at purchase** (2 months free for paying a year upfront).
Worked at target pricing: Standard £45/mo → **£450/yr upfront** (save £90); Premium £149/mo →
**£1,490/yr upfront** (save £298); each module annual = 10× its monthly. **Setup fee is one-off
and unchanged regardless of term** (charged once at checkout). The annual discount is the trade
for the upfront cash; **no mid-term refund** — aligns with the existing 30-day-notice
cancellation policy (reference Terms).

**Remaining:** annual Stripe Prices (`interval: year`) for base + each module; monthly/annual
toggle on pricing + payment flow showing the saving; same deterministic guards; webhook sets
Notion `Billing Term` + `Renewal Date`.

**Automation:** standard Stripe annual subscriptions — fully autonomous once built. The
**day-60 annual upsell** to engaged monthly clients is Haiku-drafted → approval queue (first 20)
→ graduate to auto-send, gated by the health score (2.3) so only happy customers get the ask.

**DoD:** annual prices purchasable on staging + guarded · Notion records term + renewal ·
Terms page reflects annual terms (no mid-term refund) · day-60 offer fires for engaged-only.

## 1.2 — Referral engine — 🔴 Not started

**Reward model (Ben's decision):** **account credit / discount, managed by Stripe** — not cash,
not a free-month SKU. Stripe is the engine:
- **Referrer (existing customer)** → **£50 account credit** via Stripe **customer credit balance**
  (auto-applied to their next invoice). *Proposed £50 ≈ ~1 month of Standard; Ben to confirm.*
- **Referee (new customer)** → **£50 off setup** via a Stripe **coupon / promotion code** entered
  at checkout. *(Alternative: "first month free" — Ben to pick.)*

**Remaining:** unique referral code per client on activation; redemption path that applies the
Stripe coupon (referee) and queues the Stripe balance credit (referrer); Notion "Referrals" DB
(referrer, code, referee, status sent/redeemed/rewarded, value).

**Automation:** code generation + redemption validation are deterministic/autonomous. **Credit
issuance is money movement → deterministically guarded + approved for the first 20**, then
graduate. The **"ask at a win" trigger** (post-review / enquiry-spike / 30-day check-in) is
Haiku-drafted → approval queue → graduate to auto-send. Stripe does the actual crediting/
discounting, so there's no manual accounting.

**DoD:** every active client has a code · test referral flows issue → redeem (Stripe coupon
applied) → referrer credit queued + approved → recorded in Notion · "ask at a win" lands in
the queue (first cohort).

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

**Automation lens (applies to all of Phase 3):** every retention/expansion motion is
**event- or cron-triggered**, its content/decision is **Haiku-drafted**, and it routes through
the **approval queue (draft-and-approve) for the first ~20 clients → then graduates to
auto-send** per 4.1. **Sends are rate-limited/capped; any charge or re-activation stays
deterministically guarded + approved, always** (golden rule). These reuse infrastructure that
already exists: the cron loop, Haiku, the monthly-digest renderer, the approval queue, Stripe,
and the analytics/reviews D1 data — so Phase 3 is mostly *composition*, not new plumbing.

## 3.1 — Premium "Done-For-You" tier — 🔴 Not started
**Target £149/mo, £799 setup** (floor £99/£549 — see Pricing table). Priced + framed as a
**service layer**, sitting clearly above the all-modules loaded Standard (~£86/mo). List it as
a visible anchor from launch even before fulfilment is built.

**Design principle — Premium is automation-composed, not Ben's labour.** The customer perceives
"done-for-you"; the system delivers it. This makes Premium *more* automated than Standard and
near-pure margin — consistent with the founder-removability goal, not in tension with it. Each
inclusion maps to existing or planned automation:

| Inclusion | Delivery | Reuses |
|---|---|---|
| Managed hosting/domain on their behalf | ✅ automated | Onboarding steps 1–2 (zone/DNS/Worker); "managed" = ModuForge holds it, with transfer-on-exit |
| Premium templates | ✅ entitlement flag | template variant unlocked by `Tier` |
| Higher change allowance (10+) | ✅ automated | existing Cowork change-request pipeline; allowance = a number in the entitlement |
| Priority SLA | ✅ automated | premium items jump the approval/processing queue (ordering, not labour) |
| Written-for-them newsletter | ⚠️ AI-drafted | Haiku draft (Cowork content engine, backlog #20) → **draft-and-approve for first 20, then graduate** (4.1) |
| Monthly review campaigns | ✅ automated | the 3.2 review-collection module on a schedule |

The **only genuine-judgment piece is content** (newsletter copy, campaign messaging) — it stays
in the 10-min approval queue until graduated. Everything else is config + existing pipelines.

**Mechanism — billing vs entitlement, kept in sync:**
- **Stripe product** (*what they pay*): a new Stripe Product + recurring Price (£149/mo), like
  the existing `Site + hosting (Standard)` £29 product; setup charged inline. Subscribing puts
  them on the Premium price instead of the Standard base.
- **Notion `Tier` field** (*what they get*): a new record property `Founding | Standard | Premium`
  that the ops code reads everywhere to unlock entitlements. **Today there is NO `Tier` field —
  only a `foundingMember` boolean (`fees.ts` / prospect record).** Adding `Tier` + wiring the
  entitlement checks through the ops code is the real build here, beyond creating the price.
- **Sync:** `checkout.session.completed` webhook sets `Tier = Premium` → all downstream
  entitlement checks read it, so billing and features never drift.

**Domain acquisition "on their behalf" (Ben's validate question) — recommended pricing model:**
Domain cost varies hugely (a standard `.co.uk`/`.com` is ~£8–15/yr; an aftermarket/already-owned
domain can be £100s–£1,000s). So **don't bundle an open-ended cost into a flat price.** Instead:
- **Premium includes registration + annual renewal of a *standard available* domain** (bounded —
  treat ~£20/yr of domain cost as included; £149/mo easily absorbs it).
- **Premium/aftermarket domains are pass-through at cost + a one-off handling fee** (e.g. £25),
  quoted case-by-case — never absorbed into the flat fee.
- **Register under the customer's ownership** (or transfer-on-exit) so the "you own everything"
  promise holds — managed ≠ hostage.
- **On Standard:** offer it as an **optional paid add-on** ("Domain setup" — one-off handling +
  pass-through registration), *not* bundled. Keeps "managed domain + renewals included" as a
  genuine **Premium differentiator** while still serving Standard customers who have no domain.
  Default Standard flow stays "you bring/own your domain" (current onboarding).

**Transfer-on-exit path** so "you own everything" survives even though hosting/domain are managed.

**DoD:** Premium purchasable (test) → sets `Tier = Premium` → entitlements unlock (templates,
allowance, priority, auto-newsletter draft); content stays draft-and-approve (first cohort);
transfer-on-exit documented + doesn't break ownership.

## 3.2 — Retention features (reviews · loyalty · lists) — 🟡 Partial

- **Review collection automation** (ROADMAP #9) — **Proposed £8/mo, £25 setup.** 🔴
  - *Trigger:* a "job complete" signal. **Design point:** ModuForge has no job-tracking today,
    so the trigger source must be wired — either a Cal.com booking whose appointment time has
    passed, or a one-tap "job done" in the customer's dashboard. (Pick one in the build.)
  - *Automation:* on trigger → scheduled SMS/email to the end-customer with a one-tap Google
    review link → response tracked in D1 → surfaced in the digest. Reuses notify + cron.
  - *Guards:* **sends rate-limited + deduped + capped** (SMS costs money, Twilio); per-customer
    frequency cap so we never spam. Draft-and-approve first cohort → graduate.
  - Live-reviews *display* already exists; this adds *collection*.
- **Loyalty platform** (wallet-pass, no app) — **Proposed £39/mo, £149 setup** (Ben: £12 was
  far too low). Priced as a **flagship retention module**, not a commodity: it's bespoke-built,
  drives high switching cost (the tradesperson's customers carry the card in their wallet), and
  sits above standalone comps (Loopy £25/mo, Stamp Me £49/mo) because it's done-for-you and
  integrated into their site. Floor ~£29/mo; could push £49/mo. **Decision: build our own.**
  Research findings (2026-06-03):
  - **Tech reality:** Apple Wallet = signed `.pkpass` files (needs Apple Developer acct + Pass
    Type ID cert + APNs to push updates). Google Wallet = cloud Wallet Objects API (Class
    template + per-member Object; patch the Object to update points across all passes). The
    painful part to DIY is Apple's cert/APNs plumbing.
  - **Third-party economics for *resale* (the key test):** per-**location** subscription tools
    DON'T fit — Loopy Loyalty ~$25/mo/location, Stamp Me from $49/mo would exceed our £12/mo
    module margin. Per-**pass** API tools DO fit and are very cheap — PassKit ≈ **<5¢ per
    membership card per year**, PassNinja API-first (signs with its own cert, so no Apple Dev
    acct needed). A tradesperson with 200 loyalty customers ≈ $10/yr cost vs £144/yr revenue.
  - **Recommended architecture (hybrid — "our platform" without reinventing wallet plumbing):**
    1. **Own system-of-record in our existing Cloudflare D1** — `loyalty_cards` (id, business
       token, end-customer ref, points/stamps, tier, timestamps) + `loyalty_events` (scans).
       We own the data, points rules, dashboard, branding.
    2. **Use a per-pass API provider (PassKit / PassNinja) for the wallet layer** to start —
       they handle Apple cert + APNs + Google API. Cheap per-pass economics fit resale and get
       Apple+Google Wallet working in days, not weeks.
    3. **Build the wallet plumbing in-house later** only if volume makes the per-pass fee worth
       removing (the `.pkpass` signing + APNs + Google Objects API is the ~3–4 wk piece).
    4. **Email/SMS QR-code fallback** (zero wallet dependency) as the MVP if we want to validate
       demand before any provider commitment — loses the "in-wallet" stickiness but proves it.
  - *Automation:* enrol + stamp/points updates via QR scan or the tradesperson's dashboard →
    write to D1 → patch the wallet pass (provider API). Self-running; no per-event human.
  - *Net recommendation:* **hybrid (own D1 + per-pass provider) first**, email-QR as the cheap
    validation MVP, full bespoke wallet plumbing only at scale. Don't pay per-location tools.
- **Newsletter list-building as retention** — 🟡 mostly there.
  - *Automation:* the monthly-digest cron already runs; just add a "you've built a list of N
    customers with me" stat to the template. Pure data→template, fully autonomous, no approval.

## 3.3 — Upsell / expansion triggers — 🔴 Not started
*Trigger (cron, autonomous):* expansion signals from analytics + health data — high enquiry
volume → suggest Booking; consistently busy → suggest Premium; many repeat customers → suggest
Loyalty. *Automation:* Haiku drafts a **signal-tied** nudge ("you had 23 enquiries last month —
Booking would save the phone tag") → approval queue (first 20) → graduate to auto-send. The
upsell *purchase* runs through Stripe (guarded). Track offers + conversion **by trigger type**
→ feeds NRR in the control centre.

## 3.4 — Win-back sequences — 🔴 Not started
*Trigger:* the existing `customer.subscription.deleted` webhook already flips status to
Cancelled — hook a cron off that to schedule touches at ~30/60/90d. *Automation:* Haiku-drafted
win-back messages (better offer / "what's changed" / final incentive) → approval queue (first
cohort) → graduate. **Re-activation is a billing action → deterministically guarded + approved,
always** (never auto-charged). Track win-back conversion.

## 3.5 — Annual "value delivered" review — 🔴 Not started
*Trigger (cron):* renewal/anniversary date. *Automation:* auto-compile a year of value
(enquiries, bookings, reviews collected, list growth, uptime) from the analytics/reviews D1 +
prospect data, **reusing the monthly-digest renderer**, into a clean summary → send. Timed to
renewal so it pairs with the annual-prepay offer (1.1) and prompts re-commit/upsell.
Approval-gated for the first cohort → graduate to auto-send.

---

# PHASE 4 — Automation Maturity & Saleability

*Turns a job into a sellable engine. Where the £100k outcome is built.*

## 4.1 — Automation graduation framework — 🔴 Not started
Track per task: runs / correct / escalated / overridden. Graduation criteria (N consecutive
correct, zero overrides) → draft-and-approve becomes autonomous — **except irreversible
actions, which stay guarded+approved regardless.** Surface graduation status in control centre.
**This is the mechanism for the two-stage target:** first ~20 clients run in "10-min approval
queue" mode (nothing graduated); after the cohort proves each task, graduate them so the system
moves to "zero daily involvement." Graduation is also gated behind T.5's three clean runs.

## 4.2 — Founder-removability metric — 🔴 Not started
From the audit log, compute % of consequential 30-day actions that required *Ben specifically*
vs system/non-founder-with-runbook. Trend it down — **the single number that says whether the
"zero daily involvement" target is met** and the headline a buyer underwrites.

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

# Sequencing — two parallel tracks

The work splits into two tracks that share the Phase 0 safety nets. **The automation track is
primary** (Ben's goal). The revenue/saleability track can run in parallel once the system is
hardened; **Stripe going live is a late toggle, not an early gate** (Ben's decision C — it's
literally swapping `STRIPE_MODE` + secrets).

### Track 1 — Automation (rock-solid + hands-off) — PRIMARY

1. **0.1 Staging** (Workers, not Pages) — can't safely harden live automation without it. **Start here.**
2. **0.4 `preflight` + 0.2 `IRREVERSIBLE_ACTIONS.md`** + verify **0.3 audit coverage** — small;
   mostly formalising what exists.
3. **T.1 synthetic E2E harness** — proves the journey + becomes the regression net for hardening.
4. **0.5 Resilience & silent-failure elimination** — retries, kill silent failures, classifier
   retry-before-escalate, recurring-exception re-alert. *The "rock-solid" core.*
5. **A.4 Self-healing watchdog / reconciler** — system-level "no stuck states, no silent
   failures" loop (builds on 0.5).
6. **A.1 Phase 2 qualification auto-reply** — closes the biggest manual surface (~40% of quals).
7. **A.2 escalation reduction + A.3 build-failure self-recovery** — shrink the rest.
8. **2.5 Cost monitoring** — guardrail before anything graduates to unattended.
9. **4.1 Graduation framework + 4.2 removability metric** — locks in the two-stage target
   (10-min queue for first 20 → zero daily after), measures "requires-Ben" → near zero.
10. **4.3 Runbook + 4.4 whole-business export** — saleability capstone.

### Track 2 — Revenue & saleability (parallel, after hardening)

A. **Stripe LIVE** (ROADMAP #1, ~2h toggle) — flip when ready to take money.
B. **1.1 Prepay + 1.2 Referrals + finish 1.3 Dunning** — fast compounding revenue.
C. **T.2 instrumentation + T.3 feedback + T.4 triage** — live *before* first real client.
D. **2.3 health score + 2.4 first-value + 2.6 segmentation (source)** — churn intelligence.
E. **T.5 guided first-cohort pilot** — first three real clients, every net on (gates autonomy
   graduation in 4.1).
F. **3.1 Premium + 3.2 Retention → 3.3 Upsell + 3.4 Win-back + 3.5 Annual review** — moat/NRR.

*(2.1 control centre + 2.2 approval queue are already done and feed both tracks.)*

> **Convergence point:** T.5 (first-cohort pilot) is where the tracks meet — you need real
> clients (Track 2) to *prove* the automation (Track 1) before graduating tasks to unattended.
> Hence: harden first, go live, run the watched pilot, then graduate.

---

# PHASE M — Marketing site design & animation

*Make modu-forge.co.uk feel premium and alive. Reuses a shared motion
language (brand-outlined puzzle pieces, scatter→assemble, aurora). All
reduced-motion safe; each feature ships as its own revertible commit.*

**✅ Shipped (live, 2026-06):**
- Scroll-driven puzzle-assembly section on the homepage (assemble down /
  reverse up).
- Self-building site hero — scroll-driven (frame fills as you scroll,
  reverses up) + drifting brand aurora background.
- 3D coverflow template carousel (single card on mobile, coverflow on
  desktop).
- Public pricing display refreshed to target prices; Premium "coming
  soon" anchor card.
- Mobile pass on hero / aurora / carousel.

**🟡 Built on STAGING — awaiting Ben's visual sign-off, 2026-06-29:**
Deployed to `pandemonium-software-website-staging.benpandher.workers.dev`
(staging D1 + R2, no prod data). Both pages 200; SSR markers verified. The
motion needs a real browser/device check before promoting to `main`.
- **Hero opener (#1) — built.** `HeroOpener.tsx`: the homepage h1 assembles
  from scattered brand fragments on load (easeOutBack overshoot snap,
  staggered L→R) over the aurora, with a subtle scroll parallax. Full text
  stays in the real `<h1>` (SEO + a11y); reduced-motion → instant.
- **Pricing puzzle — built.** `PricingPuzzle.tsx` replaces the linear
  calculator: tier frames (Founding / Standard / Premium-coming-soon),
  module pieces that snap in with a mini "your site" preview popping the
  matching block in/out, live totals via `calculateFees()` (fees.ts =
  source of truth). Mobile: name + price + (i) bottom-sheet, sticky total
  bar + CTA. Founding bundles the 4 content modules (locked "Included");
  GBP + multi-location stay optional on every tier.
  - *Cleanup pending sign-off:* `PricingCalculator.tsx` left in place as a
    fallback — remove once the puzzle is promoted.

**Sign-off checklist (Ben, on device + desktop):** hero assembly reads as
"snap into place" not jitter; pricing pieces snap + preview pops smoothly;
mobile bottom-sheet + sticky bar usable; totals match expectations across
all three tiers. Green → PR `staging` → `main` → `npm run deploy`.

**Why staging-first:** the earlier Phase-M work shipped blind (no preview)
and mobile issues were caught only in production. 0.1 now gives the preview
loop — these two landed on staging first.

# Backlog carried from `docs/ROADMAP.md` (mapped into phases)

| ROADMAP # | Item | Maps to / status |
|---|---|---|
| 1 | Stripe LIVE | 🔴 Track 2 revenue gate — late ~2h toggle, after automation hardening |
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

**Resolved & confirmed 2026-06-03 (Ben):**
- Target tiers: **Standard £45/£399, Premium £149/£799** (modules nudged) — confirmed.
- **Founding raised to £199 setup / £15 mo** (was £99) — *code reconciliation pending:
  `fees.ts FOUNDING_MEMBER_SETUP_GBP` 99 → 199.*
- Apply target pricing to new sign-ups after 2–3 testimonials; founding cohort keeps current.
- Annual = **"pay 10, get 12", billed upfront**, no mid-term refund — confirmed.
- Referral = **£50 referrer account credit + £50 off referee setup**, Stripe-managed — confirmed.
- Module prices: review-automation **£8/£25**; **loyalty £39/£149** (was £12/£49 — raised as a
  flagship retention module) — confirmed.
- Review-collection trigger = **dashboard "job done" button** — confirmed.
- **Premium listed as a visible anchor now** (overrides ROADMAP "defer until 5–10 ask") — confirmed.
- Loyalty = **build our own platform** — confirmed. (Smart "build own" path still uses a per-pass
  provider for the wallet layer initially to skip Apple cert/APNs; full bespoke at scale.)
- **`fees.ts` founding setup 99 → 199 — DONE** (2026-06-03, test updated, 290 pass).
- **Stripe reprice (option A) — DONE in code + Stripe sandbox** (2026-06-03): new sandbox
  prices created (Standard £45 `price_1TnPMh…`, Premium £149 `price_1TnPN9…` new product
  `prod_UmzLIB…`, modules £8/£8/£12/£8/£5); `fees.ts` setups+monthlies bumped to target;
  `stripe-products.ts` repointed; 290 tests pass. **Not deployed** — public site still shows
  old prices until `npm run deploy`; live Stripe prices created at the Stripe-LIVE toggle.
- **Notion → D1 consolidation added as 0.6** (dual-write → switch → retire; D1 limits fine).

- **Public pricing GOING LIVE (Ben, 2026-06-03):** all user-facing price displays updated to
  target (pricing page copy/meta, calculator auto via fees.ts, Founding strip £199, terms,
  qualification form modules). **Premium shown as a "coming soon" anchor card** on /pricing
  (not buyable). Deploying now.
- **Premium = COMING SOON** — listed as anchor; £149 Stripe price exists but checkout/
  entitlements (Notion `Tier`) are workstream 3.1.
- **Domain acquisition pricing decided** — Premium includes standard reg+renewal (bounded
  ~£20/yr); aftermarket pass-through + £25 handling; register under customer ownership; Standard
  gets it as an optional add-on, not bundled (keeps Premium differentiated).

**Still open (not blockers):**
1. Loyalty: per-pass-provider-first "build own" vs fully-bespoke wallet from day one (~3–4 wk extra).
2. Premium checkout/entitlements build (3.1) when ready to actually sell it.

> **On the confidence worry:** you don't reach certainty in a lab — probabilistic automation
> can't. You prove the journey synthetically (T.1), instrument friction (T.2–T.3), run three
> forgiving clients as a watched pilot (T.5), and feed every issue into a loop that adds a
> permanent test (T.4). Confidence is earned through instrumented real use with the safety
> nets on — not by delaying launch until an unmeetable bar is met.
