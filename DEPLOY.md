# Deploy & change management

Master-plan workstream **0.1 — Branch strategy & staging environment**.
Goal: never test on live clients. Every change proves itself on **staging**
before it reaches **production** (modu-forge.co.uk).

## Stack (so the staging design is correct)

- Marketing site: **Next.js → OpenNext → Cloudflare Workers**. Deploy with
  `npm run deploy` (build + `opennextjs-cloudflare deploy`). Config:
  `wrangler.jsonc`.
- Ops cron: a **second Worker**, `npm run deploy:ops` (`wrangler-ops.jsonc`).
- Bindings: D1 `pandemonium_analytics`, R2 `moduforge-customer-assets`,
  plus Notion / Stripe / Resend / Anthropic via secrets.
- **Not Cloudflare Pages** — staging must be a second Worker (wrangler
  environment), not a Pages preview.

## Target branch model

- `main` → production (modu-forge.co.uk).
- `staging` → staging Worker (e.g. `staging.modu-forge.co.uk` or the
  `*-staging.workers.dev` URL).
- `feature/*` → short-lived; PR into `staging`, verify, then PR into `main`.

Flow: **feature → PR → staging → verify on staging → PR → main → deploy**.
No production deploy without (a) a green `preflight` (0.4) and (b) a staging
check of anything user-facing.

## Staging environment — what it must have (provably isolated)

Staging must **never** touch production data or send real client emails:

| Concern | Production | Staging |
|---|---|---|
| Stripe | live keys (at go-live) | **test** keys (`sk_test_…`) |
| Notion | prod prospect/client DBs | **separate staging DBs / workspace** |
| Resend | live sender | sandbox / test sender |
| D1 / R2 | prod bindings | separate staging D1 + R2 |
| Cal.com | live | test config |

## Setup steps

**Code/config (in this repo):**
1. Add a `staging` environment to `wrangler.jsonc` (`env.staging`) with its
   own `name`, route, and bindings (separate D1 + R2 ids).
2. Add scripts: `deploy:staging` (`opennextjs-cloudflare deploy --env staging`)
   and `deploy:ops:staging`.
3. Create the `staging` branch.

**Provisioning (needs Ben — account-level, can't be done from code):**
1. Create a **staging D1 database** and **staging R2 bucket**; note their ids.
2. Create **staging Notion databases** (or a staging workspace) and an
   integration token.
3. Use Stripe **test** keys + a test webhook endpoint pointing at staging.
4. Set staging secrets on the staging Worker:
   `wrangler secret put <NAME> --env staging` for `NOTION_API_KEY`,
   `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET` (test),
   `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, etc.
5. Pick the staging hostname (subdomain or workers.dev) and add the route.

## Definition of Done (0.1)

- [ ] `staging` deploys to a separate URL with separate env vars — a visible
      test change appears on staging but not production.
- [ ] A test payment / write on staging creates **nothing** in production
      (Stripe / Notion / Resend provably isolated).
- [ ] This `DEPLOY.md` followed once end-to-end.

## Regression / preflight (0.4 — related)

Add `npm run preflight` = `tsc --noEmit` + `vitest run` + `npm audit`, run
before every production deploy. Every fixed bug gets a regression test first.
