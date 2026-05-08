# Pandemonium Software Ltd — Architecture & Operations PRD

> **Living document.** Captures the architectural decisions for ModuForge
> (the Pandemonium Software Ltd product). Updated as Stage 2 phases ship.

## 1. Product positioning

ModuForge is a flat-fee, modular website service for UK trades and small
businesses. The customer-facing brand is **ModuForge**; the legal entity
is **Pandemonium Software Ltd**.

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

The precise contract the Hub UI promises:

**A. Domain → DNS-ready (always)**
- Read `prospect.onboardingData.domain` and `domain.registrar`
- Branch on registrar:
  - `cloudflare` (domain is registered through Cloudflare Registrar):
    no nameserver work needed. Add the zone if it's not already
    visible in their account, then proceed straight to DNS records
  - `already-have` / `external` (domain is at a third-party
    registrar): `POST /zones` on the customer's Cloudflare account
    via my user-token. Read back the assigned `name_servers` (two
    strings, e.g. `aron.ns.cloudflare.com` + `nina.ns.cloudflare.com`).
    Email the customer with:
      * Both nameserver values
      * A per-registrar walkthrough rendered from a templates table
        keyed off domain heuristics (e.g. `.co.uk` + `123-reg`,
        `.com` + `godaddy`, etc.) — falls back to a generic guide
      * "Reply with screenshots if anything's confusing" CTA
    Then poll the zone's `status` field every 5 minutes until it
    flips to `active` (typically <2 hours; max 48). Email
    confirmation on activation.
- Once the zone is active: create the DNS records ModuForge Pages
  needs (CNAME for `www` → `pandemonium-software-website.pages.dev`,
  apex A or CNAME-flattening, `_redirect` if customising). Run a
  resolution check from a dummy DNS-over-HTTPS query before
  declaring done.

**B. Resend (only if Newsletter or Enquiry module bought)**
- Poll Resend Teams API for pending invitations addressed to
  `BEN_OPS_EMAIL` whose team owner matches `prospect.onboardingData.
  domain.resendSignupEmail`
- Accept the invitation
- `POST /domains` on the customer's Resend team with their domain →
  receive DKIM (3 CNAMEs), SPF (1 TXT) and Return-Path (1 CNAME)
- Apply each record to the customer's Cloudflare DNS via the
  Cloudflare API (using my Administrator role from Step 1)
- Poll Resend `GET /domains/{id}` every 60 seconds until
  `status: verified` (max 10 minutes)
- Generate a **sending-only** API key
  (`POST /api-keys` with `permission: "sending_access"`) — narrower
  scope than admin so a future leak can't, e.g., add new domains
- Store the API key in `prospect.onboardingData.domain.resendApiKey`,
  AES-GCM encrypted at rest using `RESEND_KEY_ENCRYPTION_KEY` Worker
  secret
- Revoke human team membership (leave the team) — only the sending
  API key remains
- Email customer: "your sender domain `news@yourbusiness.co.uk` is
  live; here's a test send"

**Failure modes:**
- Customer hasn't pointed nameservers within 5 days → Cowork sends a
  reminder email; after 10 days, escalates to Tier 2 for Ben
- Resend domain verification fails after 1 hour of polling →
  Tier 2 (DNS records may have been mis-applied; Cowork checks +
  retries; if still failing, Ben investigates)
- Customer's Resend invitation never arrives in `BEN_OPS_EMAIL` → 
  Tier 2 (almost always means they typo'd `resendSignupEmail` or
  haven't actually invited yet; Cowork emails customer to confirm)

#### Step 3 (Tools — H3 scope)
- Booking module: capture `calcomBookingUrl` (validated as a Cal.com
  URL); store; the build step embeds it into the customer's site
- GBP addon: capture `gbpUrl`; store; build step embeds the link.
  Audit/update of the GBP listing itself is done by Ben in batch (or
  via browser fallback later)

#### Step 4 (Brand assets — H4 scope)
- Customer uploads logo + photos directly to a Cloudflare R2 bucket
  via `/api/onboarding/upload`. See §6.9 for the full contract.
- Cowork Ops normalises: resize, optimise, convert to WebP, store
  derivatives
- Updates Notion with R2 keys for the build step

#### Step 5 (Review & launch — H5 scope)

The final pre-launch step. Three sub-sections in the Hub:

  **A. Preview your site.** Iframe + open-in-new-tab link when
  Cowork has set `data.review.previewUrl` on the prospect. While
  unset, a "preview being built" placeholder card explains the
  ~5-working-day timing. (Stage 2C C5 sets this URL; for Stage 2B
  the operator can set it manually via Notion.)

  **B. Request edits — capped at MAX_REVIEW_EDITS = 3.** This is
  the scope-creep guardrail. Each submission counts as one round;
  multiple small fixes batched into one edit count as one round.
  Out-of-scope requests (new pages / new sections / new features /
  full redesigns) are quoted separately under Terms §10. The Hub
  UI shows two side-by-side panels:
    - In scope: photo swap, copy tweak, phone/address/hours, price
      update, testimonial swap, colour/font tweak
    - Out of scope: new page, new section, new feature, layout
      change, bulk rewrite (>~10% of copy)
  Plus a "How to structure your feedback" template (where, what,
  why) with a side-by-side good-vs-vague example.

  Submission flow:
    1. Customer types into the textarea (min 20 chars enforced
       both client + server)
    2. POST `/api/onboarding/review-edit { token, message }`
    3. Server validates token + status + count < 3, generates a
       UUID-keyed `ReviewEdit` ({ id, submittedAt, message,
       status: "submitted" }), appends to `data.review.edits`,
       writes back to Notion, emails Ben with scope-check guidance
    4. Returns `{ success, edit, remaining }` to the client
    5. Client appends to local state; counter ticks down
  Server-side cap is the source of truth: any 4th submission gets
  a 400 with the "used all 3" error message regardless of what the
  client sent.

  **C. Go-live date + final sign-off.** HTML date picker (min:
  today). Sign-off checkbox. Both required to mark step done.

  Marking the step done flips the prospect's Status to
  **Onboarding Complete** and stamps `Onboarding Completed At`.
  This is Cowork Ops' trigger to begin the build pipeline (Stage
  2C C5).

