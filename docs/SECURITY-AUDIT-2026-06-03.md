# Security audit — 2026-06-03

Follow-up audit against the 2026-05-13 baseline. Same scope +
21 new API endpoints added since last audit (50 total, up from 29).
Pure static analysis + manual code review + `npm audit`.

**Bottom line:** Previous MEDIUM findings M1/M2/M3/M6 are fixed.
M4/M5 remain open (accepted risk). Stripe webhook verification
now implemented (was flagged as TBD). Two new MEDIUM findings
and one new LOW. Dependency profile shifted: old Next.js HIGHs
resolved, new moderate-severity transitive deps appeared.

---

## Previous findings — status update

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| M1 | API routes missing session cookie | MEDIUM | **FIXED** — `requireCustomerSession()` applied to 16/17 routes. 1 exception: `dns-confirm` (GET from email link, no session possible). Accepted. |
| M2 | SVG uploads allowed | MEDIUM | **FIXED** — `image/svg+xml` removed from `ALLOWED_TYPES`. Upload route returns friendly error directing customers to convert to PNG. |
| M3 | Next.js HIGH-severity advisories | MEDIUM | **FIXED** — upgraded to Next.js 15.5.18. Both GHSA advisories resolved. |
| M4 | In-memory login rate limit | MEDIUM | **OPEN (accepted)** — still `Map<string, RateState>` in memory. KV migration not implemented. Risk bounded by password entropy + per-token isolation. |
| M5 | No per-IP rate limit on public endpoints | MEDIUM | **OPEN (accepted)** — honeypot + subscriber cap in place. No Cloudflare WAF rate rule or KV counter added. |
| M6 | Subscribe widget missing honeypot | MEDIUM | **FIXED** — `hp` field + silent-drop pattern added to both widget and `/api/public/subscribe`. |
| L1 | PBKDF2 iterations below OWASP 2023 | LOW | **OPEN** — still 100,000. Acceptable for Workers CPU budget. |
| L2 | Public CORS `*` | LOW | **OPEN (by design)** — all 5 wildcard-CORS endpoints are public-only, no credentials. |
| L3 | `fast-xml-builder` HIGH (transitive) | LOW | **OPEN** — still via `@opennextjs/cloudflare` → `@aws-sdk`. No code path exercises it. |
| L4 | `dangerouslySetInnerHTML` (all benign) | LOW | **OPEN** — 4 usages now (was 3). New: `AdminGrantPanel.tsx:147` renders compile-time constant `r.helper`. No user input. Safe. |
| L5 | No CSP header | LOW | **OPEN** — `public/_headers` still has no Content-Security-Policy. |
| Info | Stripe webhook signing | INFO | **FIXED** — `verifyStripeWebhook()` in `src/lib/stripe.ts` uses `stripe.webhooks.constructEventAsync()` with `STRIPE_WEBHOOK_SECRET`. |

---

## New findings

### N1 — `/api/prospect/[token]` exposes customer email without auth (MEDIUM)

**Location:** `src/app/api/prospect/[token]/route.ts:54-60`

**Issue:** GET endpoint returns `name`, `email`, `business`,
`businessType`, `status` for any valid token. No session cookie
check, no rate limit. Designed for the qualify/intake pages
(pre-login), but the email field is sensitive — confirms a
token→email relationship if an attacker has a leaked token.

**Impact:** token-leaked attacker learns the customer's email
address. Combined with business name, this enables targeted
phishing. The qualify/intake pages only need `name` and
`business` for the header — `email` is not rendered.

**Mitigations already in place:**
- UUIDv4 tokens (122 bits) — not guessable
- HSTS + strict Referrer-Policy — token not leaked via transit

**Remediation:** Remove `email` from the response. If the intake
page needs it, gate that behind a session check or serve it from
a separate authenticated endpoint.

```diff
  return NextResponse.json({
    name: prospect.name,
-   email: prospect.email,
    business: prospect.business,
    businessType: prospect.businessType,
    status: prospect.status,
  });
```

Estimated effort: 5 min. Verify intake page doesn't render email.

### N2 — Raw error messages leaked to API clients (MEDIUM)

**Location:** Multiple routes expose `e.message` or `String(e)`
in JSON error responses, potentially leaking Notion API errors,
Haiku API errors, or other server internals.

