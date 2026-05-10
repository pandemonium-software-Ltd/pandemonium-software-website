# Stage 2C C5 — Customer site auto-generation + deploy

## What this is

The "real" ModuForge product layer: take a customer's intake answers
+ brand assets + module selections + chosen vibe → automatically
generate a working website, deploy it to their Cloudflare account
as a preview, then promote that to production on go-live day.

Replaces the current placeholder "<Name> — coming soon" Worker that
ships from Stage 2C C2.3. After C5 lands, the customer sees a real
site at the preview URL within minutes of clicking "Request site
preview" in their hub.

## Status

- **Stage 2C C2.3**: ✅ shipped — placeholder Worker + DNS + Workers
  Routes wiring per customer
- **Stage 2C C5**: this doc — full auto-gen pipeline, ~3-4 weeks
  total focused effort, broken into 8 sub-phases below

The manual "operator pastes preview URL into admin" path
(`/api/admin/preview-url`, shipped today) stays as a fallback /
override even after C5 ships — useful when the auto-gen output
needs human touch-up or for one-off custom builds.

---

## The core architectural decisions (need your input on these BEFORE I start)

### Decision 1 — Build environment

The customer's Worker bundle has to be BUILT somewhere before
upload. Workers themselves can't run a Next.js build. Options:

| Option | Pros | Cons |
|---|---|---|
| **A. Generate static HTML/CSS/JS strings inside the ops worker, upload as a Worker that serves them** | Self-contained — no external CI dependency. Build runs in the same place as the rest of Cowork. Fast (~5s per build). | Means the templates must be expressible as templated strings, not full Next.js apps. Constrains design complexity but enforces simplicity. |
| **B. GitHub Actions workflow triggered by ops worker** | Full Next.js / any framework you want. Real build environment. | Adds a CI dependency (GitHub Actions queue), latency (~2-5 min per build), and a second deployment surface to manage. Cost-free up to 2000 min/month. |
| **C. Cloudflare Workers Builds (Cloudflare's own CI)** | Native to the Cloudflare stack we already use. | Newer product, less mature. Same latency cost as Actions. |
| **D. A second always-on "build worker" with Node + esbuild bundled in** | Avoids GitHub. Cloudflare-native. | More complex. Bundle size constraints (Workers have 1MB / 10MB limits). |

**My recommendation: A (template strings in ops worker).** Reasons:
- Fastest iteration loop
- No new infra dependencies
- Forces template designs to be simple/clean (good thing for a
  small-business website service — not a CMS)
- We can always escape-hatch to B later if a template needs heavier
  build steps

But it constrains us to "static brochure-ware" — no client-side
React, no Next.js routing, no hydration. The site is HTML + CSS +
~1KB of vanilla JS for things like mobile nav toggle. Per the brand
positioning ("flat-fee modular sites for UK trades") this is
probably what we want anyway, but worth being explicit.

**Need your call**: A, B, C, or D?

### Decision 2 — Template format

Given Option A above, the template format is "TypeScript functions
that return HTML strings", parametrized with intake data:

```typescript
function modernTemplate(props: {
  business: BusinessInfo;
  modules: ModuleConfig;
  brandAssets: { logoUrl: string; photoUrls: string[] };
  vibe: "modern";
}): { "index.html": string; "styles.css": string; "favicon.ico": Uint8Array }
```

Each template is one TypeScript module that exports a render
function. The output is a map of static asset paths → file
contents, which gets uploaded as a Workers Static Assets bundle.

**Alternatives considered**: JSX-on-server (e.g. Preact server-only
render), Mustache/Handlebars, Edge Side Includes. JSX-on-server
would be tidier for the templates but adds runtime weight. Plain
template literals are simpler and good enough.

**Need your call**: TypeScript template functions OK, or do you
prefer a templating language (Mustache, etc.)?

### Decision 3 — Visual direction for the 4 vibes

This is the SLOW part — designing 4 distinct, polished templates.
Each needs:
- Hero section
- Services/about section (driven by Phase 2/3 intake answers)
- Module-specific sections (booking embed, enquiry form, etc.)
- Footer with NAP (name/address/phone) for local SEO

**Need your input**: do you have…
- Existing design references for any of the 4 vibes
  (`traditional` / `modern` / `premium` / `friendly`)?
- Sites you admire in the UK trades / small-business space?
- Brand colors that should anchor each vibe?
- A preference between (a) shipping ONE polished template + the
  pipeline first, then iterating to 4 vs (b) designing all 4 in
  parallel before shipping any?

**My recommendation**: ship ONE template + pipeline first
(C5.1 → C5.4 → C5.5 below). Use Lucas as the test customer. Iterate
on that template based on real feedback before adding 3 more.

### Decision 4 — Where templates live in the repo

```
src/lib/site-generator/
├── README.md
├── types.ts                    # Shared input contract
├── shared/
│   ├── modules/
│   │   ├── booking.ts          # Cal.com embed renderer
│   │   ├── enquiry.ts          # Enquiry form renderer
│   │   ├── newsletter.ts       # Newsletter signup renderer
│   │   └── gbp.ts              # GBP embed renderer
│   ├── seo.ts                  # OpenGraph, JSON-LD, robots
│   ├── analytics.ts            # Plausible / GA stub
│   └── styles/
│       ├── reset.css
│       └── tokens.css          # CSS custom properties shared across vibes
├── templates/
│   ├── modern/
│   │   ├── index.ts            # Main render function
│   │   ├── hero.ts
│   │   ├── services.ts
│   │   ├── styles.css
│   │   └── README.md
│   ├── traditional/  (later)
│   ├── premium/      (later)
│   └── friendly/     (later)
└── render.ts                   # Orchestrator: vibe + props → asset map
```

Each module integration is its own renderer (booking.ts emits the
HTML/CSS for the booking section; called by templates as needed).
Templates compose them in their layout. Standardised, testable.

### Decision 5 — Edit-application strategy

When customer submits an edit ("change phone number", "swap hero
photo", "rewrite services blurb"), how do we apply it?

| Option | Pros | Cons |
|---|---|---|
| **A. Re-render from updated intake data** | Pure — edits become diffs to the intake JSON, then re-generate. Auditable. Idempotent. | Limits edits to fields the intake captures. "Add a new section" requires intake schema extension. |
| **B. Patch the rendered HTML** | Maximum flexibility — any change possible | Loses the deterministic build. Diffing HTML is fragile. Drift over re-renders. |
| **C. Hybrid: structured edit types + free-form fallback to operator** | Common edits are atomic + auditable; weird ones go to you for manual handling | Most code, most product surface |

**My recommendation: C.** Define a vocabulary of structured edit
types (e.g. `replace_text`, `swap_image`, `update_business_info`)
that auto-apply via re-render with patched intake; anything not
matching falls into the operator queue.

Per arch doc §11 risk tiers: Low edits auto-apply; Medium runs in
shadow mode for the first 10 invocations of any new edit type; High
always goes to you.

### Decision 6 — Data contract (intake → template input)

Today the intake captures fields scattered across:
- Phase 2 Data (qualification — modules they want, vibe, GBP, etc.)
- Phase 3 Data (intake — services list, hours, photos, copy)
- Onboarding Data (Hub state — Cal.com URL, Resend email, GBP URL,
  brand assets)

The site generator needs ONE consolidated input shape. I'll add
`src/lib/site-generator/data-contract.ts`:

```typescript
type SiteGeneratorInput = {
  business: { name, type, location, phone, email, address, hours };
  copy: { tagline, aboutBlurb, servicesIntro };
  services: Array<{ name, description, priceFrom?, durationMinutes? }>;
  modules: { booking?: {...}, enquiry?: {...}, newsletter?: {...}, gbp?: {...} };
  brandAssets: { logoUrl, heroPhotoUrl, galleryPhotoUrls[] };
  vibe: "traditional" | "modern" | "premium" | "friendly";
};
```

Plus a `prospect → SiteGeneratorInput` adapter that pulls from the
three Notion JSON blobs. This adapter is the "fail-fast" gate — if
the intake is incomplete, generator throws clearly instead of
producing a half-built site.

---

## Phased delivery plan

Each phase ships independently to main; the pipeline is incrementally
useful even mid-build (e.g. the auto-deploy infra works the same way
for the placeholder Worker as for a future generated site).

### C5.1 — Foundation (~2 days)
- `src/lib/site-generator/data-contract.ts` + adapter from prospect
- `src/lib/site-generator/render.ts` — orchestrator stub returning
  `{ "index.html": "..." }`
- `src/lib/site-generator/__tests__/data-contract.test.ts`
- One end-to-end vitest: feed a fake prospect → assert HTML output
  contains the business name

### C5.2 — Modern template (~5-7 days)
- `templates/modern/` directory with hero, services, footer
- CSS + responsive design (mobile-first)
- Test fixture rendering with all module combos
- Visual review — you (Ben) tell me when it looks right

### C5.3 — Module integrations (~2-3 days)
- Cal.com embed (Online Booking)
- Enquiry form (HTML + JS that POSTs to a per-customer endpoint)
- Newsletter signup (HTML + JS to Resend audience)
- GBP "find us on Google" embed

Each module renderer is a tested function. Templates call them
based on which modules the customer bought.

### C5.4 — Auto-deploy pipeline (~2-3 days)
- New ops worker step: `step3-site-build.ts`
- shouldRun gate: `previewSubmittedAt` set + no `previewUrl` yet
- Pulls prospect → renders site → uploads as Worker Static Assets
  to customer's account → stamps `previewUrl` in Notion
- On success: customer auto-emailed `preview-ready` template
  (already built today)
- On failure: writes Cowork exception, escalates to you

### C5.5 — Edit-application engine (~3-5 days)
- Structured edit vocabulary (~10 edit types)
- Edit submission UI in Hub Step 5 (already exists in skeleton —
  the 3-cap edits queue)
- Per-edit risk-tier gate (§11)
- Re-render + re-deploy on apply
- Audit log entry per edit

### C5.6 — Templates 2-4 (~6-9 days)
- `traditional`, `premium`, `friendly`
- Each follows the modern template's structure but with its own
  visual language
- Customer picks vibe in Phase 2 qualification (already captured)

### C5.7 — Go-live cron (~1-2 days)
- New ops worker step: `step4-go-live.ts`
- shouldRun gate: status = `Onboarding Complete`, go-live date
  reached, customer has signed off
- Atomic Worker swap (preview Worker code → production Worker code,
  same Worker name so the bound DNS routes don't change)
- Status flips to `Live`; customer emailed; `Site Live At`
  timestamp updated

### C5.8 — Production hardening (~2 days)
- Worker bundle size monitoring (1MB free, 10MB paid)
- Per-customer usage dashboards / alerts
- Failure-mode runbook
- Rollback path (re-deploy previous Worker version)

---

## Total effort

~ 23-33 days of focused work. Spread across however many calendar
weeks suits — "no rush" per your direction.

Suggested ordering: 5.1 → 5.2 → 5.4 (so Lucas can field-test the
auto-pipeline with one template) → 5.3 → 5.5 → 5.6 → 5.7 → 5.8.

---

## Decisions confirmed (2026-05-09, then revised)

**FINAL:** Option 1 — full Next.js per customer + GitHub Actions builds.

Initial direction was Option 2 (template strings in ops worker).
A minimal slice was built (C5.1 foundation + minimal modern
template + C5.4 bundler/upload pipeline), and Lucas's preview was
deployed at https://test09052026moduforge.store/ as a visual
proof point. That validated visual quality but surfaced four
real gaps that all push toward Option 1:

  1. Multi-page navigation needed (Option 2: ~7d template rewrite;
     Option 1: free with Next.js routing)
  2. Rich services structure + Haiku copy assist (same in both)
  3. Asset rendering broken in Option 2 (R2 public URL config
     gap); Option 1 uses next/image, automatic
  4. Enquiry form missing in modern template; Option 1 uses Server
     Actions + reuses marketing site's `EnquiryForm.tsx` directly

Cost recalculation under fully-featured scope:
  - Option 2 fully featured: ~36-48 more dev days
  - Option 1 fully featured: ~24-31 more dev days
  - Option 1 saves ~12-17 dev days + £4/mo operational + better
    long-term maintainability (one stack vs two)

Edit-cycle speed is the only Option 2 win (5s vs 3min) — and
it's irrelevant under the 3-edit/month customer cap.

1. **Build environment: Option 1 (CONFIRMED)** — full Next.js
   site-template repo, built per-customer in GitHub Actions, deployed
   via Wrangler to each customer's per-customer Cloudflare Worker.
   Same stack as the marketing site (Next.js 15 + React 19 + Tailwind
   + OpenNext on Workers). ~3 min build per preview/edit, fine under
   the customer cap.

2. **Brand colours**: customer picks BOTH primary AND secondary
   from a colour wheel in Phase 3 intake (`react-colorful`, ~3KB
   each). Templates inject as `--brand-primary` / `--brand-
   secondary` CSS custom properties, plus auto-generated tonal
   scales (50-900) and accessible text-on-accent colours. Picker
   UI deferred — for first Lucas test, hardcode in Notion.

3. **Dynamic backgrounds**: in scope. Default is animated CSS
   gradients (primary→secondary loop) + scroll-triggered fade-ins
   + subtle mouse-tracking hero glow (~3KB vanilla JS total). Each
   vibe template can override with its own visual treatment
   (canvas particles, video bg, distortion shaders if warranted).

4. **Templates**: standardised across vibes — same component
   skeleton (hero / about / services / module sections / contact /
   footer), differentiated by CSS + layout choices per vibe.
   Reference: marketing site's design language.

5. **Edit-application strategy: Option C** — hybrid. Structured
   edit vocabulary (`replace_text`, `swap_image`, `update_business_info`
   etc.) auto-applies via re-render with patched intake. Free-form
   edits fall back to the operator queue.

6. **All 4 templates designed in parallel** (not iteratively).
   Adds ~6-8 days upfront but produces a coherent, standardised
   set rather than 4 styles that look like they were designed by
   4 different people.

## Phased delivery (Option 1, revised after Lucas preview)

**Already shipped (transfers to Option 1)**:
- C5.1 Foundation: data contract types + prospect adapter +
  colour-scale generator. All pure functions, no I/O coupling.
  These directly feed the new pipeline as build inputs. Tests pass.

**Already shipped (deleted in switch)**:
- Bundler (`bundle.ts`) — replaced by Wrangler deploy from CI.
- Modern template HTML/CSS strings — replaced by Next.js components.
- Escape utility (`escape.ts`) + tagged-template `html` helper —
  Next.js JSX handles escaping automatically.
- Step5-review's auto-build code — replaced by GitHub Actions
  trigger from the same step.

**Next sub-phases**:

**C5.2 — Customer-site-template Next.js scaffold (~3-4d)**
- New `/customer-site-template/` Next.js project (App Router)
- Layout + nav + multi-page routing (Home, About, Services,
  Contact, optional Booking page when module set)
- Reuse marketing-site components (Header, Footer, EnquiryForm)
- Tailwind config that consumes brand colour CSS variables
- Build configured for static export OR SSR-on-Workers (TBD)
- Local-dev mode with hardcoded fixture data

**C5.3 — Asset tagging redesign (Step 4) (~3-4d)**
- Onboarding Step 4 redesigned with semantic upload buckets:
  Logo, Hero photo, Services photos (mapped per service), About-us
  team photo, Background images, Gallery
- Notion schema additions for the role metadata
- Adapter updates to pull each asset by role
- Customer-site-template uses next/image to render with
  automatic WebP + responsive sizes

**C5.4 — Build pipeline (~4-5d)**
- GitHub Actions workflow:
  - Triggered by repository_dispatch event from ops worker
  - Pulls customer's intake JSON via Notion API
  - Runs `npx next build` with the data
  - Uploads via `wrangler deploy --account-id <customer>` to
    customer's per-customer Worker
- Ops worker: replace step5-review's bundle-and-upload with a
  GitHub API call to trigger the workflow
- Wrangler authentication: customer Cloudflare API token (we
  already have user-scoped token from C2.3)
- Per-build timeout + status reporting back to Notion

**C5.5 — Rich services step + Haiku copy assist (~5-6d)**
- New Hub Step 6 (or expanded Phase 3 intake): "Tell me about
  your services" — bullet entry per service + about-us bullets
- Anthropic SDK in ops worker (Haiku 3.5)
- Per-section copy generation: bullets → polished marketing copy
- Generated copy cached in Notion (re-renders skip Haiku)
- On-edit re-generation flow

**C5.6 — Enquiry form + per-customer backend (~2-3d)**
- Reuse marketing-site `EnquiryForm.tsx` component in customer-
  site-template
- Server Action posts to customer's Resend transactional
- Anti-spam: honeypot + rate-limit (one submission per IP per minute)
- Customer notification + auto-reply

**C5.7 — Templates 2-4 (~4-6d for all 3)**
- CSS-only differentiation from the shared chassis (one Next.js
  app, four CSS variants picked by customer's vibe)
- Visual review per template

**C5.8 — Edit-application engine (~3-5d)**
- Structured edit vocabulary, risk-tier gate (§11)
- Apply edits: re-render + re-trigger CI build
- Edit submission UI (skeleton already exists in Hub Step 5)

**C5.9 — Go-live cron (~1-2d)**
- Trigger: status = Onboarding Complete + go-live date reached
- Same build pipeline; just retag the deploy as production
- Status flips to Live

**C5.10 — Production hardening (~2d)**
- CI failure handling (retry + escalation)
- Per-customer alerts (build failures, deploy failures)
- Rollback path (deploy previous git SHA's build output)

**Total Option 1 remaining: ~24-31 dev days.**

Sequence so Lucas can field-test the real thing earliest: C5.2 →
C5.3 → C5.4 (gives Lucas a real Next.js preview at end of week 2)
→ C5.5 → C5.6 → C5.7 → C5.8 → C5.9 → C5.10.
