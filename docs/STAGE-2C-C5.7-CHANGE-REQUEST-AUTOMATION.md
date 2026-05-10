# Stage 2C C5.7 — Change-Request Automation

**Status:** Phase A done (visibility + receipt email). Phase B v1
shipping (cron-based reminder). Phase B v2 (Haiku auto-apply)
PARKED until validated on real traffic.

## What this delivers (full vision)

When a customer submits a change request via /account/[token]:
1. Confirmation email lands within seconds
2. Cron picks it up within minutes
3. **In-scope text changes apply automatically** + customer email
   + site rebuild — Ben never touches it
4. **Out-of-scope or ambiguous** → escalation email to Ben with
   one-click deep link to the admin row + Cowork's reasoning

End result: Ben's per-request time goes from "5-15 min researching
+ editing + replying" to "0 minutes" for ~70% of requests, and
"30 seconds to click reject + type one-line reply" for the rest.

---

## Phase split

### Phase A — visibility (DONE, commit 3a9c947)
- Customer receipt email on submission
- Days-open badge in admin list, escalates colour at >= 3 days
- Deep link in Ben's notification email straight to the request row
- `target:ring-4` highlight when navigated via the hash

### Phase B v1 — cron reminder (THIS COMMIT)
- New ops worker step `step6-change-requests` runs every cron tick
- For each `pending` request submitted >2h ago AND not yet
  escalated, send Ben a short follow-up reminder email
- Stamps `coworkEscalatedAt` per request to avoid re-emailing
- No Haiku, no auto-apply yet — pure plumbing + nag mechanism

### Phase B v2 — Haiku auto-apply (PARKED)
The bulk of the value. See "Auto-apply design" below for the
full spec — ready to build when we want to.

---

## Auto-apply design (Phase B v2 — PARKED)

### Classifier

`src/lib/haiku/classify-change-request.ts`:
- Input: customer's request text + sanitised site data context
- Output:
  ```ts
  {
    classification: "in_scope" | "out_of_scope" | "ambiguous";
    confidence: 0..1;
    patch?: {
      target:
        | "copy.tagline"
        | "copy.aboutBlurb"
        | "business.phoneDisplay"
        | "business.publicEmail"
        | "business.address"
        | "business.serviceArea"
        | "business.openingHours"
        | "service.description"   // requires service name
        | "service.priceFrom"     // requires service name
        | "faq.answer";            // requires question id
      newValue: string | number | object;
      // For service/faq, additional locator fields:
      serviceName?: string;
      faqQuestion?: string;
    } | null;
    reasoning: string;
  }
  ```
- Prompt rules (strict):
  - DO NOT invent facts (phone numbers, URLs, prices)
  - DO NOT decide design / layout / image changes (always
    out_of_scope)
  - DO NOT propose multi-field patches (Phase A's multi-item
    detector should catch these but defence in depth)
  - DO classify as "ambiguous" when the customer's intent is
    unclear OR the field is unspecified
- HAIKU_MODEL stays hardcoded (consistent with C5.5)

### Patch applier

`src/ops-worker/steps/step6-change-requests.ts`:
- Maps the structured `patch.target` to a Notion field write via
  the existing `updateProspectOnboarding`
- **Whitelist only.** Any target not in the whitelist → escalate
  to Ben rather than applying. Whitelist for v2 launch:
  - `copy.tagline`, `copy.aboutBlurb`
  - `business.phoneDisplay`, `business.publicEmail`,
    `business.address`, `business.serviceArea`
  - Single FAQ answer (by question match)
  - Single service description / priceFrom (by name match)
- Validation: re-runs the relevant zod schema on the updated
  field before writing. If validation fails → escalate.

### Confidence threshold

- Apply automatically only when `confidence >= 0.85`
- Ambiguous / lower confidence → escalate to Ben with the
  suggested patch + a one-click "Apply this" button
- Tunable per kind: e.g. tagline edits trigger faster
  (`>= 0.7`) than business contact fields (`>= 0.9`)

### Auto-apply flow

