# ModuForge Roadmap — single source of truth

> **Whenever asked "what's next?", check this file first.** It is the
> canonical priority list. README, PLAYBOOK and ARCHITECTURE all link
> back here. Update this file (not the others) when a priority lands
> or a new one surfaces.

**Last updated:** 2026-05-25

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

---

## 🔴 Critical (Certain — before paying customers land)

| # | Item | Complexity | Duration | Monthly cost | Status |
|---|------|------------|----------|--------------|--------|
| 1 | **Stripe real integration** — Checkout, webhooks, real subscription updates for module changes + refunds. Unblocks every "pending-stripe" state from today's billing work | Medium | 2 days | 1.4% + 20p per txn | Certain |
| 2 | **Express-request checkbox at payment** — bakes into the Stripe Checkout flow (notice already on page) | Low | Bundled with #1 | £0 | Certain |
| 3 | **Solicitor T&C review** — UK SaaS specialist signs off the new terms before public launch | Low (1h call) | 1 week elapsed | £200-400 one-off | Certain |
| 4 | **R2 brand-asset deletion in GDPR scrub cron** — currently logs intent only; needs R2 binding wired into ops worker | Low | 2-3 h | £0 | Certain |
| 5 | **Email deliverability hardening** — SPF / DKIM / DMARC on modu-forge.co.uk + DMARC reporting | Low | 1-2 h | £0 | Certain |
| 6 | **Sentry error tracking in prod** — you don't know what's failing without it | Low | 2-3 h | £0 (free tier) | Certain |
| 7 | **Professional indemnity insurance** — protects you if a customer's site causes them loss | Low | 1 h | £15-25/mo (£150-300/yr) | Certain |

---

## 🟠 High-value next 30 days

| # | Item | Complexity | Duration | Monthly cost | Status |
|---|------|------------|----------|--------------|--------|
| 8 | **Lead inbox / mini-CRM ⭐** — structured enquiry form (project type / size / budget), pipeline (New → Quoted → Won → Lost), follow-up reminders, SMS on new lead | High | 5-7 days | £0 base · +£15-30/mo if SMS (Twilio) | Optional |
| 9 | **Review request automation ⭐** — auto SMS/email after a job, one-click Google review link, dashboard tracks responses | Medium | 2 days | £0 · +£10-20/mo if SMS | Optional |
| 10 | **Performance pricing tier ⭐** — base £X + £Y per qualified lead delivered, capped. Needs #1 + #8 first | Medium | 1-2 days | £0 (built on existing) | Optional |
| 11 | **Privacy policy + cookie banner refresh** — same depth treatment as today's terms rewrite | Medium | 3-4 h | £0 | Recommended |
| 12 | **Per-recipient newsletter drill-down** — click a send → see who opened/clicked. Data already captured, UI only | Low | 4-6 h | £0 | Optional |
| 13 | **Customer lifecycle emails** — day 1 welcome, day 30 check-in, 6-month review, anniversary stat. Cron infra ready | Medium | 1-2 days | £0 (Resend already paid) | Optional |
| 14 | **Onboarding video walkthroughs** — replace per-registrar text walkthroughs in Hub Step 2 | Medium | 1 day + recording | £0-50 one-off | Recommended |
| 15 | **Founding-member landing page + hard cap** — dedicated /founding-members page, "first 50 only" pitch | Medium | 1 day | £0 | Optional |
| 16 | **Trade body badges + verification ⭐** — Checkatrade / Trustmark / Which? badges with correct schema.org markup so Google ranks them | Low | 2-4 h | £0 | Optional |
| 17 | **ASO/SEO pass** — metadata, OG cards, sitemap, JSON-LD, public FAQ expansion | Medium | 1-2 days | £0 | Recommended |
| 18 | **Performance + accessibility audit** — CWV pass, WCAG 2.2 AA spot-check, bundle size | Medium | 1 day | £0 | Recommended |
| 19 | **Customer support workflow (Cowork email triage)** — inbox → classify → draft from templates. Needed once volume hits | High | 2-3 days | £0 | Optional |

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

1. **#22 + #23** — both trivial; knock them out in an hour to close automation gaps on what's already built.
2. **#1 (Stripe)** — biggest unblock; brings #2, #10 within reach.
3. **#5 + #6 + #4** — three small ops-hygiene tasks (~1 day combined).

After those, you're production-ready for first paying customer modulo #3 (solicitor).

---

## Updating this doc

- **A priority lands** → move the row up into "✅ Shipped" with the date and remove it from its tier.
- **New priority surfaces** → add it to the right tier in priority order (highest first within the tier).
- **A priority's scope changes materially** → edit the row in place + update the `Last updated` date at the top.
- **Tier promotions/demotions** → cut from one tier, paste into the new one; renumber if needed.

Keep this list ≤ 30 items. If it's growing beyond that, the tail items are probably never going to happen — delete them.
