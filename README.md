# Pandemonium Software Ltd — Marketing Website

The marketing site for **Pandemonium Software Ltd**, a small Oxfordshire software
business that builds professional websites for UK tradesmen.

This is **not** a client site template. For the reusable trades site template, see
[`trades-website-template`](https://github.com/pandemonium-software-Ltd/trades-website-template).

## Stack

- **Next.js 14** (App Router, TypeScript)
- **React 18**
- **Tailwind CSS 3**
- Fonts: Fraunces (serif) + Inter (sans), via `next/font/google`
- Deployed on **Vercel**

## Pages

| Route       | Purpose                                                        |
| ----------- | -------------------------------------------------------------- |
| `/`         | Homepage — hero, what you get, how it works, trust, CTA        |
| `/pricing`  | Live interactive pricing calculator + FAQ                      |
| `/about`    | Ben Pandher's short, honest story                              |
| `/intake`   | Placeholder for the full Stage 2 intake form                   |
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
npm start
```

## Design tokens

- Primary: `navy` — deep navy, trustworthy
- Accent: `ember` — warm orange
- Surface: `cream` — warm neutral
- Serif: Fraunces · Sans: Inter

## Deliberately out of scope (Stage 2 / 3)

- Full intake form and client onboarding flow
- Stripe checkout
- Plausible analytics
- Real client testimonials and photography
- Real business email address (currently `benpandher@proton.me`)

## Licence

All rights reserved © Pandemonium Software Ltd.
