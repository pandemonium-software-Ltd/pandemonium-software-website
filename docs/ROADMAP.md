# ModuForge Roadmap — single source of truth

> **Whenever asked "what's next?", check this file first.** It is the
> canonical priority list. README, PLAYBOOK and ARCHITECTURE all link
> back here. Update this file (not the others) when a priority lands
> or a new one surfaces.
>
> **Strategic layer:** `docs/MASTER-PLAN.md` is the build-to-sell master
> plan (Phases 0/T/1/2/3/4) that this tactical list feeds into. Items
> here are mapped into phases there; when they disagree, MASTER-PLAN's
> status annotations win (reconciled against code 2026-06-03).

**Last updated:** 2026-06-03

---

## ✅ Shipped (no action needed)

| Item | When |
|---|---|
| Verify digest preview + send a test | 2026-05-24 |
| Real-device mobile pass | 2026-05-24 |
| GBP end-to-end module (build + automation + live feed) | 2026-05-24 |
| GBP hardening (URL parsing, location bias, admin panel) | 2026-05-24 |
| Customer dashboard self-serve module add/remove + cancel | 2026-05-24 |
| Confirmation emails for module + cancel actions | 2026-05-24 |
| Before/after money panels in modals + emails | 2026-05-25 |
| GDPR retention automation (30d personal / 7y financial) | 2026-05-25 |
| CCRs-compliant terms rewrite + Companies House disclosures | 2026-05-25 |
| Refund/cancellation policy unified across /terms /pricing /payment /intake | 2026-05-25 |
| **Pricing-live cutover** — Founding £99/£15, Standard £299/£29, new module prices, Multi-location module, "5 years" not "for life", split Newsletter / Offers, placeholder testimonial removed | 2026-05-25 |
| **Multi-location module end-to-end** — data model + Hub Step 4 H capture UI + customer-site `<Locations />` renderer + dashboard +/- stepper + admin surface + multilocation-change pending kind | 2026-05-25 |
| **Build quirk fix** — `outputFileTracingRoot` pin (no more symlink dance on deploy) | 2026-05-25 |
| **Stripe sandbox integration** — Checkout, webhooks, auto-apply cron, subscription updates from pending changes, Setup-prefixed line items, payment page itemised + totals computed from raw inputs | 2026-05-25 |
| **Email deliverability** — apex SPF record on modu-forge.co.uk for Outlook/Hotmail strictness | 2026-05-25 |
| **Sentry error tracking** — ops worker full coverage via withSentry + structured-JSON path for marketing site + /admin inbox with HMAC-verified webhook receiver, D1 alerts table, resolve flow | 2026-05-25 |
| **Per-module Hub unlock** — Step 3 + Step 4 sections unlock when a paid-for module's setup is incomplete (post-launch adds); server-side mutable + per-step-done gates exempt Live + tools/content; latched against stored state to avoid catch-22 | 2026-05-25 |
| **Lucas GBP automation verified** — end-to-end Place ID resolution working live (after Google Cloud billing enabled on ModuForge project) | 2026-05-25 |
| **GBP pending→confirmed→latched flow + tests** — 2-step confirmation prevents wrong-business latches; fixed bug where email fired prematurely with "(unknown)" listing details; 20 tests covering full lifecycle | 2026-05-29 |
| **GBP weekly audit cron** — Claude-powered per-customer listing audit (description, categories, photos, hours, GBP↔website consistency, review health). Extended Places API fetch, structured report emailed to Ben every Monday. 9 tests. | 2026-05-29 |
| **GBP audit PDF reports** — branded A4 PDF per customer with traffic-light scoring (red/amber/green sections), score badge, listing overview table, top reviews, consistency check. Attached to weekly audit email via Resend. Only fires for confirmed (latched) listings. | 2026-05-29 |
| **GBP URL validation + clearer Hub instructions** — client-side isGbpUrl() blocks non-Google URLs, inline red error, "Done" gate. Hub instructions rewritten: "search on Google Maps → Share → Copy link". | 2026-05-29 |
| **T&C liability clause strengthened** — section 12 expanded to 5 subsections: 12-month liability cap, indirect/consequential loss exclusion, third-party services disclaimer (Google, Stripe, Cloudflare, Resend, Cal.com, Anthropic), force majeure (30-day termination), preserved carve-outs (fraud, negligence causing death/injury). | 2026-05-28 |
| **Data Processing Agreement (DPA)** — GDPR Article 28 compliant `/dpa` page. 14 sections covering: definitions, scope, data categories table, processor/controller obligations, sub-processor register (Cloudflare, Notion, Resend, Stripe, Google, Anthropic, Sentry with locations), 24h breach notification, retention aligned with existing 30d/7y automation, data subject rights, audits, liability, governing law. `acceptsDpa` checkbox added to intake form. Cross-linked from /terms, /privacy, and footer. | 2026-05-28 |
| **Professional indemnity insurance** — purchased and active. | 2026-05-28 |
| **R2 brand-asset deletion in GDPR scrub cron** — `deleteR2Prefix()` lists + batch-deletes all objects under `assets/<token>/` during the daily 03:00 UTC scrub. R2 binding (`ASSETS_BUCKET`) added to ops worker. Handles pagination, graceful skip when binding missing. 3 new tests. | 2026-05-28 |
| **Comprehensive admin dashboard** (#5, complete) — `/admin` renders: KPI strip (8 cards) + service-health strip; **Panel A** Marketing analytics (traffic trends, page/referrer/geo breakdown, weekday pattern, 7/30/90 window); **Panel B** Customer insight (conversion funnel with drop-off %, revenue by tier, founding/standard mix, pipeline by niche, module popularity, location spread); **Panel C** Build monitoring (per-customer 6-step progress, stuck-build detection >7d, launch-date countdown, build-failure alerts, step completion rates); **Panel D** Run monitoring — cron health + zone status + Sentry rates + GBP issues (2026-05-29) **plus deployment/build status (in-progress/failed/recent + go-live vs preview), Stripe payment health (paying/subscriptions/missing-sub/billing-failures/pending-ops/MRR), and R2 storage usage per customer (2026-06-03)**. Pure metric fns in `admin-metrics.ts` (`computeDeploymentStatus`, `computePaymentHealth`, `summariseR2Objects`) with 12 unit tests. Plus bonus panels: Business Health (GDPR/CI/audit/secret-rotation), Ops Activity (bulk retry/resolve), Sentry Alerts inbox. | 2026-06-03 |
| **Onboarding interactive walkthroughs** (#14) — driver.js "Walk me through it" guided tours on Hub Steps 1-3 with `data-guide` selectors + ModuForge-styled popovers. VideoTutorial component + R2-backed `getTutorialVideos()` config (videos auto-appear when uploaded, gracefully hidden when not). Per-registrar video slots in Step 2, GBP video slots in Step 3. Tutorial *video files* outsourced (raw-recording quality too low). | 2026-06-03 |
| **49-finding security audit + all fixes** — 7-agent review (`docs/SECURITY-AUDIT-2026-06-03-FULL.md`): 1 Critical, 7 High, 32 Medium, 19 Low. All actionable items fixed, incl. N1 email leak on `/api/prospect/[token]`. | 2026-06-03 |
| **Cowork change-request automation overhaul** — two-pass Haiku classifier, partial-patch preservation, admin push-through, retry UI, inline classify+apply (no cron defer), re-escalation loop fix, multi-location patch targets, 15s dashboard polling. | 2026-05-31 |
| **Customer-domain email verification** — auto-verify customer domains with Resend so transactional mail sends from the customer's own domain. | 2026-05-31 |
| **Coming-soon gate + quick-edit forms** — coming-soon bypass token flow (cookie/CORS/middleware), photo upload, expanded quick-edit form (services, FAQ, testimonials, trust, copy) on Step 5 + reviewEdits admin grant. | 2026-05-31 |

---

## 🧭 Strategic decisions locked 2026-05-25

These are the authoritative answers to "what is ModuForge selling, at
what price, to who?" — supersedes any earlier copy on the live site
or in the codebase that disagrees.

### Pricing

| Tier | Setup | Monthly | Notes |
|---|---|---|---|
| **Founding** | £99 | £15 | 3 spots, locked 5 years (not "for life"). None signed yet. |
| **Standard** | £299 | £29 | Flat — no first-10 vs 11+ banding. |
| **Premium** | — | — | **Deferred entirely.** Revisit only when 5-10 Standard customers ask for a specific feature. |

| Module | Setup | Monthly |
|---|---|---|
| Online Booking | £19 | £6 |
| Enquiry Form | £19 | £6 |
| Newsletter | £49 | £9 |
| Offers | £19 | £6 |
| Google Business Profile + reviews | £59 | £3 |
| Multi-location (per extra location) | £15 | — (one-off only) |

Notes:
- Module pricing is **honest-effort** — setup fees roughly reflect actual operator time per module (GBP audit = 1-3h, Newsletter setup = 45-90 min, etc.)
- **Multi-location at £15** is acknowledged as under-priced vs the 2-4 hours of provisioning per location. Watch-item: revisit if Standard customers add 5+ locations and operator time becomes a real bottleneck.
- Newsletter + Offers are **two separate modules** (not merged into one combined SKU).

### Strategy

- **Geography**: stay horizontal-UK in Y1, segmented by trade via the existing `businessType` dropdown on qualification. Niche commit at start of Y2 based on Y1 enquiry / conversion / ARPU data.
- **Niche-pick reporting dashboard**: defer to Q3-Q4 Y1 — Notion's native filter is enough until volume justifies a built view.
- **Premium tier**: deferred. Launch with Founding + Standard only.
- **Placeholder homepage testimonial**: remove the block entirely. Re-add when a real testimonial exists.
- **Y1 capacity**: 10 hr/week (up from 2). 5-year base-case forecast: ~£300k ARR, ~£135k take-home (~5× the prior 2hr/wk plan).
- **Cancellation/refund/GDPR/Companies House compliance**: shipped in code, awaiting `npm run deploy`.

### Implementation status

Pricing cutover **shipped 2026-05-25** in commits during the session
that landed phases A–E. Deploy (Phase F) still pending: `npm run deploy`
+ `npm run deploy:ops`.

One follow-up deferred: **customer-self-serve Multi-location counter
in the dashboard** (#new-72 below). Intake captures the count fine
today, and the `/api/admin/grant-module` admin endpoint can add the
flag out-of-band — the dashboard counter UI was deferred because it
requires new API + Notion + ProspectRecord plumbing for what is
currently a zero-customer use case. Pick up when the first customer
asks for a second location.

---

## 🔴 Critical (Certain — before paying customers land)

| # | Item | Complexity | Duration | Monthly cost | Status |
|---|------|------------|----------|--------------|--------|
| 1 | **Stripe LIVE-mode setup** — Stripe sandbox is fully wired (Checkout, webhook, auto-apply cron, line-item itemisation). Live setup = repeat S1 product/price creation in LIVE Stripe account, swap secrets to `sk_live_*`, register live webhook, switch `stripe-products.ts` IDs (env-flag). | Low-Medium | 1-2 h | 1.4% + 20p per txn | Certain — NEXT |
| ~~2a~~ | ~~Fix 2 step3-tools tests~~ — **SHIPPED 2026-05-29** (moved to ✅ Shipped) | — | — | — | Done |
| ~~2b~~ | ~~GBP audit cron~~ — **SHIPPED 2026-05-29** (moved to ✅ Shipped) | — | — | — | Done |
| ~~3~~ | ~~T&C limitation of liability clause update~~ — **SHIPPED 2026-05-28** (moved to Shipped) | — | — | — | Done |
| ~~3a~~ | ~~Data Processing Agreement (DPA)~~ — **SHIPPED 2026-05-28** (moved to Shipped) | — | — | — | Done |
| ~~4~~ | ~~R2 brand-asset deletion in GDPR scrub cron~~ — **SHIPPED 2026-05-28** (moved to Shipped) | — | — | — | Done |
| ~~7~~ | ~~Professional indemnity insurance~~ — **DONE 2026-05-28** (moved to Shipped) | — | — | — | Done |

---

## 🟠 High-value next 30 days

| # | Item | Complexity | Duration | Monthly cost | Status |
|---|------|------------|----------|--------------|--------|
| ~~5~~ | ~~Comprehensive admin dashboard~~ — **COMPLETE 2026-06-03** (moved to ✅ Shipped). All 4 panels + 3 bonus panels live. Only optional polish left: Panel B location bar-list → geographic heatmap (low value at current volume). | — | — | £0 | Done |
| 8 | **Lead inbox / mini-CRM ⭐** — structured enquiry form (project type / size / budget), pipeline (New → Quoted → Won → Lost), follow-up reminders, SMS on new lead | High | 5-7 days | £0 base · +£15-30/mo if SMS (Twilio) | Optional |
| 9 | **Review request automation ⭐** — auto SMS/email after a job, one-click Google review link, dashboard tracks responses | Medium | 2 days | £0 · +£10-20/mo if SMS | Optional |
| 10 | **Performance pricing tier ⭐** — base £X + £Y per qualified lead delivered, capped. Needs #1 + #8 first | Medium | 1-2 days | £0 (built on existing) | Optional |
| ~~11~~ | ~~Privacy policy + cookie banner refresh~~ — **effectively done.** `/privacy` already has 10 thorough sections (updated 2026-05-29, complaint process added). Cookie banner **not needed** — site uses Cloudflare edge analytics only, zero tracking cookies, so no consent mechanism legally required under GDPR/PECR. | — | — | £0 | Done / N-A |
| 12 | **Per-recipient newsletter drill-down** — click a send → see who opened/clicked. Data already captured, UI only | Low | 4-6 h | £0 | Optional |
| 13 | **Customer lifecycle emails** — day 1 welcome, day 30 check-in, 6-month review, anniversary stat. Cron infra ready | Medium | 1-2 days | £0 (Resend already paid) | Optional |
| ~~14~~ | ~~Onboarding video walkthroughs~~ — **interactive walkthroughs shipped 2026-06-03** (driver.js guides on Steps 1-3 + R2-backed video infra, see ✅ Shipped). Only outstanding: produce the *video files* themselves (raw screen-recording quality too low — to be done with proper editing/Remotion elsewhere; they auto-appear in the Hub once uploaded to R2 `tutorials/`). | Low | recording only | £0-50 one-off | Walkthroughs done; videos outsourced |
| 15 | **Founding-member landing page + hard cap** — dedicated /founding-members page, "first 50 only" pitch | Medium | 1 day | £0 | Optional |
| 16 | **Trade body badges + verification ⭐** — Checkatrade / Trustmark / Which? badges with correct schema.org markup so Google ranks them | Low | 2-4 h | £0 | Optional |
| 17 | **ASO/SEO pass — FAQ page only** — **~75% done:** root-layout metadata + per-page exports, OG cards, `sitemap.ts`, `robots.ts`, LocalBusiness JSON-LD all shipped. Remaining: a dedicated public `/faq` page (Faq.tsx component exists but is only embedded on `/pricing`). | Low | 2-4 h | £0 | Recommended |
| 18 | **Performance + accessibility audit** — CWV pass, WCAG 2.2 AA spot-check, bundle size | Medium | 1 day | £0 | Recommended |
| 19 | **Customer support workflow (Cowork email triage)** — inbox → classify → draft from templates. Needed once volume hits | High | 2-3 days | £0 | Optional |
| 19a | **Multi-location dashboard counter** — customer-self-serve +/- buttons in ModulesEditor. Needs new `/api/account/multilocation` endpoint, ProspectRecord.extraLocations field, Notion column. Intake captures the count today; admin endpoint can grant out-of-band — UI deferred until first 2nd-location request | Medium | 4-6 h | £0 | Trigger-based (first 2nd-location request) |

---

## 🟡 Optional / later (no rush)

| # | Item | Complexity | Duration | Monthly cost | Status |
|---|------|------------|----------|--------------|--------|
| 20 | **Cowork content engine ⭐** — "Write me a blog post about today's job", AI-suggested page expansions when analytics show traffic spikes | Medium-High | 3-5 days | ~£10-30/mo (Anthropic API at scale) | Optional |
| 21 | **Photo-to-post pipeline ⭐** — WhatsApp/email a photo → auto-resize → Gallery → draft Newsletter → cross-post to GBP + Instagram | High | 1-2 weeks | ~£5-15/mo (AI captions + free GBP/IG APIs) | Optional |
| 22 | **Notify customer when admin grants extra allowance** — one-liner email, closes the admin-grants loop | Trivial | 1 h | £0 | Optional |
| 23 | **Backfill more analytics days for Lucas + @self** — so the dashboard sparkline fills out faster | Trivial | 30 min | £0 | Optional |
| 24 | **Live chat / Intercom-style** | Medium | 1 day + integration | £20-50/mo | Optional |
| 25 | **A/B test pricing variants** — wait for ≥50 customers for signal | High | Ongoing | £0 | Optional |
| 26 | **Backup/restore drill** — Notion + D1 export + restore test, once you have real customer data | Medium | 1 day | £0 | Optional |
| 27 | **VAT registration** — triggered at £90K rolling 12-month turnover, defer until close | Low (admin) | 1 day | £0 (or 20% if registered + clients can't reclaim) | Trigger-based |
| 28 | **Trademark ModuForge wordmark** — defends the brand | Low | 1 day filing | £170 one-off | Optional |

⭐ marks "killer features" — disproportionately high impact on positioning + customer retention.

---

## 📋 Suggested next 3 moves

1. **#1 (Stripe LIVE)** — the ONLY genuine launch blocker (~1.5-2 h). Sandbox is 100% wired; needs live products/prices, `STRIPE_MODE` env flag (`TODO(go-live)` already in `stripe-products.ts`), live webhook, `sk_live_*` secrets, deploy + smoke test.
2. **#17 (FAQ page)** — last 25% of the SEO pass, 2-4 h.
3. **#18 (perf/a11y audit)** — operational polish, not a launch blocker.

**Reality check (2026-06-03 reassessment):** #5 (now complete — all 4 panels + 3 bonus panels), #11, #14 walkthroughs, and most of #17 are all **already shipped**. The build is much closer to launch than the tier ordering implies — **#1 Stripe LIVE is effectively the last thing between you and taking money.**

---

## Updating this doc

- **A priority lands** → move the row up into "✅ Shipped" with the date and remove it from its tier.
- **New priority surfaces** → add it to the right tier in priority order (highest first within the tier).
- **A priority's scope changes materially** → edit the row in place + update the `Last updated` date at the top.
- **Tier promotions/demotions** → cut from one tier, paste into the new one; renumber if needed.

Keep this list ≤ 30 items. If it's growing beyond that, the tail items are probably never going to happen — delete them.
