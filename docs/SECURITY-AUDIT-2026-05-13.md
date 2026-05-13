# Security audit — 2026-05-13

Comprehensive code-level audit of the ModuForge marketing-site +
customer-site-template + ops-worker. No live penetration / DAST
in scope; pure static analysis + manual review.

**Bottom line:** no critical vulnerabilities. Auth is solid for
pages, defence-in-depth gap on API routes. Six MEDIUM findings
worth addressing in the next sprint, five LOW for future tidy.

## Scope audited

- All HTTP routes (29 API endpoints + 14 page routes)
- Authentication + session management (`src/lib/auth/*`)
- File upload pipeline (`/api/onboarding/upload`,
  `/api/account/upload-newsletter-image`)
- All public-facing CORS routes (`/api/public/*`,
  `/api/internal/*`)
- Outbound HTTP / SSRF surface
- Dependency vulnerabilities (`npm audit` both workspaces)
- Security headers (`public/_headers`)
- Logging / sensitive data exposure
- Email injection / template injection

Out of scope: live penetration testing, browser-side DAST,
infrastructure config (Cloudflare WAF rules, DNS), code we don't
own (Next.js / Resend SDK / Notion API).

## Threat model assumption

The system trusts the customer's UUID token as a bearer
credential. Tokens are 122-bit random UUIDv4 — unguessable.
Token leakage is the primary risk vector (via screenshots,
support tickets, browser history). Several findings below
reduce the practical impact of leakage but don't eliminate it.

---

## Findings

### 🟢 What's working well

Listed for completeness — these are the things that DIDN'T find
problems, so credit where due:

| Area | Status | Evidence |
|---|---|---|
| Hardcoded secrets | ✓ none found | Grep for `sk_*`, `pk_live`, password literals — clean |
| `.dev.vars` gitignored | ✓ | Confirmed in `.gitignore` |
| Password hashing | ✓ PBKDF2-SHA256 + per-record salt + constant-time compare | `src/lib/auth/password.ts` |
| Admin auth | ✓ Basic auth with timing-safe compare | `src/middleware.ts:131` |
| Customer session JWT | ✓ HMAC-SHA256, signature verified before payload parse, token-bound, 7-day TTL | `src/lib/auth/session.ts` |
| Login rate limit | ✓ 10 attempts / 5 min per token | `src/app/api/login/[token]/route.ts:80` |
| Generic login failure messages | ✓ no token-existence leak | Same file, dummy-hash verify even when prospect=null |
| Open-redirect protection | ✓ `returnTo` must start with `/` and contain customer token | Same file:151 |
| Internal API auth | ✓ shared secret in `x-internal-secret` header | Both `/api/internal/*` routes |
| CSRF mitigation | ✓ API endpoints take token from request BODY, not cookie | All `/api/account/*` |
| Security headers (page) | ✓ HSTS preload, X-Frame-Options SAMEORIGIN, nosniff, strict-origin-when-cross-origin Referrer-Policy, Permissions-Policy minimal | `public/_headers` |
| File upload caps | ✓ 5 MB per file, total-bytes cap per customer, MIME allowlist | `src/app/api/onboarding/upload/route.ts` |
| File path traversal | ✓ `safeFilename()` strips path separators | Same file:135 |
| SSRF | ✓ all outbound fetches use hardcoded hostnames (api.resend.com, api.github.com, Cloudflare API, Notion API) | Grepped fetch calls — no user-controlled URLs |
| Verbatim-quote guard | ✓ Haiku classifier can't paraphrase customer-quoted text | `src/lib/haiku/classify-change-request.ts` |
| Honeypot on `/api/public/enquiry` | ✓ silent-drop bots that fill the `hp` field | `src/app/api/public/enquiry/route.ts:98` |

### 🟡 Medium severity (address in next sprint)

#### M1 — `/api/account/*` and `/api/onboarding/*` don't verify session cookie

**Location:** every route file under `src/app/api/account/` and `src/app/api/onboarding/`.