**Affected routes (9):**

| Route | Line(s) | What leaks |
|-------|---------|-----------|
| `/api/internal/site-data` | 95-98 | Unhandled exception message |
| `/api/admin/preview-template` | 99 | Template engine internals |
| `/api/account/newsletter/subscribers` | 145, 207 | `"Notion write failed: ${e.message}"` |
| `/api/admin/cowork-apply` | 84 | Haiku API error |
| `/api/admin/review-edit` | 238 | Classify + apply error |
| `/api/account/cancel` | 92 | Eligibility check error |
| `/api/account/multilocation` | 91 | Eligibility check error |
| `/api/account/module-change` | 92 | Eligibility check error |
| `/api/admin/cowork-retry` | 105 | Haiku unreachable error |

**Impact:** Information disclosure. Notion API errors can reveal
internal property names, database IDs, or rate limit details.
Haiku API errors can reveal Anthropic account state. Eligibility
errors may reveal business logic.

**Mitigations:**
- Admin routes (`/api/admin/*`) are behind Basic Auth, so only
  Ben sees these — acceptable for operator debugging.
- Customer-facing routes (account/newsletter, account/cancel,
  account/multilocation, account/module-change) are the real risk.

**Remediation:** For customer-facing routes, return generic
messages and log the real error server-side:
```ts
console.error(`[route] ${e instanceof Error ? e.message : String(e)}`);
return NextResponse.json(
  { error: "Something went wrong. Please try again." },
  { status: 500 },
);
```

Estimated effort: 20 min for 4 customer-facing routes.

### N3 — Vitest CRITICAL advisory (dev-only) (LOW)

**Location:** `vitest` dev dependency.

**Issue:** GHSA-5xrq-8626-4rwp — when Vitest UI server is
listening, arbitrary files can be read and executed. CVSS 9.8.

**Impact:** Zero production impact — vitest is a devDependency,
never bundled or deployed. Only affects the local dev machine
when `vitest --ui` is running AND the machine is network-
reachable. Standard `vitest` (headless) is not affected.

**Remediation:** `npm install vitest@latest` when convenient.
Not blocking.

---

## Dependency audit — 2026-06-03

```
npm audit: 14 vulnerabilities (13 moderate, 1 critical)
```

| Package | Severity | Via | Production? | Notes |
|---------|----------|-----|-------------|-------|
| vitest | CRITICAL | Direct dev dep | No | UI server file read (N3 above) |
| postcss | moderate | next → postcss | Yes (build) | XSS in CSS stringify — no user CSS input |
| esbuild | moderate | vite → esbuild | No (dev) | Dev server request forgery |
| brace-expansion | moderate | glob/ts-estree | No (dev) | Large range DoS |
| qs | moderate | Direct/transitive | Possibly | DoS on `qs.stringify` with null entries — no user-controlled qs.stringify calls |
| ws | moderate | miniflare → ws | No (dev) | Uninitialized memory disclosure |

**Key dependency versions:**
- Next.js: ^15.5.18 (current, patched)
- React: ^19.1.0
- Stripe SDK: via `stripe` package (webhook verification confirmed)
- Anthropic SDK: used via `@anthropic-ai/sdk` for Haiku classification

---

## What's working well (confirmed still secure)