1. Classifier returns `in_scope` patch with high confidence
2. Apply patch via `updateProspectOnboarding`
3. Validate with zod schema → if fails, rollback + escalate
4. Mark request `resolved` with reply text auto-generated
   ("Done — I've updated your X to Y. The change is live now.")
5. Send `change-request-applied` email to customer (NEW
   template — distinguishes from operator-resolved)
6. Trigger customer-site-build (existing pattern)
7. Stamp `coworkPatchAppliedAt` on the request for audit

### Rollback safety

- Every auto-applied patch logs the BEFORE value to a new
  `coworkAuditLog` field per change request
- Admin page surfaces a "Revert this auto-apply" button per
  applied request — restores the BEFORE value, marks the
  request `pending` again, emails customer
- Rate limit: max 5 auto-applies per customer per day (cron
  guard) — anything beyond escalates so Ben can investigate
  why one customer is generating so much churn

### Customer email — change-request-applied (NEW template)

Tone: warm, brief, distinguishes from operator-resolved.
Example body:
```
Hi {{customerName}},

Got your request and applied it:

  {{requestSummary}}

Your site is updating now — give it a minute and the change
will be live at {{domain}}.

If this isn't quite right, hit reply and tell me — I'll
sort it.

— Ben (via Cowork)
```

### Out-of-scope / ambiguous → escalation

- Email Ben with:
  - Customer's request (verbatim)
  - Cowork's classification + reasoning
  - Suggested patch (if any) + "Apply this" button
  - "Custom reply" button (deep links to admin)
- Stamps `coworkEscalatedAt` so we don't re-email
- Phase B v1 ships this email shape WITHOUT the Haiku-generated
  fields (just plain "you have an open request" reminder)

---

## Trust + safety considerations

1. **Customer trust:** the customer sees "Cowork (your ModuForge
   ops assistant)" in auto-apply emails so it's clear the work
   was automated, not Ben pretending. Footer also says
   "automated by Cowork — reply with 'human please' to escalate".

2. **Audit trail:** every auto-apply writes BEFORE + AFTER values
   to the request's history. /admin/[token] shows them so Ben
   can spot misclassifications.

3. **Reversibility:** one-click revert button on /admin/[token]
   for any auto-applied request.

4. **Shadow mode (recommended for first 2 weeks):** when
   classifier confidence is high enough to apply, INSTEAD send
   Ben the suggested patch + an "approve auto-apply" button. After
   2 weeks of measuring "would Cowork have got it right?" on
   real traffic, flip the feature flag to skip the approval step
   and apply directly.

---

## Implementation checklist (Phase B v2 — when ready)

1. [ ] Add `coworkProcessedAt`, `coworkClassification`,
   `coworkConfidence`, `coworkPatchAppliedAt`,
   `coworkAuditLog` fields to ChangeRequest type +
   notion-prospects writers
2. [ ] Build src/lib/haiku/classify-change-request.ts
3. [ ] Build src/lib/change-requests/apply-patch.ts (whitelist
   + validation + audit log writer)
4. [ ] Wire into step6-change-requests.ts (replace v1 reminder
   logic with full classify + apply or escalate flow)
5. [ ] New template change-request-applied
6. [ ] Update internal-notification email template to include
   Cowork's classification + one-click "apply" button
7. [ ] Add "Revert auto-apply" button to ChangeRequestEditor
8. [ ] Feature flag `COWORK_AUTO_APPLY_ENABLED` in env (default
   false during shadow mode)
9. [ ] Admin page surfaces shadow-mode "would have applied: yes/no"
   indicator next to each request
10. [ ] After 2-week shadow run + accuracy review, flip flag

---

## Out of scope (explicit non-goals)

- **Multi-field patches** — must always escalate. A "fix typo
  AND change phone" submission gets caught by the existing
  multi-item detector in /api/account/change-request first.
- **Image / asset changes** — always escalate. The customer
  needs to re-upload.
- **Layout / styling / design** — always escalate.
- **Schema changes** (new sections, new fields) — always
  escalate.
- **Past-tense edits** ("change what I said yesterday in our
  email") — out of scope, Cowork can't read emails.