**Issue:** the middleware enforces a signed session cookie on
`/account/[token]/*` and `/onboarding/[token]/*` PAGE routes, but
the API endpoints those pages call (e.g.
`/api/account/change-request`, `/api/onboarding/upload`) accept the
token as a body parameter only. They validate the token exists via
`getProspectByToken(token)` but don't verify the caller has a valid
session cookie.

**Impact:** if a customer's token leaks (URL screenshot, support
ticket, shared screen-recording, server logs), the attacker can
hit the API endpoints directly and:
- Submit change requests on the customer's behalf
- Subscribe / unsubscribe / send newsletters to their list
- Upload assets / replace logo
- Submit offer updates

They CANNOT change the password (no API for that without the old
password) or read other customers' data.

**Mitigations already in place:**
- `Referrer-Policy: strict-origin-when-cross-origin` — token in
  URL not leaked via Referer when customer clicks external links
- HSTS preload — no plaintext token transit
- UUIDv4 tokens (122 bits) — not guessable

**Remediation:**
```ts
// In every /api/account/* and /api/onboarding/* route, after
// validating the body token, ALSO verify the session cookie:
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
const session = await verifySession(cookie, env.SESSION_SECRET, token);
if (!session) {
  return NextResponse.json({ error: "Session expired." }, { status: 401 });
}
```

Estimated effort: ~30 min for a shared `requireCustomerSession()` helper + applying to ~10 routes.

#### M2 — SVG uploads allowed, served from R2 with claimed content-type

**Location:** `src/app/api/onboarding/upload/route.ts:71`.

**Issue:** `image/svg+xml` is in `ALLOWED_TYPES`. SVG files can
contain `<script>` tags that execute when the SVG is opened
directly in a browser as `image/svg+xml`. The upload route stores
the file in R2 with `httpMetadata: { contentType: file.type }`,
so an attacker uploads `evil.svg` with that content-type and gets
a URL like `https://assets.modu-forge.co.uk/assets/<token>/logo/<id>-evil.svg`
that executes their script when visited.

**Impact:** XSS in the `assets.modu-forge.co.uk` origin. Marketing
site cookies are scoped to `modu-forge.co.uk` host-only (no
`Domain=` attribute in `buildSessionCookie`), so the attacker
can't directly steal `pf_session`. But they can:
- Phish via a styled assets.modu-forge.co.uk page
- Trigger window.opener attacks if linked from a victim's tab
- Run anything else the assets origin permits

**Mitigations:**
- `X-Content-Type-Options: nosniff` is set on the marketing site
  via `public/_headers` — but that header is served by the
  marketing Worker. Confirm it's also set on `assets.modu-forge.co.uk`
  (the R2 public URL hostname).
- The customer-site renders uploaded assets via `<Image>` from
  next/image, which by default doesn't load `image/svg+xml` —
  safe in normal use. Risk is the raw R2 URL.

**Remediation (pick one):**
1. **Drop `image/svg+xml` from `ALLOWED_TYPES`** — simplest. SVGs
   are rare for logos; PNG with transparency covers it.
2. **Sanitize SVG server-side** before storing (strip `<script>`,
   `on*` attributes, foreign-object content via DOMPurify-like).
3. **Serve all R2 assets with `Content-Disposition: attachment`**
   so browsers download rather than render inline. Breaks `<Image>`
   though.

Recommended: option 1.

#### M3 — Next.js HIGH-severity advisories (DoS + CSP-nonce XSS)

**Location:** `package.json` Next.js dependency.

**`npm audit` output:**
- `Next.js Vulnerable to Denial of Service with Server Components` (GHSA-8h8q-6873-q5fj)
- `Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces` (GHSA-ffhc-5mcf-pf4q)

**Impact:**
- CSP-nonce XSS: **N/A** — we don't use CSP nonces.
- Server Components DoS: real but mitigated by Cloudflare's edge
  capacity + the DoS pattern requires malformed payloads that
  the Cloudflare WAF should drop at L7.

**Remediation:** `npm audit fix --force` bumps to next@15.5.18 (a
patch version with the fix). The "breaking change" warning is
because the audit fix wants to leave the stated range — the
actual upgrade is one minor version. Verify build + deploy.