| Area | Status | Evidence |
|------|--------|----------|
| Hardcoded secrets | ✓ none | Grep for `sk_*`, `pk_live`, `service_role`, password literals — clean |
| `.dev.vars` / `.env` gitignored | ✓ | Confirmed |
| Password hashing | ✓ PBKDF2-SHA256 100k iter + per-record salt + constant-time compare | `src/lib/auth/password.ts` |
| Admin auth | ✓ Basic auth + timing-safe compare | `src/middleware.ts` |
| Customer session JWT | ✓ HS256, signature-first, token-bound, 7-day TTL | `src/lib/auth/session.ts` |
| Session cookie binding on API routes | ✓ 16/17 routes | `requireCustomerSession()` — only exception is email-link GET |
| Login rate limit | ✓ 10/5min per token (in-memory) | `src/app/api/login/[token]/route.ts` |
| Password reset rate limit | ✓ 5/hour per token | `src/app/api/login/[token]/reset/route.ts` |
| Generic login failure messages | ✓ no token-existence leak | Dummy-hash verify when prospect=null |
| Open-redirect protection | ✓ `returnTo` must start with `/` + contain token | Login route |
| Internal API auth | ✓ timing-safe `x-internal-secret` on 2 routes, Svix HMAC on webhook | All `/api/internal/*` |
| CSRF mitigation | ✓ token from body, not cookie | All account API routes |
| Security headers | ✓ HSTS preload, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | `public/_headers` |
| File upload caps | ✓ 5 MB per file, MIME allowlist (no SVG), filename sanitisation | Both upload routes |
| File path traversal | ✓ `safeFilename()` strips path separators + lowercases | Both upload routes |
| SSRF | ✓ all outbound fetches use hardcoded hostnames | No user-controlled URLs |
| `eval()` / `new Function()` | ✓ none found | Full grep of src/ |
| SQL injection | ✓ no string-concatenated SQL | D1 queries use parameterised bindings |
| Honeypot on enquiry + subscribe | ✓ both widgets + server routes | Silent-drop pattern |
| Stripe webhook verification | ✓ `constructEventAsync` + signing secret | `src/lib/stripe.ts` |
| Sentry webhook verification | ✓ HMAC-SHA256 signature check | `src/app/api/webhooks/sentry/route.ts` |
| Email injection | ✓ HTML-escaped, Resend JSON API | `escapeHtml()` in `notify.ts` |
| Token truncation in logs | ✓ `.slice(0, 8)` pattern | Consistent across routes |
| Zod input validation | ✓ all POST/PATCH/DELETE routes | No unvalidated routes found |
| `dangerouslySetInnerHTML` | ✓ 4 usages, all compile-time constants | No user input flows |
| Public CORS `*` | ✓ public-only endpoints | No credentialed routes exposed |

---

## Recommended remediation order

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | **N1 — Remove email from `/api/prospect/[token]`** | 5 min | Closes PII leak on unauthenticated endpoint |
| 2 | **N2 — Sanitise error messages** (customer-facing routes only) | 20 min | Prevents server internal leakage |
| 3 | **N3 — Update vitest** | 5 min | Clears critical npm audit finding |
| 4 | **L5 — Add CSP header** | 30 min | Defence-in-depth against XSS |
| Backlog | **M4 — KV-backed login rate limit** | 2 hrs | Defence-in-depth (low practical risk) |
| Backlog | **M5 — Cloudflare WAF rate rule** | 15 min (CF dashboard) | Bot mitigation on public endpoints |

Total for top 3: ~30 min.

---

## Scope — 50 API endpoints audited

### Account (12)
`analytics/[token]`, `analytics/[token]/newsletter`, `billing-portal`,
`cancel`, `change-request`, `module-change`, `multilocation`,
`newsletter`, `newsletter/subscribers`, `preview-newsletter`,
`upload-newsletter-image`, `upload-photo`

### Admin (14)
`analytics`, `change-request`, `cowork-apply`, `cowork-retry`,
`diagnose-github`, `dictate-patch`, `grant-allowance`, `grant-module`,
`module-change`, `preview-digest`, `preview-template`, `preview-url`,
`resolve-exception`, `review-edit`, `sentry/resolve`, `unlock-step`

### Onboarding (5)
`dns-confirm/[token]`, `module-change`, `review-edit`, `route`,
`upload`

### Internal (3)
`build-callback`, `resend-webhook`, `site-data`

### Public (5)
`confirm-subscription`, `enquiry`, `gbp-reviews`, `subscribe`,
`unsubscribe`

### Webhooks (2)
`stripe`, `sentry`

### Other (9)
`enquiry` (root), `intake`, `login/[token]`, `login/[token]/reset`,
`payment/checkout`, `prospect/[token]`, `qualify`

---

## Tools used

- 6 parallel code-review agents (Claude Code sub-agents)
- `npm audit` (14 vulns: 13 moderate, 1 critical dev-only)
- ripgrep for secrets, eval, SQL injection, CORS, PII patterns
- Manual code review of all new endpoints since last audit
- Cross-reference against OWASP Top 10 2021

Next audit: quarterly, or after major auth / new-public-endpoint changes.
