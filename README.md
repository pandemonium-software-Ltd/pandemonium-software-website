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
- **Cloudflare Pages** (static hosting — matches the Playbook's client-site stack)

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

## Deploying to Cloudflare Pages

Git integration handles deployment automatically: push to `main` and
Cloudflare Pages picks up the change, runs `npm run build`, and publishes
`./out/`.

Manual deploy (if needed):

```bash
npx wrangler pages deploy out --project-name pandemonium-software-website
```

Security headers live in [`public/_headers`](./public/_headers) — Cloudflare
Pages' native format — not `next.config.mjs`, because `output: 'export'` is a
no-op for Next.js's `headers()` function.

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
- Custom domain (currently using a `.pages.dev` subdomain)

## Licence

All rights reserved © Pandemonium Software Ltd.