**Stage 2C C5 Cowork pipeline (what runs after Onboarding Complete):**
- Pull the prospect's full state (modules, captured config from
  Steps 1-3, brand assets from R2, edits queue from Step 5)
- Render a templated build using the per-customer Cloudflare
  account (parametrised `wrangler.jsonc`) and deploy a preview
  Worker
- Email customer with the preview URL; set `data.review.previewUrl`
  in Notion so the Hub renders the iframe
- Apply each `submitted` edit (operator approves before apply
  during the first-20-clients period; Cowork applies after that)
- On go-live date: production deploy + DNS swap; status flips to
  `Live`

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

### Stage 2D — Dashboards (PARTIALLY SHIPPED)

The customer-facing post-launch home and the operator drill-down.
Stage 2B wires the SCAFFOLD now; richer interactions land alongside
Stage 2C as Cowork's audit log and approval queue come online.

**D1 (shipped):** Customer dashboard `/account/[token]`, change
request form, `/admin/[token]` operator detail page, `/admin` link
to detail.

**D1.5 (shipped):** RAG traffic-light status pills (red / amber /
green / grey) on both dashboards; inline `ChangeRequestEditor` on
`/admin/[token]` for status updates with required reply on
resolved/rejected; PATCH `/api/admin/change-request` endpoint
(Basic Auth gated); customer email on first transition into a
terminal state with the operator's reply verbatim.

**D2 (TODO):** Inline Notion field editing for the rest of the
operator detail page (notes, fees, modules — currently read-only).
Customer-side: cancel-with-notice flow that triggers §6.5
cancellation handover.

**D3 (TODO, depends on Stage 2C):** Audit-log feed on
`/admin/[token]` with the last 30 Cowork actions. Approval queue
banner on `/admin` showing Cowork drafts awaiting Ben's review.
Bulk actions ("apply security patch to all").

### Stage 3 (LATER)
Full GBP API integration, custom domain `moduforge.co.uk`,
Plausible analytics, real photography, real testimonials, paid
Cal.com Platform if scale justifies it.

## 6. Post-launch operations (Stage 2C and ongoing)

This is the part that justifies the monthly fee. Once a customer's
site goes live, Cowork Ops takes over a recurring set of duties so
Ben never has to think about an individual customer's site unless
something is escalated. Each duty below is documented as a contract:
**trigger → inputs → steps → outputs → failure mode**.

The collective output of all these duties is what the customer pays
£19/month (or £15/month for Founding Members) for: continuous
maintenance, bundled time-based services and peace of mind. None of
them require Ben to log into a customer dashboard.

### 6.1 Recurring health checks (cron-driven)

| Frequency | Check | Action on red |
|---|---|---|
| Every 5 minutes | Site uptime ping (HTTP 200 from `/`) | Tier 3 incident (page Ben) after 3 consecutive failures |
| Daily | DNS resolution for the site's domain (A / CNAME records still pointing at Cloudflare Pages) | Tier 2 (auto-fix attempt; escalate if blocked) |
| Daily | Resend sender-domain status (still verified) | Tier 2 (re-add records via Cloudflare API) |
| Daily | Cal.com booking URL liveness (HTTP 200) | Tier 1 (log only); Tier 2 if down 3 days |
| Daily | Cloudflare Pages latest build status | Tier 2 if last build failed |
| Daily | Stripe subscription status | See §7.7 |
| Weekly | `npm audit --audit-level=high` against the customer's checked-out site repo | Tier 2 (Cowork applies patch + redeploys; flags major-version bumps for Ben review) |
| Weekly | Lighthouse / Web Vitals snapshot, stored in Notion `Asset Collection` DB | Used for monthly report; no immediate action |
| Monthly | Generate and send the customer's performance report | See §7.3 |

