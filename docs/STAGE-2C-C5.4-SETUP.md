# Stage 2C C5.4 — Build pipeline setup

End-to-end flow:

```
Customer hits "Request site preview" in their Hub
        │
        ▼
/api/onboarding (existing) writes review.previewSubmittedAt to Notion
        │
        ▼  (next cron tick, ~1 min later)
ops worker step5-review.shouldRun() returns true
        │
        ▼
ops worker dispatches GitHub Actions repository_dispatch event
ops worker stamps "Preview Build Triggered At" in Notion (anti-spam latch)
        │
        ▼
GitHub Actions workflow .github/workflows/customer-site-build.yml fires
        │
        ▼
Action: GET /api/internal/site-data?token=X (with x-internal-secret header)
        →  returns SiteGeneratorInput JSON + deploy metadata
        →  Action writes JSON to customer-site-template/src/data/site-data.json
        │
        ▼
Action: cd customer-site-template && npm ci && npm run build
        │
        ▼
Action: wrangler deploy --name <customer-worker> (using BEN_CLOUDFLARE_API_TOKEN)
        →  replaces the placeholder script with the OpenNext-built Next.js bundle
        │
        ▼
Action: POST /api/internal/build-callback {token, status:"success", previewUrl}
        →  marketing site stamps onboardingData.review.previewUrl in Notion
        →  marketing site sends customer "preview-ready" email
        →  marketing site clears Preview Build Triggered/Failed At latches
        │
        ▼
Customer sees their hub Step 5 advance to Phase 3 (iframe + edits + commit)
Customer's preview lives at https://<their-domain>/
```

On failure (any step in the Action throws): the failure-callback fires
the same endpoint with `status:"failure"`. The latch clears so the
next preview-request will retry. Operator sees the failure in
the GitHub Actions logs + can manually re-trigger via the
workflow_dispatch input.

---

## One-time setup

### 1. Generate the shared secret

```bash
openssl rand -hex 32
# → e.g. 8a7c2f3e1d9b4a5c6f7e8d9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c
```

This single value gets placed in **three** places. Rotate by updating
all three at once.

### 2. GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

| Name | Value | Source |
|---|---|---|
| `INTERNAL_BUILD_SECRET` | (the secret from step 1) | self-generated |
| `BEN_CLOUDFLARE_API_TOKEN` | (the existing user-scoped CF token) | already in ops worker |
| `MARKETING_SITE_BASE` | `https://modu-forge.co.uk` | optional, defaults to prod |

### 3. Marketing site env (Cloudflare Worker secrets)

```bash
wrangler secret put INTERNAL_BUILD_SECRET
# paste the secret from step 1 when prompted
```

This unlocks the `/api/internal/site-data` and `/api/internal/build-callback`
endpoints.

### 4. Ops worker env (Cloudflare Worker secrets)

```bash
wrangler secret put GITHUB_TOKEN --config wrangler-ops.jsonc
# paste a GitHub PAT with `repo` scope OR a fine-grained token
# scoped to this repo with Actions: Read+Write

# Plus environment variables (in wrangler-ops.jsonc `vars` block):
#   GITHUB_OWNER: "your-github-username-or-org"
#   GITHUB_REPO:  "loving-wozniak"
```

The token only needs to dispatch workflows; you can use a
fine-grained token with permissions narrowed to **Actions: Read and
Write** on this single repo.

### 5. Notion DB schema (already done)

Two new columns added in this commit:

- `Preview Build Triggered At` (date) — anti-spam latch
- `Preview Build Failed At` (date) — failure record

Plus the existing `Onboarding Step 6 Done` column from the C5.3
content step.

### 6. Push + verify

```bash
git push                     # pushes the workflow file
npm run deploy               # marketing site picks up the new endpoints
npm run deploy:ops           # ops worker picks up the new step5-review
```

Manual smoke test:

```bash
# 1. From repo root, manually dispatch the workflow:
gh workflow run customer-site-build.yml -f token=<a-prospect-token>

# 2. Watch it run:
gh run watch

# 3. Confirm the customer's domain serves the new build:
curl -sI https://<their-domain>/
```

---

## Known limits

- **Anti-spam cooldown**: 15 min. If a build dispatches but the
  Action never reports back (failure-mode you can't easily test),
  step5-review re-triggers after 15 min. Operator can clear the
  Preview Build Triggered At Notion field manually for an
  immediate retry.
- **Build time**: 3-5 min per build (Next.js build + wrangler
  deploy). Customers wait this long after hitting Request preview
  for the email to land. Acceptable per the 3-edit/month cap.
- **Concurrent builds across customers**: GitHub Actions runs each
  dispatch in parallel (free tier: 20 concurrent jobs). Plenty of
  headroom for now; revisit if we get to 100+ builds/day.
- **Per-build cost**: ~3-5 minutes on a free GitHub Actions runner.
  Free tier = 2000 min/month. ~400-600 builds/month free.

---

## What this does NOT yet handle (deferred)

- **C5.5 Haiku copy assist**: site-data.json gets emitted as-is
  from the adapter; no AI polish yet.
- **C5.6 Enquiry form**: customer-site-template's Contact page is
  static; the form Server Action lands later.
- **C5.7 Vibes 2-4**: only the modern vibe ships.
- **C5.8 Edit application**: customer-side edit submissions don't
  yet trigger a re-build; the operator manually re-triggers via
  the `workflow_dispatch` input.
- **C5.9 Go-live**: the same step5-review will gain a Phase B
  branch that triggers the build as production on go-live date.
- **C5.10 Hardening**: per-customer alerting on build failures
  beyond the Cowork exception path.

See `docs/STAGE-2C-C5-PLAN.md` for the full sequence.
