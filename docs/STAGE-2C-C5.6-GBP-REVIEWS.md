# Stage 2C C5.6 — GBP Reviews Integration

**Status:** PARKED — pending Google Places API key setup.
**Pricing:** already shipped (£29 one-off + £2/mo for the GBP module).
**Owner:** Ben.

---

## What this delivers

Customers who tick the GBP module get their top Google reviews
pulled onto their site automatically and refreshed monthly. Star
ratings light up in Google search results too (via the existing
JSON-LD AggregateRating that already ships).

This is the second half of the GBP module value prop — the first
half (manual setup/audit) ships today. The reviews integration is
PARKED until Ben provisions a Google Cloud project + Places API
key. Pricing already includes the £2/mo so we can ship without a
pricing change.

---

## Design decisions (locked in)

| Question | Decision |
|---|---|
| Refresh cadence | Monthly (1 API call per customer per month) |
| Rating filter | 4★+ only — drops 1-3★ before they reach the customer's site |
| Display location | Home page, separate section from manual testimonials |
| Display style | Rotating carousel (one review at a time, auto-cycle) |
| Manual + Google mix | Separate sections; Google labelled as "Google reviews" with the Google logo |
| Stop service if customer stops paying | YES — `gbpReviewsActive` boolean per prospect, cron skips when false; admin toggle pre-Stripe-webhook, automated post |

---

## Cost recalculation (with monthly refresh)

Daily refresh originally projected:
- 30 calls/customer/month × $0.017 = $0.51/customer/month
- 100 customers × $0.51 = $51/month total
- £2/mo per customer covered this with ~5x margin

Monthly refresh now:
- 1 call/customer/month × $0.017 = $0.017/customer/month
- 100 customers × $0.017 = $1.70/month total
- £2/mo per customer covers this with ~120x margin

**Optional follow-up:** drop the £2/mo to £1/mo to match the
"lowest possible cost" intent. £1/mo - £0.21 Stripe fee = £0.79
net per customer; cost is £0.014 per customer. Still 50x margin,
even safer pricing for customers. Decision: defer until we see if
anyone balks at £2.

---

## Architecture

### New env vars

| Var | Where | Purpose |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Ops worker secret | Server-side key with HTTP referrer restriction set to `*.r2.dev` (or empty for any) and Places API enabled |

Setup steps for Ben:
1. console.cloud.google.com → new project "moduforge-gbp-reviews"
2. APIs & Services → Library → enable "Places API (New)"
3. APIs & Services → Credentials → Create API Key
4. Set restrictions: API restriction = "Places API"; Application restrictions = "None" (server-side)
5. Billing required to use the API; free tier covers $200/month
6. `cd worker dir && wrangler secret put GOOGLE_PLACES_API_KEY` (paste)

### New Notion fields on prospect

| Field | Type | Purpose |
|---|---|---|
| `Gbp Place Id` | rich_text | Google Place ID, derived from the GBP URL the customer pastes in onboarding Step 3. Stable identifier — never changes for a business. |
| `Gbp Reviews Active` | checkbox | Default true on first activation. Cron skips refresh when false. The Stripe-aware safety toggle. |
| `Gbp Reviews Cache` | rich_text JSON | `{ fetchedAt: ISO, placeRating: number, placeRatingCount: number, reviews: GbpReview[] }`. Last-cached reviews — keep showing them even when refresh is paused. |
| `Gbp Reviews Last Failure` | rich_text JSON (optional) | `{ at: ISO, message: string }` — surfaced in /admin so Ben can debug stale caches. |

### Place ID extraction

Google's GBP URLs come in two main forms:
- `https://maps.google.com/?cid=<numeric_id>`
- `https://www.google.com/maps/place/.../@lat,lng,zoom/data=...`
- `https://g.page/<slug>` (short form)

Any of these can be resolved to a Place ID via the Places API
`findPlaceFromText` endpoint (one extra API call, only run once
per customer at onboarding). Cache the resolved Place ID in
`gbpPlaceId` so subsequent refreshes use it directly.

### Cron logic (ops worker)

Runs as part of the existing daily cron tick (no new schedule).

```
For each prospect WHERE
  status IN ("Live", "Onboarding Complete") AND
  moduleSelections includes "Google Business Profile Setup/Audit" AND
  gbpReviewsActive = true AND
  (gbpReviewsCache is null OR fetchedAt > 30 days ago):

  1. If gbpPlaceId is null:
       resolve Place ID via findPlaceFromText(gbpUrl)
       persist to Notion
  2. Fetch Place Details with fields=reviews,rating,userRatingCount
  3. Filter reviews to rating >= 4
  4. Sort by relevance (Google's default order)
  5. Persist {fetchedAt, placeRating, placeRatingCount, reviews[0..4]} to Notion
  6. On API failure: log + persist gbpReviewsLastFailure;
     keep existing cache (don't wipe on transient errors)

Cap: 200 prospects per cron tick (~$3.40 even at worst case).
```

### Customer-site rendering

New section on the home page, below testimonials slice:

```
─────────────────────────────────────
   ★★★★★ 4.8  ·  127 Google reviews
─────────────────────────────────────

  ╔═══════════════════════════╗
  ║  ★★★★★                     ║
  ║  "Quote text here..."      ║
  ║  — Sarah J., 2 weeks ago   ║
  ╚═══════════════════════════╝

      ●  ○  ○  ○  ○

   See all reviews on Google →
─────────────────────────────────────
```

- **Aggregate row at top:** business's overall Google rating + total review count, links to the GBP listing
- **Carousel:** one review at a time, ~6s per slide, fades cross-fade
- **Pause on hover/focus:** stops auto-rotate while user is reading
- **Respects prefers-reduced-motion:** when set, no auto-rotate; user uses dots
- **Pagination dots:** clickable to jump
- **Aria-live=polite:** screen readers announce slide changes
- **Footer link:** "See all reviews on Google" → opens the customer's GBP listing in a new tab

The manual testimonials slice stays as the current 2-up grid
above this section — the two are visually separated by the
section gap so it's clear which is which. Google reviews carry
the Google logo + colour treatment; manual testimonials don't.

### Carousel implementation

Custom client component (`src/components/GoogleReviewsCarousel.tsx`
in the customer-site-template). Pure CSS transition + small
useState/useEffect for the rotation timer. No carousel library —
saves 10-20KB and we don't need the features.

### Stripe-aware safety mechanism

Two phases:

**Phase 1 (now, no Stripe webhook):**
- `gbpReviewsActive` boolean defaults to `true` when GBP module is
  in `moduleSelections`
- Admin page `/admin/[token]` gets a toggle to flip it manually
- Cron checks the boolean before any API call → zero cost when off

**Phase 2 (when Stripe webhooks land in Stage 2A Part 2):**
- Webhook handler `customer.subscription.updated` parses the new
  status
- If subscription has GBP line item AND status IN
  ("past_due", "canceled", "unpaid", "incomplete_expired"):
  - flip `gbpReviewsActive` = false
  - keep cache intact (customer site continues to show last-cached)
- If subscription transitions back to "active" → flip back to true,
  next cron tick resumes refreshing

When `gbpReviewsActive = false`:
- Cron skips the API call (no cost incurred)
- Customer site keeps rendering the last-cached reviews (good UX)
- Admin sees a clear "PAUSED — billing inactive" badge
- After 90 days of inactive status, optionally hide the Google
  reviews section entirely (so a churned customer doesn't show
  stale reviews indefinitely) — defer until we've seen the case
  in the wild

---

## Implementation checklist (when we unpark)

1. [ ] Ben creates Google Cloud project + Places API key
2. [ ] `wrangler secret put GOOGLE_PLACES_API_KEY` in ops worker
3. [ ] Add 4 new columns to Notion Prospects DB (see fields table)
4. [ ] Update `src/lib/notion-prospects.ts`:
   - Add ProspectRecord fields: gbpPlaceId, gbpReviewsActive, gbpReviewsCache, gbpReviewsLastFailure
   - Add readers in pageToProspect
   - Add writers: writeGbpPlaceId, writeGbpReviewsCache, writeGbpReviewsActive, writeGbpReviewsLastFailure
5. [ ] New file `src/lib/google-places/client.ts`:
   - findPlaceFromText (one-shot Place ID resolve from URL)
   - getPlaceDetails (reviews + aggregate)
   - Returns null on any failure (never throws — caller falls back to last cache)
6. [ ] New file `src/ops-worker/steps/step6-gbp-reviews.ts`:
   - Iterate eligible prospects, refresh cache, log failures
   - 200/tick cap, 30-day TTL
7. [ ] Wire step6 into the existing cron dispatch (`src/ops-worker/dispatch.ts`)
8. [ ] Add GoogleReview type to:
   - `src/lib/site-generator/types.ts`
   - `customer-site-template/src/lib/types.ts`
9. [ ] Update `src/lib/site-generator/adapter.ts` to include
   `googleReviews` in SiteGeneratorInput when available
10. [ ] Update `src/app/api/internal/site-data/route.ts` to ship
    googleReviews + aggregate to the customer-site build
11. [ ] New file
    `customer-site-template/src/components/GoogleReviewsCarousel.tsx`
    (client component, ~80 lines, no deps)
12. [ ] Wire the carousel into
    `customer-site-template/src/app/page.tsx` below the manual
    testimonials slice
13. [ ] Update `customer-site-template/src/lib/jsonld.ts` so the
    AggregateRating uses the REAL Google rating + count (currently
    averages from manual testimonials only)
14. [ ] Add admin toggle for `gbpReviewsActive` to `/admin/[token]`
15. [ ] Document the Stripe webhook hook-point for Phase 2

---

## Out of scope (explicit non-goals)

- **Multi-location businesses:** v1 supports one Place ID per
  prospect. If a customer has multiple locations, they pick one as
  the canonical for site rendering. v2 could allow multiple if we
  see real demand.
- **Owner responses:** Phase 2 of Google Business Profile API
  would let the customer reply to reviews from inside the Hub.
  Big feature, defer until customers ask.
- **Sentiment analysis on quotes:** could use Haiku to highlight
  positive phrases. Premature — let the raw text speak.
- **Review widgets / TrustPilot / Yelp:** different APIs, not
  worth the surface area until Google is shipped + proven.