**Trigger:** Cloudflare Cron Trigger on the Cowork Ops Worker
(`* * * * *`, with cadence-aware dispatch inside).
**Inputs:** Notion Clients DB (one row per live customer, with their
configuration as JSON).
**Outputs:** Audit log entries, Notion field updates, customer / Ben
notifications.
**Failure mode:** retry with exponential backoff; tier 3 escalation
on persistent failure; never silently swallow.

### 6.2 Customer change-request flow (the 30-min content allowance)

Every monthly subscription includes 30 minutes of content changes
covered. Bigger changes are quoted separately under §10 of the Terms.

```
Customer ─ email or /account/[token]/changes form ─► Cowork
                                                      │
            [classify: content / module / out-of-scope]
                                                      │
   ┌──────────────────────┬──────────────────────────────┐
   │                      │                              │
content (within budget)   module add/remove          out-of-scope
   │                      │                              │
Cowork drafts the          Cowork updates Notion +    Cowork drafts a
edit + a preview link     Stripe subscription;        quote against the
   │                       see §7.4                    Playbook §10
Ben approves               │                              │
   │                       Cowork drafts customer       Ben reviews +
Cowork applies             reply with new total         sends quote to
+ deploys + emails         + new Hub link if ops        customer
customer "your             needed
change is live"            │
                           Ben approves; Cowork sends
```

**Trigger:** inbound email to `pandamoniumsoftwareltd@gmail.com` (Gmail
push notification → webhook → Cowork) OR form submission at
`/account/[token]/changes` (future route).
**Inputs:** customer's request text, attachments (photos, files).
**Steps:**
1. **Classify** the request (Cowork prompt with the Playbook §10
   triage rules):
   - *Content* (text edit, photo swap, price/phone/address update,
     new testimonial)
   - *Module* (add or remove Booking / Enquiry / Newsletter /
     GBP addon)
   - *Out-of-scope* (new page, redesign, custom feature)
2. **For content:** check this month's allowance in Notion
   (`Content Minutes Used` number field on Clients DB). If under
   budget, draft the change as a git diff against their checked-out
   repo + a preview deploy link. If over budget, draft a "we'll need
   to extend or roll into next month — happy with that?" reply.
3. **For module:** see §7.4.
4. **For out-of-scope:** Cowork generates a fixed-price quote based
   on the Playbook scope-and-pricing matrix; Ben reviews and sends.
**Outputs:** preview deploy URL (for content changes); updated
Notion record (allowance consumed); customer email; audit log entry.
**Failure mode:** any classification confidence below threshold →
Tier 2 (Ben classifies manually).

### 6.3 Monthly performance report

**Trigger:** 1st of each month, 09:00 UK time, per customer.
**Inputs:** previous month's data from:
- Cloudflare Web Analytics (page views, top pages, country breakdown)
- Cloudflare uptime metrics
- Resend sending stats (newsletter opens, bounces, complaints) — if
  Newsletter module
- Cal.com booking volume — derived from the embed's webhook (or
  Cal.com booking-list API if the customer authorised it)
- GBP search-impressions (Stage 3 only; URL-only customers get a
  manual GBP audit summary instead)
- Stripe payment status (only mentioned if there's a problem)
**Steps:**
1. Pull metrics for the customer's date range
2. Cowork drafts a 1-page email in plain English with:
   - Three headline numbers (visits, enquiries, bookings)
   - One thing that improved
   - One thing to keep an eye on
   - Any actions Cowork took during the month (security patches,
     dependency updates) — completes the "you're being looked
     after" loop
3. Ben reviews and sends (during first-20-clients period)
4. After 20 clients: Cowork sends without review unless the
   classifier flags an anomaly worth Ben's eyes
**Outputs:** customer email; Notion archive of the report (PDF + raw
data); audit log.
**Failure mode:** missing data sources (e.g. Cloudflare Analytics
empty for new sites) → fall back to "your first month's full report
arrives next month" template.

### 6.4 Module add / remove lifecycle

**Add a module** (e.g. Newsletter, post-launch):
1. Customer requests via email or `/account/[token]/modules` (future)
2. Cowork validates: is the module compatible? (e.g. Newsletter
   requires a verified Resend domain — re-uses Step 2's flow if
   absent)
3. Cowork updates Notion (`Module Selections` multi-select, recalcs
   `Setup Fee Calculated` and `Monthly Fee Calculated`)
4. Cowork creates a Stripe subscription update (one-off charge for
   the module's £39 setup; recurring fee adjusted)
5. If new infrastructure needed (e.g. Newsletter requires sender
   domain — already done if existing): re-open the relevant Hub
   step, send link to customer
6. After provisioning: Cowork rebuilds the site with the module
   enabled, deploys, emails customer "your new module is live"
**Failure mode:** Stripe failure → Tier 2; provisioning failure →
Tier 2.

**Remove a module:**
1. Customer requests with 30 days' notice
2. Cowork acknowledges, schedules removal at the end of the notice
   period
3. At T-0: Cowork rebuilds without the module, removes related
   integrations (e.g. revoke Resend sending API key if Newsletter +
   Enquiry both removed), updates Stripe subscription pro-rated
4. Customer keeps the underlying account (Resend, Cal.com) — only
   the embed/integration is removed from their site

**Founding Member rate is locked for life:** never adjusted by
Cowork. Tracked via `Founding Member` checkbox in Notion.

### 6.5 Cancellation flow (mirroring Terms §6 of /terms)

**Trigger:** customer email or `/account/[token]/cancel` form.
**Steps:**
1. **Day 0:** Cowork acknowledges, sets `Cancellation Requested At`
   in Notion, drafts a "we got your notice, here's what happens
   next" email for Ben to send
2. **Day 1-28:** normal service continues; performance report sent
   if monthly cycle hits
3. **Day 28:** Cowork drafts the **handover package**:
   - Zip of the customer's site source (from their git repo)
   - GitHub repo transfer offer (we transfer ownership to their
     account if they want it)
   - Credential exit list — every account I was a member of, with
     "access revoked at HH:MM on DATE" timestamps
   - Plain-English exit summary (what runs where, what to watch out
     for) — Cowork generates from the Notion record + a small
     template
4. **Day 30:** Cowork actions the technical exits in this exact
   order so nothing breaks mid-flight:
   - Stripe subscription cancelled (final invoice already paid for
     final 30 days)
   - Cowork removes itself from customer's Cloudflare team
   - Cowork removes itself from customer's Resend team (sending
     API key revoked first to avoid orphaned sends)
   - Cowork removes itself from customer's GBP manager list (if
     applicable)
   - Final email: "you're all yours now, here's the handover bundle"
