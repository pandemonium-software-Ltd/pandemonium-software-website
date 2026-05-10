# Customer site template

Next.js 15 / React 19 / Tailwind site template that gets built
**per customer** by the GitHub Actions pipeline (Stage 2C C5.4) and
deployed to that customer's per-customer Cloudflare Worker.

## How it works

1. The ops worker triggers a GitHub Actions workflow with the
   prospect's token.
2. The workflow pulls the prospect's full intake state from Notion,
   normalises it via the same `adaptProspect` adapter the marketing
   site uses (`src/lib/site-generator/adapter.ts`), and writes the
   result to `customer-site-template/src/data/site-data.json`.
3. `next build` runs against this template with the data baked in.
4. `wrangler deploy` uploads the build output to the customer's
   Worker (using the customer's Cloudflare account ID we captured in
   Stage 2C C2.1).
5. Ops worker stamps `previewUrl` in Notion → customer's hub Step 5
   advances to Phase 3 (iframe preview).

## Local development

For iterating on visuals without running the build pipeline:

```bash
cd customer-site-template
npm install
npm run dev
```

The dev server reads from `src/data/fixture.json` (committed)
instead of `src/data/site-data.json` (gitignored, only present in CI
builds). The fixture is realistic enough to evaluate every page +
component combo.

## Per-vibe theming

One Next.js codebase, four CSS variants. The customer's chosen vibe
(`traditional` / `modern` / `premium` / `friendly`) drives:
- Which `data-vibe="<name>"` attribute the layout sets on `<html>`
- Which CSS rules apply (each vibe has its own selectors in
  `src/app/vibes/<name>.css`)
- Optional layout differences (e.g. premium has wider gutters,
  friendly has rounded corners by default)

The customer's brand colours (primary + secondary) are injected as
CSS custom properties in `<head>`'s inline `<style>` block, so
`var(--brand-primary-500)` etc. resolve to their picks regardless
of vibe.

## What's NOT here yet

This scaffold is C5.2 — the chassis. Subsequent sub-phases add:
- C5.3: asset-tagging redesign in onboarding + `next/image` usage
- C5.4: GitHub Actions workflow + Wrangler deploy from CI
- C5.5: Haiku copy generation pipeline
- C5.6: enquiry form + per-customer backend
- C5.7: vibe variants 2-4
- C5.8: edit-application engine
- C5.9: go-live cron
- C5.10: production hardening

See `docs/STAGE-2C-C5-PLAN.md` in the repo root.