#### M4 — In-memory rate limit defeated by Worker isolate spread

**Location:** `src/app/api/login/[token]/route.ts:43-47`.

**Issue:** the login rate-limit (`RATE_BUCKET`) is an in-memory
`Map` on each Worker isolate. Cloudflare Workers spawn isolates
geographically; an attacker hitting from multiple PoPs gets a
fresh counter per isolate. Worst case: `RATE_MAX × N_isolates`
attempts per 5-min window.

**Impact:** practical impact is bounded by password entropy
(~56 bits for 10-char from 50-char alphabet). Even at 1000
attempts/min globally, brute-forcing a single password takes years.
Combined with the per-token isolation (you can't enumerate
usernames), this is mostly fine. Worth fixing for defence-in-depth.

**Remediation:** KV-backed rate limit. Cloudflare Workers KV
namespace is cheap; each login attempt is one KV read + one
write. Reuse existing KV pattern from anywhere else if applicable
(none today — would be the first KV usage).

#### M5 — No per-IP rate limit on `/api/public/enquiry` or `/api/public/subscribe`

**Location:** both routes use only honeypot + length caps.

**Issue:** a bot that ignores the honeypot field can mass-submit
enquiries (resulting in spam emails to customers via Resend) OR
mass-subscribe fake emails to customer newsletter lists (filling
the 1000-subscriber cap with junk).

**Impact:**
- Enquiry spam: Customer receives lots of junk emails. Resend
  per-day cap is 100 free tier, $20/mo for 50k — moderate cost
  ceiling.
- Newsletter spam: customer's list fills with fake emails, hits
  the 1000-cap, real subscribers get rejected.

**Mitigations already in place:**
- Honeypot drops naive bots
- Resend rate limits and Resend "transactional" usage policies
- Cloudflare's default bot management

**Remediation (low priority):**
- Cloudflare WAF rule: rate-limit `/api/public/enquiry` and
  `/api/public/subscribe` to 5/min per IP. Cloudflare dashboard
  config, no code change.
- OR KV-backed per-IP counter inline.

#### M6 — Subscribe widget has no honeypot field

**Location:** `customer-site-template/src/components/SubscribeWidget.tsx`.

**Issue:** the enquiry form (`EnquiryFormWidget`) has a hidden
honeypot `hp` field that the server checks and silently drops if
populated. The subscribe widget doesn't have this — bots can mass-
add fake subscribers to a customer's newsletter without any
detection.

**Impact:** customer's newsletter list pollution. Same impact as
M5 newsletter half. Easier to exploit because no honeypot at all.

**Remediation:** add the same `hp` honeypot field + server-side
silent-drop pattern from `EnquiryFormWidget` and
`/api/public/enquiry`. ~10 lines change.

### 🟢 Low severity (future tidy)

#### L1 — PBKDF2 iterations below OWASP 2023 recommendation

**Location:** `src/lib/auth/password.ts:20`.

**Issue:** `ITERATIONS = 100_000` for PBKDF2-SHA256. OWASP 2023
recommendation is 600,000 for PBKDF2-SHA256. Cloudflare Workers
CPU budget makes 100k a reasonable compromise; bumping to 600k
adds ~50ms per login.

**Impact:** offline brute-force resistance is 6× lower than ideal.
In practice: rate-limited online attacks are the realistic vector
and 100k is more than enough. Only matters if the password hash
database leaks (which would mean Notion has leaked — a much
bigger problem).

**Remediation:** benchmark on Cloudflare Worker, bump if comfortable.

#### L2 — Public CORS uses `Access-Control-Allow-Origin: *`

**Location:** `/api/public/subscribe`, `/api/public/enquiry`.

**Issue:** wildcard CORS allows any origin to call these endpoints.

**Impact:** none — wildcard CORS cannot be combined with
credentials (browser refuses), so authenticated routes aren't
exposed. These endpoints are public by design. Listed for
completeness only.

#### L3 — `fast-xml-builder` HIGH-severity advisory (transitive)

**Location:** `node_modules/fast-xml-builder` via `@opennextjs/cloudflare` → `@aws-sdk/xml-builder`.