5. **Day 30+:** Notion record archived to a `Former Clients` view
   (retained 6 years per UK tax rules), `Status` flipped to
   `Cancelled`. Audit log retained.
**Failure mode:** any technical-exit step failing → Tier 3 (Ben
manually completes; never leave a customer half-disconnected).

### 6.6 Incident response

Three tiers, set by Cowork classifier:

- **Tier 1 (auto-resolvable):** transient errors, retried by Cowork.
  Logged to audit; no customer / Ben notification unless retries
  exhaust. Examples: Cloudflare API 429, transient DNS lookup fail.
- **Tier 2 (config-level fix):** Cowork drafts a fix → Ben approves
  → Cowork applies. Customer not notified unless the fix means a
  visible change. Examples: dependency-patch redeploy, DNS record
  drift, build-config tweak.
- **Tier 3 (genuinely broken):** site down or customer-impacting.
  Cowork pages Ben (push notification + email + Slack if connected)
  AND sends customer a holding email ("we know, we're on it,
  expected ETA HH:MM"). SLA per Terms §10: aim for response within
  working hours, fix within 48 hours.

Every incident writes to Notion `Exceptions` DB with:
- Customer relation
- Step / area
- Detection time, resolution time
- Detection mechanism (which check)
- Action taken
- Whether customer was notified
- Resolution notes

### 6.7 Stripe subscription monitoring

**Daily check:**
- Failed payments in the last 24 hours → Cowork emails customer (3
  retries over 7 days) → if final fail, services pause (site keeps
  serving but active maintenance stops); Ben notified
- Card expiry within 7 days → Cowork emails customer with a card
  update link
- Subscription tier mismatch with Notion → reconcile (Stripe is
  source of truth for billing; Notion for service config)

**On Stripe webhook events:**
- `invoice.payment_succeeded` → audit log
- `invoice.payment_failed` → trigger retry sequence
- `customer.subscription.deleted` → trigger cancellation flow §7.5
- `customer.subscription.updated` → reconcile against Notion

### 6.8 Editing a completed step (re-ops detection)

Customers can edit any Hub step at any time, even after they've
ticked it done — by design (corrections happen). The Hub doesn't
toggle the done-flag off when fields change; instead it shows an
**Update saved data** button that re-saves the patch with
`markDone: false`.

This is **safe in Stage 2B** because Cowork isn't running yet — an
edit is just a Notion field write. Stage 2C must add **change
detection** to know when an edit invalidates work Cowork already
did, and trigger a redo:

| Step | Field changes that need re-ops |
|---|---|
| 1 (Cloudflare) | `cloudflareEmail` change → invite goes to a new email; old invite cancelled |
| 2 (Domain) | `domain` change → DNS work redone on new domain; old zone retired; sender domain re-verified in Resend |
| 2 (Resend) | `resendSignupEmail` change → re-accept invitation under new email; previous Teams membership left |
| 3 (Cal.com) | `calcomBookingUrl` change → embed regenerated with new username/event slug; old embed cleared from build pipeline |
| 3 (GBP) | `gbpUrl` change → footer link updated; manager invitation accepted on new listing if different |
| 4 (Assets) | new asset uploads → resized derivatives regenerated; old assets garbage-collected after 90 days |
| 5 (Review) | `goLiveDate` change → reschedule production deploy; `changeRequests` change → Cowork re-classifies and re-drafts |

Implementation pattern (Stage 2C C1): each Cowork action stores a
hash of the inputs it consumed in the audit log. On the next cron
tick, if a done-step's slice hash differs from the latest audit
hash for that step, the step is re-queued for ops. Idempotency
(§7) means re-running a step is safe — actions check current state
of the target service before acting.

### 6.9 Asset management

**Storage:** Cloudflare R2 bucket `moduforge-customer-assets`,
single-region (ENAM), public dev URL enabled at
`https://pub-<account-hash>.r2.dev`. Free-tier limits (10 GB
storage, 1M class-A ops/month) cover roughly the first 1k
customers given the 10 MB/file × ~10 files/customer envelope.

**Object key pattern:** `assets/<token>/<kind>/<uuid>-<safe-filename>`
where `<kind>` is `logo` or `photo`. Token-prefixed keys are the
authorisation primitive — DELETE refuses any key that doesn't start
with `assets/<requester-token>/`, so customers can't reach into
each other's prefixes by guessing.

**Worker access:** R2 binding `ASSETS_BUCKET` declared in
`wrangler.jsonc`. Worker reads/writes via `getCloudflareContext()`
from `@opennextjs/cloudflare`. Public reads bypass the Worker —
thumbnails on the Hub render straight from `R2_PUBLIC_URL_BASE`.

**Upload flow (Hub Step 4 — shipped in 2B H4):**
1. Customer drops a file into the Step 4 component
2. Client POSTs multipart to `/api/onboarding/upload` with
   `{ token, kind, file }`
3. Route validates: token format, onboarding-unlocked status,
   content type ∈ {png, jpeg, webp, svg+xml}, size ≤ 10 MB,
   kind ∈ {logo, photo}, photos array < 20
4. Generates the key, puts the bytes via `ASSETS_BUCKET.put`
5. Reads current Onboarding Data, merges the new Asset record into
   the `assets` slice (logo replaces; photo appends)
6. Writes back to Notion's Onboarding Data field
7. For `kind=logo` replacement: best-effort `delete` of the previous
   logo's R2 object after Notion is updated (orphan-safe — failure
   is logged, not propagated)
