# Pandemonium Software Ltd — Marketing Website

The marketing site for **Pandemonium Software Ltd**, a small Oxfordshire software
business that builds professional websites for UK trades and small businesses.
Proudly Oxfordshire-based, serving the UK.

This is **not** a client site template. For the reusable trades site template, see
[`trades-website-template`](https://github.com/pandemonium-software-Ltd/trades-website-template).

## Stack

- **Next.js 14** (App Router, TypeScript, static export via `output: 'export'`)
- **React 18**
- **Tailwind CSS 3**
- Fonts: Fraunces (serif) + Inter (sans), via `next/font/google`
- **Cloudflare Workers** (Static Assets) — serving `./out` via `wrangler.jsonc`

## Pages

| Route       | Purpose                                                        |
| ----------- | -------------------------------------------------------------- |
| `/`         | Homepage — hero, what you get, how it works, trust, CTA        |
| `/pricing`  | Live interactive pricing calculator + FAQ                      |
| `/contact`  | Enquiry form (mailto submit) + direct email                    |
| `/about`    | Ben Pandher's short, honest story                              |
| `/privacy`  | UK GDPR-compliant privacy policy for Pandemonium Software Ltd  |
| `/terms`    | Simplified working-agreement terms of service                  |
| `/*`        | Custom friendly 404 page                                       |

## Running locally

```bash
npm install
npm run dev
```

Opens on <http://localhost:3000>.

## Build

```bash
npm run build
```

Produces a fully static site in `./out/`. No Node.js runtime is required in
production.

To preview the built output locally:

```bash
npx serve out
```

## Deploying to Cloudflare Workers

Git integration handles deployment automatically: push to `main` and
Cloudflare clones the repo, runs `npm run build`, then runs `npx wrangler
deploy` which reads [`wrangler.jsonc`](./wrangler.jsonc) and uploads `./out/`
as [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).

Manual deploy (if needed):

```bash
npm run build
npx wrangler deploy
```

### Why Workers Static Assets, not Pages / OpenNext

Cloudflare's framework auto-detection will try to deploy a Next.js app
with the OpenNext SSR adapter. OpenNext only supports Next.js 15.5+ and
16.2+, and we're pinned to Next.js 14.2.x for security parity with the
`trades-website-template` (Playbook Section 12). More importantly, this
site is a pure static export — there's no SSR code to run.

`wrangler.jsonc` short-circuits all of that. It declares the project as
a Worker with `assets.directory: ./out` and no `main` script, so wrangler
just uploads the `out/` folder verbatim. The deployed "Worker" is a
0.34 KiB asset manifest — no server code at all.

Security headers live in [`public/_headers`](./public/_headers) —
respected by both Cloudflare Pages and Workers Static Assets — not
`next.config.mjs`, because `output: 'export'` is a no-op for Next.js's
`headers()` function.

## Design tokens

- Primary: `navy` — deep navy, trustworthy
- Accent: `ember` — warm orange
- Surface: `cream` — warm neutral
- Serif: Fraunces · Sans: Inter

## Deliberately out of scope (Stage 2 / 3)

- Full intake form and client onboarding flow (currently a simple enquiry form)
- Stripe checkout
- Plausible analytics
- Real client testimonials and photography
- Real business email address (currently `benpandher@proton.me`)
- Custom domain (currently using a `.workers.dev` subdomain)

## Licence

All rights reserved © Pandemonium Software Ltd.