**Issue:** `npm audit` reports HIGH. Dependency chain:
`@opennextjs/cloudflare` → `@aws-sdk/client-cloudfront` →
`@aws-sdk/xml-builder` → `fast-xml-parser` → `fast-xml-builder`.

**Impact:** essentially zero. We don't use AWS services. This is
a build-time tool from OpenNext's AWS variant being bundled. The
vulnerable code path (XML attribute-quote bypass) requires our
code to call into AWS's XML builder, which never happens.

**Remediation:** `npm audit fix` for the non-breaking subset. Wait
for OpenNext to update its `@aws-sdk/*` pin otherwise. Not blocking.

#### L4 — `dangerouslySetInnerHTML` usage (all benign)

**Location:** 3 sites — `src/app/layout.tsx:136`, `src/components/onboarding/Step2Domain.tsx:556`, `src/app/account/[token]/preview/[crId]/page.tsx:141`.

**Issue:** each uses `dangerouslySetInnerHTML` for HTML content.

**Audit:**
1. `layout.tsx:136` — `JSON.stringify(localBusinessJsonLd)`. JSON
   data only; `JSON.stringify` escapes `<` `>` `"` properly.
   Safe.
2. `Step2Domain.tsx:556` — `title` prop. Confirmed callers pass
   only literal compile-time strings (`"I already have my domain"`
   etc., with `&rsquo;` HTML entities). Safe.
3. `preview/[crId]/page.tsx:141` — `SUPPRESSOR_JS` constant. Not
   user input. Safe.

No remediation needed.

#### L5 — No CSP (Content-Security-Policy) header

**Location:** `public/_headers`.

**Issue:** other security headers are set (HSTS, nosniff, X-Frame-
Options, etc.) but no CSP. CSP would add defence against XSS that
slips through.

**Impact:** none observed — XSS attack vectors are minimal (no
user-controlled HTML rendering except the cleared SVG-upload
finding M2). CSP adds belt + braces.

**Remediation:** add a baseline CSP — `default-src 'self';
script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
fonts.googleapis.com; img-src 'self' data: assets.modu-forge.co.uk;
font-src fonts.gstatic.com;`. Test against actual pages because
Next.js may need additional sources. Low priority.

### ⚪ Informational (not findings, just context)

- `claude-haiku-4-5` API calls send customer data (site snapshot)
  to Anthropic. Anthropic's data handling is in their ToS; if you
  need to disable training data use, set the appropriate opt-out
  on the Anthropic console.
- Notion as a datastore — Notion's security is their problem. If
  your Notion workspace gets compromised, every customer's data
  leaks (including passwordHash + tokens). Mitigation: enable
  2FA on the Notion workspace; rotate the integration secret
  quarterly.
- Cloudflare API token used for per-customer Worker creation has
  scope to delete all your Workers if compromised. Mitigation:
  rotate quarterly; consider creating a custom scoped token.
- Stripe webhook signing not yet implemented — TBD when Stripe
  Phase 2 lands. The Phase 2 doc (`STRIPE-PHASE-2.md`) covers it.

---

## Recommended remediation order

If you want to do one sprint's worth of work:

1. **M6 — add honeypot to SubscribeWidget** (10 min)
2. **M2 — drop `image/svg+xml` from ALLOWED_TYPES** (5 min)
3. **M3 — `npm audit fix --force` for Next.js + test deploy** (30 min)
4. **M1 — add `requireCustomerSession()` helper + apply to ~10 routes** (30 min)
5. **M5 — Cloudflare WAF rule for `/api/public/*`** (15 min in CF dashboard)

Total: ~90 min for all five highest-impact medium findings. M4
(KV-backed login rate limit) and the LOW items can wait.

---

## Tools used

- Static analysis: ripgrep + manual code review
- Dependency audit: `npm audit`
- Auth library audit: read full source for `auth/session.ts`,
  `auth/password.ts`, `middleware.ts`, `/api/login/*`
- No live DAST / penetration testing performed

Audit re-run cadence: quarterly, or after any major auth /
file-upload / new-public-endpoint change.