8. Returns `{ success, asset, kind }`

**Delete flow:** customer clicks the X on a thumbnail → DELETE
`/api/onboarding/upload` with `{ token, key }` → server validates
key prefix, removes from R2 (return-on-fail before Notion write),
then patches Notion to clear the logo or filter the photos array.

**Cowork's downstream job (Stage 2C C4):**
- Pull each customer's assets blob from Notion
- Normalise (resize to standard widths, convert to WebP, generate
  responsive `srcset`s)
- Inject into the build pipeline as templated `<img>` tags + the
  appropriate `image-set()` CSS
- Old originals stay in R2 for 90 days post-replacement, then
  garbage-collected by a separate cron job

**Post-launch swap (future via `/account/[token]/assets`):**
- Customer uploads new photos via the same `/api/onboarding/upload`
  endpoint (status check covers post-Live customers too)
- Customer ticks "use these now" → Cowork rebuilds the site with
  fresh assets, deploys, emails customer

**Failure modes:**
- R2 binding missing in production → 503 with a clear "asset
  storage isn't configured yet" message
- File too big / wrong type → 4xx with the specific reason
- Notion write fails after R2 put succeeds → R2 object is
  best-effort deleted to avoid orphans (5xx returned to client)
- Image processing failure (Stage 2C) → Tier 2 incident via the
  ops escalation path

---

## 7. Operational guardrails

A few non-negotiables for Cowork, baked into prompts and code:

- **Never delete customer data without explicit Ben approval.** Even
  cancelled customer records sit in Notion for 6 years (UK tax law).
  R2 garbage-collection is the only auto-delete, and it has a 90-day
  buffer.
- **Never make myself a permanent member of a customer's account.**
  I'm Administrator on Cloudflare and team-member on Resend / GBP /
  Cal.com only while their subscription is active. Cancellation
  flow §7.5 is the only path that removes me — never any other
  way.
- **Every customer-facing email goes through draft-then-send during
  the first 20 clients.** After that, *acceptance, rejection,
  clarification and quote* emails stay human-reviewed forever; only
  status updates ("DNS verified", "preview ready", "report ready")
  send automatically.
- **Idempotency on everything.** Every Cowork action checks current
  state of the target service before acting. Re-running a step
  must be safe.
- **Audit log is append-only.** Notion `Cowork Audit` DB (TODO in
  Stage 2C C1) — every action, success or failure. Never edited or
  deleted.

## 8. Customer dashboard (`/account/[token]`)

The customer's post-launch home. Same UUID token they've had since
enquiry; same gate pattern as the Onboarding Hub. Read-mostly with
one interactive piece: the "Need a change?" inbox.

### 8.1 Access gate

Open from `Status: Paid` onwards (so customers can see their record
while still onboarding). Cancelled customers get a read-only view —
the change-request form is hidden and a banner explains the state.
Pre-payment statuses redirect to a friendly "your account isn't
active yet" message. Same UUID + regex check as every other token-
gated route in the app.

### 8.2 Surfaces

**Hero:** first name, business name, a coloured status badge
(`Live` / `Onboarding in progress` / `Build queued` / etc.) and (if
cancelled) a clear banner explaining what happened.

**Card 1 — Your site:**
- Domain (clickable link to `https://customer.domain` if Hub Step 2
  captured one; otherwise a "finish onboarding to add your domain"
  fallback)
- Live-status copy that adapts to `Status` (Live = "Live for X
  days"; Build Started = "I'll email you when the preview is
  ready"; Onboarding Complete = "Onboarding complete — your build
  is queued"; etc.)
- Target go-live date if set
- "Open your Onboarding Hub →" link (always visible while
  non-cancelled — even a Live customer might want to look back)

**Card 2 — Your subscription:**
- Setup fee (one-off) + Monthly fee (with Founding-member tag if
  applicable)
- Modules included (Base + each extra)
- "Want to add or remove a module? Email me" mailto with prefilled
  subject

**Card 3 — This month:**
- Content allowance: "X / 30 min used this month" (placeholder
  showing 0/30 in Stage 2D D1; populated from the Cowork audit log
  in D3)
- Note that the monthly performance report contains the detailed
  tracking

**Card 4 — Get in touch:**
- Mailto button to `pandamoniumsoftwareltd@gmail.com`
- Cancellation mailto with "Cancellation - {business}" subject
  (self-serve flow comes in D2)

**Need a change? (full-width section, hidden when Cancelled):**
- 5000-char textarea + Submit button (POST `/api/account/change-
  request`)
- Pending requests list below, newest first; each shows submitted
  time (relative if recent, absolute past 30 days), status badge
  (`pending` / `in-progress` / `resolved` / `rejected`), and
  message body
- 5-char minimum prevents accidental empty submits; 5000-char
  maximum keeps each request scoped (split into separate ones for
  bigger asks)

### 8.3 Change request data flow

**Inbound (customer → ModuForge):**

```
Customer types message → click Submit
        │
        ▼
POST /api/account/change-request   { token, message }
        │
        │  zod-validated; status checked against ELIGIBLE_STATUSES
        │  (Paid / Onboarding * / Build Started / Live)
        ▼
Generate ChangeRequest:
   { id: crypto.randomUUID(), submittedAt: now, message, status: "pending" }
        │
        ▼
appendChangeRequest(prospect.pageId, request)
   → read current Change Requests Inbox JSON array
   → prepend new entry (newest first)
   → write back as rich_text on Prospects DB
        │
        ▼
sendInternalNotification → Ben's gmail with Notion + admin links
        │
        ▼
Return { success: true, request } to client
        │
        ▼
Client merges into local state (no refetch needed)
```

**Outbound (ModuForge → customer, on resolution):**

```
Operator (or Cowork in Stage 2C) updates request
   → status: "resolved" / "rejected"
   → reply:  customer-visible text
        │
        ▼
PATCH /api/admin/change-request   { token, changeRequestId, status, reply }
   (auth: Basic Auth via /api/admin/* matcher in middleware.ts)
        │
        │  validates that resolved/rejected requires a reply
        ▼
updateChangeRequest(prospect.pageId, changeRequestId, { status, reply })
   → reads inbox JSON, finds entry by id
   → applies patch
   → if first transition into a terminal state, stamps resolvedAt
   → writes back
   → returns { updated, transitionedToTerminal }
        │
        ▼
If transitionedToTerminal && reply:
   sendCustomerNotification → customer's email
     subject: "Your change request — resolved" / "— closed"
     body:    greeting + reply (verbatim) + original message + dashboard link
        │
        ▼
Return { success, request, customerNotified, emailWarning } to client
        │
        ▼
Operator UI updates locally; customer sees the reply on their
dashboard immediately if they refresh, or the email if they don't.
```

### 8.4 RAG status

Both dashboards render the same `<RAGStatus>` pill so the same
state looks identical to customer and operator:

| Status | Colour | Meaning |
|---|---|---|
| `pending` | Red dot, red pill | Received, not yet started |
| `in-progress` | Amber dot, orange pill | Being worked on |
| `resolved` | Green dot, green pill | Done; customer was emailed verbatim with the reply |
| `rejected` | Grey dot, navy pill | Closed without action; reply explains why |

Re-saving an already-terminal request (e.g. fixing a typo in the
reply) does **not** re-send the email — the
`transitionedToTerminal` flag in `updateChangeRequest` is the gate.
Editing a still-pending request is free.

The `Change Requests Inbox` rich_text field is a JSON array of
ChangeRequest records — see `src/lib/notion-prospects.ts` for the
type. Stage 2C C1 graduates this into a dedicated `Change
Requests` Notion DB once Cowork starts processing them at scale,
adding classifier outputs and audit trail.

### 8.5 What this dashboard intentionally doesn't do (yet)

- Self-serve cancellation (D2)
- Module add/remove without email (D2)
- Bill / invoice viewing (deferred to Stripe integration, Stage 2A
  Part 2)
- Site analytics widget (deferred to Stage 3, when Plausible is
  wired)
- Editing data the customer already submitted in earlier phases
  (already covered by the Onboarding Hub for Hub data; intake form
  edits go through email for now)
- Live chat / inline messaging (probably never — async email is
  better for everyone at small business scale)

## 9. Operations interface (Ben's view at scale)

ModuForge is designed for hundreds of customers without scaling Ben's
ops time linearly. That only works if (a) Cowork does the work and
(b) Ben has a tight, opinionated interface for seeing the fleet,
drilling into one customer, and intervening when needed. This
section is the spec for that interface — built incrementally across
Stages 2C-3.

### 9.1 Fleet view (`/admin`) — current shape (Stage 2D D2)

Server-rendered table that hydrates into `<AdminProspectList>`
(client component) for search + filter interactivity. Server still
owns auth + Notion fetch + health strip; client owns the table state.

**Columns:**

| Column | Notes |
|---|---|
| Name / Business | Customer name + business name + email |
| Action | Outstanding indicators (red / amber pills, see below) |
| Type / Loc | Business type + UK location |
| Status | Coloured badge (Phase 1 / 2 / 3 / Paid / Live / Cancelled) |
| Compat | Compatibility result + hard / soft blockers |
| Fees | Calculated setup + monthly fee + Founding tag |
| Submitted | Latest phase submission date |
| Links | `Detail →` · Notion ↗ · Qualify URL · Intake URL · Hub URL · 5-dot Hub progress |

**Outstanding indicators (Action column + row tint):**

Two attention-needed signals show in the new `Action` column. Rows
are tinted to reinforce them:

- **Open change requests** — count of requests in `pending` or
  `in-progress`. Red pill ("N open requests") + light red row tint.
- **Awaiting reply** — prospect status is one of {Phase 1 Complete,
  Phase 2 Complete, Phase 2 Flagged for Review, Phase 2
  Clarification Requested, Phase 3 Complete} — operator (or Cowork
  in Stage 2C) is the next mover. Amber pill ("Awaiting reply") +
  light orange row tint.

A row with both shows both pills; red takes precedence on tint.

**Search box** (case-insensitive substring match):
- Name / Business / Email / Domain / Token prefix

**Filter chips** (above the table, click to toggle):
- All
- Open requests *(red-tinted when count > 0)*
- Awaiting reply *(amber-tinted when count > 0)*
- Live customers *(green-tinted)*
- Cancelled

Each chip shows a count so Ben sees at a glance how many rows match.
Active chip = solid navy; others styled by tone of their state.

### 9.2 Fleet view — TODO for D3 (alongside Stage 2C)

Once Cowork's audit log + Exceptions DB land:
- Health badge per row (red / amber / green from §6.1 checks)
- Aggregate banner: "X customers live · Y open requests · Z
  awaiting Ben review · W incidents"
- Bulk actions (typed-confirmation required): security patch,
  broadcast email, fleet-wide rebuild, force-rerun health checks
- Saved searches per common scenario (e.g. "Live customers with no
  health checks in 24h")

### 9.3 Per-customer detail (`/admin/[token]`)

(Note on Step 2 / 3 split: in the original Hub design, Resend setup
was bundled with Step 2 because both involve DNS. That conflated
universal infrastructure with module-specific work. The current
shape separates them: **Step 2 is domain-only**, **Step 3 is
"Modules" — collapsible per-module cards** for each purchased
module (Cal.com / Resend / GBP). Each card shows a RAG status pill
and auto-collapses on completion so the customer can scan the page
and see what still needs work.)


The drill-down. One scrollable page with collapsible sections:

1. **Header** — name, business, domain, status, health dot, founding
   member tag, days since launch, **Notion ↗** + **Live site ↗** +
   **Pause Cowork** toggle
2. **Notion record (editable inline)** — every field from the
   Prospects / Clients DB; saves write through to Notion; system
   picks up changes on next cron tick
3. **Recent activity (last 30)** — Cowork audit entries (action,
   timestamp, status, ms duration); click to expand a single entry
   for full context
4. **Open exceptions** — from `Exceptions` DB; each has buttons:
   *Acknowledge* / *Mark resolved* / *Escalate to Tier 3*
5. **Change requests this month** — open and recently-closed; each
   shows the original request, Cowork's classification, the draft (if
   any), and approve / edit / reject buttons
6. **Live preview** — iframe of `https://customer.domain` (or
   `/preview/[token]` for un-launched ones)
7. **Direct-action buttons:**
   - Rebuild now
   - Send a one-off email (Cowork drafts; Ben edits + sends)
   - Override compatibility result
   - Extend content allowance for the month
   - Mark cancellation requested
   - Force resync from Stripe
   - Trigger handover (if cancellation)
8. **Drop-in deep links** — open this customer's Cloudflare /
   Resend / Cal.com / GBP dashboards in new tabs; Ben's already a
   team member so the dashboards open authenticated. Used for
   Tier 3 emergencies only.

### 9.4 Notification routing (where each escalation goes)

Mirror of §6.6 from Ben's side:

| Tier | Visible to Ben in | Email | Push | Customer notified |
|---|---|---|---|---|
| 1 (auto-resolvable) | "Recent activity" feed in `/admin` | No | No | No |
| 2 (config-fix) | "Awaiting approval" queue chip on `/admin` header | Daily digest by default | No | Only if customer-visible change |
| 3 (genuinely broken) | Banner at top of `/admin` | Immediate | Push (Stage 3 — requires PWA notification setup) | Cowork-drafted holding email goes immediately; full update after fix |

Slack integration (Stage 3): an `#ops-modforge` channel gets every
Tier 3, plus a daily digest of Tier 2 approvals.

### 9.5 Direct intervention paths

Five well-defined ways Ben can override Cowork. None require Ben to
log into a customer SaaS dashboard for routine work, but all are
available for emergencies:

1. **Edit Notion directly.** Any field. System reads Notion as
   source of truth on next cron tick. This is the lowest-friction
   override — adjust fees, change module selections, extend allowance,
   change status. Cowork audits the change ("Notion field changed
   externally") on next read.
2. **Override Cowork drafts.** Every draft has *Edit*, *Replace*,
   *Cancel*. Edit lets Ben tweak content; Replace lets Ben write a
   completely different action; Cancel kills the action and asks
   Cowork to re-classify or escalate.
3. **Pause Cowork for one customer.** Single Notion checkbox
   ("Cowork Paused"). When checked, Cowork stops all automated actions
   on that customer (audit log records the pause), but health checks
   keep running so Ben still sees their state. Used when something's
   weird and Ben wants Cowork out of the way while he investigates.
4. **Drop-in deep links to dashboards.** From `/admin/[token]`,
   one-click opens the customer's Cloudflare / Resend / Cal.com /
   GBP dashboards. Ben's team-member access means these open
   authenticated. Use for Tier 3 emergencies only.
5. **Direct database edit.** All operational state (prospects,
   clients, audit log, exceptions) is in Notion. Worst case, Ben can
   bulk-edit in Notion's UI directly. System tolerates external
   edits (idempotent reconciliation on cron).

### 9.6 How the model scales

| Customers | Ben's ops time / day | What changes |
|---|---|---|
| 1 – 20 | ~30 min | Draft-then-send on every customer email; manual cancellation flow; Ben reads every audit entry |
| 20 – 100 | ~30 – 45 min | Auto-send status updates; only L1 / L3 / quote emails reviewed; bulk security patches via `/admin`; daily digest for Tier 2 |
| 100 – 500 | ~45 – 60 min | Days are pure escalation review; the dashboard *is* the day's work |
| 500 – 1000 | ~60 – 90 min | Need Cowork-of-Cowork (a pre-triage layer that classifies and pre-drafts responses to escalations); `/admin` needs saved searches and SLA timers |
| 1000+ | needs business hire | Either hire ops support, or productise self-serve change-request UI for customers (most changes go end-to-end without Cowork or Ben) |

The model scales because:

- Cowork's load grows linearly with customer count, not Ben's
- Health checks are O(1) per customer; the cron processes 1000+
  customers in seconds
- Notion handles 10k+ rows comfortably as a state store
- Cloudflare Workers handle the request load (Stage 2C ops worker
  is a separate Worker from the customer-facing site, so customer
  performance never degrades from ops workload)
- The bottleneck at 1000+ is Ben's review queue for
  non-routine items; Cowork-of-Cowork (pre-triage) is the unlock

### 9.7 Things Ben never has to do, ever

Spelling out the negatives so the model is clear. **None** of these
are part of Ben's working day:

- Log into a customer's Cloudflare / Resend / Cal.com / GBP for
  routine work (only Tier 3 emergencies, via the deep-links in §8.4)
- Click "deploy" for a content change (Cowork does it after approval)
- Manually generate a performance report (Cowork drafts; Ben
  approves and sends during pre-20-clients period; auto-sends after)
- Accept a SaaS invitation manually (Cowork polls and accepts)
- Track which customer needs what (Notion + Cowork; never a
  spreadsheet or todo list)
- Calculate fees (fee engine does, deterministically)
- Process subscription renewals (Stripe does)
- Apply security patches (Cowork does on the weekly audit cron)
- Renew TLS certificates (Cloudflare auto-renews)
- Watch a build complete (Cowork waits + emails when done)

What Ben DOES do (the irreducible human work):

- Maintain the Playbook (the rules Cowork follows)
- Approve drafts during the pre-20-clients period
- Make policy decisions (set new prices, add modules, change scope rules)
- Handle Tier 3 incidents
- Make business decisions on edge cases Cowork escalates
- Personally onboard a particularly important customer if he wants to
- Periodically review the audit log and Cowork's classification
  accuracy; update prompts if drift detected

## 10. Open questions / pending decisions

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
