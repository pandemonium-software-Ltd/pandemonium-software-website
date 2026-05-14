// MASTER reset — wipes Lucas back to a chosen prior state so the
// full launch pipeline (Step 1 Cloudflare → Step 2 Domain → Step 3
// Hub → Step 4 Assets → Step 5 Review → Step 6 Sign-off → Step 7
// Go-Live → Site live) can be re-run end-to-end on real infra.
//
// Two reset depths:
//   --target paid     (default)  → reset to "just paid" — preserves
//                                  Phase 2/3 data, password, fees,
//                                  modules. Re-runs the post-payment
//                                  onboarding hub only.
//   --target enquiry             → reset to "just submitted the
//                                  enquiry" — also wipes Phase 2/3
//                                  data, qualification result,
//                                  modules, fees, password,
//                                  module-change log. Phase 1 form
//                                  data + token are preserved.
//                                  Re-runs the WHOLE pipeline from
//                                  qualification email onwards.
//
// What gets WIPED:
//   Notion (Lucas's prospect row):
//     Status                          → "Paid"
//     Onboarding Step 1–6 Done        → false (all 6 step checkboxes)
//     Onboarding Data                 → {} (empty JSON)
//     Onboarding Started At           → null
//     Onboarding Completed At         → null
//     Go Live Date                    → null
//     Cloudflare Membership Verified  → null
//     Cloudflare Account Id           → empty
//     Cloudflare Zone Id              → empty
//     Cloudflare Zone Status          → null
//     Domain Verified At              → null
//     Nameservers Email Sent At       → null
//     Customer Confirmed Nameservers  → null
//     Worker Name                     → empty
//     Site Live At                    → null
//     Preview Build Triggered At      → null
//     Preview Build Failed At         → null
//     Final Launch Triggered At       → null
//     Haiku Cache                     → {}
//     Change Requests Inbox           → []
//
//   Cloudflare (in Lucas's customer account):
//     Worker script `mf-<token-prefix>`  → DELETED
//     Zone for Lucas's domain            → DELETED
//
//   R2 (in our marketing account, bucket `moduforge-customer-assets`):
//     All objects with prefix `assets/<lucas-token>/` → DELETED
//
// What is PRESERVED:
//   --target paid (default):
//     - Phase 1 enquiry data + Phase 1 token
//     - Phase 2 qualification data + Compatibility result
//     - Phase 3 intake data
//     - Module Selections + Setup/Monthly fees (so the pipeline
//       re-runs with the same paid-for module mix)
//     - passwordHash + passwordSetAt (Lucas logs straight in)
//     - Phase 1/2/3 Submitted At timestamps (audit trail)
//     - Notes / Module Change Log (audit trail)
//
//   --target enquiry (deeper reset):
//     - Phase 1 enquiry data + Phase 1 token + Phase 1 Submitted At
//     - Notes (audit trail)
//     (Everything else gets wiped — Lucas has to re-run qualify
//      → accept → pay → onboard → launch all over again.)
//
// Safety:
//   - Requires `--yes` flag — refuses to run without it.
//   - Prints a BEFORE snapshot, then runs, then prints AFTER. If you
//     see anything weird mid-run, just don't pass `--yes` next time
//     and the script is a no-op dry-run that prints what it WOULD do.
//
// Run:
//   Dry run (recommended first) — defaults to --target paid:
//     npx tsx --env-file=.dev.vars scripts/master-reset-lucas.ts
//   Real reset back to "Paid":
//     npx tsx --env-file=.dev.vars scripts/master-reset-lucas.ts --yes
//   Real reset back to "Phase 1 Complete":
//     npx tsx --env-file=.dev.vars scripts/master-reset-lucas.ts --target enquiry --yes

import {
  getProspectByToken,
  updateProspectOnboarding,
  writeHaikuCache,
  replaceChangeRequests,
  clearPreviewBuildTriggered,
  clearFinalLaunchTriggered,
} from "../src/lib/notion-prospects";
import { notionFetch } from "../src/lib/notion";
import { cloudflareFetch, CloudflareApiError } from "../src/lib/cloudflare";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";
const R2_BUCKET = "moduforge-customer-assets";

const DRY_RUN = !process.argv.includes("--yes");

// Parse --target. Defaults to "paid" (the original behaviour).
// "enquiry" adds Phase 2/3 + password + modules + fees on top.
function parseTarget(): "paid" | "enquiry" {
  const idx = process.argv.indexOf("--target");
  if (idx === -1) return "paid";
  const val = process.argv[idx + 1];
  if (val !== "paid" && val !== "enquiry") {
    console.error(
      `--target must be 'paid' or 'enquiry'. Got: ${val ?? "(missing)"}`,
    );
    process.exit(2);
  }
  return val;
}
const TARGET = parseTarget();

// ---------------------------------------------------------------
// Tiny logging helpers — keeps the actual logic below readable.
// ---------------------------------------------------------------
function header(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}
function step(label: string) {
  console.log(`\n[${label}]`);
}
async function run<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (DRY_RUN) {
    console.log(`  · ${label}  (dry-run — skipped)`);
    return undefined;
  }
  try {
    const out = await fn();
    console.log(`  ✓ ${label}`);
    return out;
  } catch (e) {
    console.log(
      `  ✗ ${label}  — ${e instanceof Error ? e.message : String(e)}`,
    );
    return undefined;
  }
}

// ---------------------------------------------------------------
// Notion: clear all the things `updateProspectOnboarding` doesn't
// know how to null. One PATCH so it's atomic.
// ---------------------------------------------------------------
async function clearNotionLatches(pageId: string): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Onboarding Started At": { date: null },
        "Onboarding Completed At": { date: null },
        "Go Live Date": { date: null },
        "Cloudflare Membership Verified At": { date: null },
        "Cloudflare Account Id": { rich_text: [] },
        "Cloudflare Zone Id": { rich_text: [] },
        "Cloudflare Zone Status": { select: null },
        "Domain Verified At": { date: null },
        "Nameservers Email Sent At": { date: null },
        "Customer Confirmed Nameservers At": { date: null },
        "Worker Name": { rich_text: [] },
        "Site Live At": { date: null },
      },
    },
  });
}

// ---------------------------------------------------------------
// Notion (DEEP clear, --target enquiry only) — wipe everything
// downstream of Phase 1: Phase 2/3 data + qualification result +
// modules + fees + password + module-change log. Phase 1 fields
// (name/email/phone/business/etc.) AND the Phase 1 token are
// preserved — Lucas's identity stays the same.
// ---------------------------------------------------------------
async function clearPhase2AndBeyond(pageId: string): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Phase 2 Submitted At": { date: null },
        "Phase 2 Data": { rich_text: [] },
        "Phase 3 Submitted At": { date: null },
        "Phase 3 Data": { rich_text: [] },
        "Compatibility Result": { select: null },
        "Compatibility Reasoning": { rich_text: [] },
        "Hard Blocker Triggered": { rich_text: [] },
        "Soft Blockers Triggered": { multi_select: [] },
        "Module Selections": { multi_select: [] },
        "Setup Fee Calculated": { number: null },
        "Monthly Fee Calculated": { number: null },
        "Founding Member": { checkbox: false },
        "Password Hash": { rich_text: [] },
        "Password Set At": { date: null },
        "Module Change Round Used At": { date: null },
        "Module Change Log": { rich_text: [] },
      },
    },
  });
}

// ---------------------------------------------------------------
// Cloudflare: delete the per-customer Worker script.
// Endpoint: DELETE /accounts/{account_id}/workers/scripts/{name}
// Idempotent — Cloudflare returns 404 if it's already gone; we
// swallow that case as success.
// ---------------------------------------------------------------
async function deleteWorker(
  accountId: string,
  workerName: string,
): Promise<void> {
  try {
    await cloudflareFetch(
      `/accounts/${accountId}/workers/scripts/${workerName}?force=true`,
      { method: "DELETE" },
    );
  } catch (e) {
    if (e instanceof CloudflareApiError && e.status === 404) {
      // already gone — fine
      return;
    }
    throw e;
  }
}

// ---------------------------------------------------------------
// Cloudflare: delete the customer's zone.
// Endpoint: DELETE /zones/{zone_id}
// Returns the zone object on success. 404 = already deleted (idem).
// ---------------------------------------------------------------
async function deleteZone(zoneId: string): Promise<void> {
  try {
    await cloudflareFetch(`/zones/${zoneId}`, { method: "DELETE" });
  } catch (e) {
    if (e instanceof CloudflareApiError && e.status === 404) {
      return;
    }
    throw e;
  }
}

// ---------------------------------------------------------------
// R2: enumerate + delete every object under `assets/<token>/` in
// the marketing account's customer-assets bucket.
//
// Endpoints:
//   GET    /accounts/{aid}/r2/buckets/{bucket}/objects?prefix=&cursor=
//   DELETE /accounts/{aid}/r2/buckets/{bucket}/objects/{key}
//
// Pagination handled defensively — Lucas has ~15 files but the
// loop is correct for any size.
// ---------------------------------------------------------------
type R2ListResult = {
  result?: { key: string; size?: number }[];
  result_info?: { cursor?: string; is_truncated?: boolean };
};

async function listR2Objects(
  accountId: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ prefix });
    if (cursor) params.set("cursor", cursor);
    // cloudflareFetch unwraps `.result`, but the R2 list endpoint
    // also returns `result_info` for pagination — we need the raw
    // envelope. Bypass cloudflareFetch and read directly.
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${R2_BUCKET}/objects?${params}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.BEN_CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`R2 list failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as R2ListResult;
    for (const obj of body.result ?? []) keys.push(obj.key);
    cursor = body.result_info?.is_truncated
      ? body.result_info?.cursor
      : undefined;
  } while (cursor);
  return keys;
}

async function deleteR2Object(accountId: string, key: string): Promise<void> {
  // R2 keys can contain slashes — must NOT be URL-encoded by URLSearchParams,
  // but the path itself needs path-segment encoding (encodeURIComponent
  // is too aggressive — encodes "/"). Encode segment-by-segment.
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  await cloudflareFetch(
    `/accounts/${accountId}/r2/buckets/${R2_BUCKET}/objects/${encodedKey}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------
// Find the marketing account ID by listing all accounts Ben has
// access to, then probing each for the moduforge-customer-assets
// bucket. The first match wins.
//
// Memoised because we hit it twice (list + delete loop).
// ---------------------------------------------------------------
let cachedMarketingAccountId: string | undefined;
async function findMarketingAccountId(): Promise<string | undefined> {
  if (cachedMarketingAccountId) return cachedMarketingAccountId;

  type Account = { id: string; name: string };
  const accounts = await cloudflareFetch<Account[]>("/accounts");
  for (const acct of accounts) {
    try {
      type Bucket = { name: string };
      const buckets = await cloudflareFetch<{ buckets: Bucket[] }>(
        `/accounts/${acct.id}/r2/buckets`,
      );
      if (buckets?.buckets?.some((b) => b.name === R2_BUCKET)) {
        cachedMarketingAccountId = acct.id;
        return acct.id;
      }
    } catch {
      // Some accounts may not have R2 enabled / accessible — skip.
    }
  }
  return undefined;
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
async function main() {
  header(
    `Master reset — Lucas (${LUCAS_TOKEN})  ·  target: ${TARGET === "enquiry" ? "Phase 1 Complete (enquiry)" : "Paid"}`,
  );
  if (DRY_RUN) {
    console.log("\n  >>> DRY RUN — pass --yes to actually execute. <<<\n");
  }

  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found in Notion. Aborting.");
    process.exit(1);
  }

  // ---------- BEFORE snapshot ----------
  step("BEFORE");
  console.log(`  pageId:                 ${lucas.pageId}`);
  console.log(`  status:                 ${lucas.status}`);
  console.log(
    `  step flags (1–6):        ${[
      lucas.onboardingStep1Done,
      lucas.onboardingStep2Done,
      lucas.onboardingStep3Done,
      lucas.onboardingStep4Done,
      lucas.onboardingStep5Done,
      lucas.onboardingContentDone,
    ].join(", ")}`,
  );
  console.log(`  goLiveDate:              ${lucas.goLiveDate ?? "(none)"}`);
  console.log(
    `  onboardingData keys:     ${Object.keys((lucas.onboardingData ?? {}) as Record<string, unknown>).join(", ") || "(empty)"}`,
  );
  console.log(
    `  changeRequests count:    ${lucas.changeRequests.length}`,
  );
  console.log(
    `  haikuCache entries:      ${Object.keys(lucas.haikuCache ?? {}).length}`,
  );
  console.log(`  cloudflareAccountId:     ${lucas.cloudflareAccountId ?? "(none)"}`);
  console.log(`  cloudflareZoneId:        ${lucas.cloudflareZoneId ?? "(none)"}`);
  console.log(`  cloudflareZoneStatus:    ${lucas.cloudflareZoneStatus ?? "(none)"}`);
  console.log(`  workerName:              ${lucas.workerName ?? "(none)"}`);
  console.log(`  siteLiveAt:              ${lucas.siteLiveAt ?? "(none)"}`);
  console.log(`  previewBuildTriggered:   ${lucas.previewBuildTriggeredAt ?? "(none)"}`);
  console.log(`  finalLaunchTriggered:    ${lucas.finalLaunchTriggeredAt ?? "(none)"}`);
  const preservedSuffix = TARGET === "enquiry" ? "WILL BE WIPED" : "PRESERVED";
  console.log(`  passwordHash:            ${lucas.passwordHash ? "[set]" : "[unset]"}  (${preservedSuffix})`);
  console.log(`  moduleSelections:        ${lucas.moduleSelections.join(", ") || "(none)"}  (${preservedSuffix})`);
  console.log(`  setupFee:                £${lucas.setupFeeCalculated ?? "?"}  (${preservedSuffix})`);
  console.log(`  monthlyFee:              £${lucas.monthlyFeeCalculated ?? "?"}  (${preservedSuffix})`);
  console.log(`  compatibilityResult:     ${lucas.compatibilityResult ?? "(none)"}  (${preservedSuffix})`);
  console.log(`  phase2 submittedAt:      ${lucas.phase2SubmittedAt ?? "(none)"}  (${preservedSuffix})`);
  console.log(`  phase3 submittedAt:      ${lucas.phase3SubmittedAt ?? "(none)"}  (${preservedSuffix})`);
  console.log(`  business:                ${lucas.business ?? "(none)"}  (always PRESERVED)`);
  console.log(`  phase1 submittedAt:      ${lucas.phase1SubmittedAt ?? "(none)"}  (always PRESERVED)`);

  // ---------- Notion writes ----------
  step("Notion: clear onboarding step flags + data + status → Paid");
  // Walk steps 1–6, clearing each. Last call also flips status + clears data.
  for (const s of [1, 2, 3, 4, 5, 6] as const) {
    await run(`step ${s} done → false`, () =>
      updateProspectOnboarding(lucas.pageId, {
        stepDone: { step: s, done: false },
      }),
    );
  }
  const targetStatus: "Paid" | "Phase 1 Complete" =
    TARGET === "enquiry" ? "Phase 1 Complete" : "Paid";
  await run(`onboardingData → {} + status → ${targetStatus}`, () =>
    updateProspectOnboarding(lucas.pageId, {
      data: {},
      statusFlip: targetStatus,
    }),
  );

  step("Notion: clear ancillary latches (started/completed, CF, worker, etc.)");
  await run("clearNotionLatches (one PATCH for 12 fields)", () =>
    clearNotionLatches(lucas.pageId),
  );

  if (TARGET === "enquiry") {
    step(
      "Notion: DEEP clear — Phase 2/3, qualification, modules, fees, password",
    );
    await run("clearPhase2AndBeyond (one PATCH for 16 fields)", () =>
      clearPhase2AndBeyond(lucas.pageId),
    );
  }

  step("Notion: clear build-trigger latches");
  await run("clearPreviewBuildTriggered", () =>
    clearPreviewBuildTriggered(lucas.pageId, { failure: false }),
  );
  await run("clearFinalLaunchTriggered", () =>
    clearFinalLaunchTriggered(lucas.pageId),
  );

  step("Notion: empty haiku cache + change requests");
  await run("writeHaikuCache({})", () => writeHaikuCache(lucas.pageId, {}));
  await run("replaceChangeRequests([])", () =>
    replaceChangeRequests(lucas.pageId, []),
  );

  // ---------- Cloudflare: worker + zone ----------
  step("Cloudflare: delete per-customer Worker");
  if (lucas.cloudflareAccountId && lucas.workerName) {
    await run(
      `DELETE worker '${lucas.workerName}' in account ${lucas.cloudflareAccountId}`,
      () => deleteWorker(lucas.cloudflareAccountId!, lucas.workerName!),
    );
  } else {
    console.log(
      `  · skipped — accountId=${lucas.cloudflareAccountId ?? "(none)"}, workerName=${lucas.workerName ?? "(none)"}`,
    );
  }

  step("Cloudflare: delete customer zone");
  if (lucas.cloudflareZoneId) {
    await run(`DELETE zone ${lucas.cloudflareZoneId}`, () =>
      deleteZone(lucas.cloudflareZoneId!),
    );
  } else {
    console.log("  · skipped — no cloudflareZoneId on record");
  }

  // ---------- R2: assets/<token>/ ----------
  step("R2: enumerate + delete customer assets");
  if (DRY_RUN) {
    console.log(
      `  · would list + delete objects with prefix 'assets/${LUCAS_TOKEN}/' from ${R2_BUCKET}`,
    );
  } else {
    const marketingAccountId = await findMarketingAccountId();
    if (!marketingAccountId) {
      console.log(
        `  ✗ could not find marketing CF account (looked for bucket '${R2_BUCKET}' across all accounts Ben has access to). Skipping R2 cleanup — please delete manually via wrangler or dashboard.`,
      );
    } else {
      console.log(`  · marketing account: ${marketingAccountId}`);
      try {
        const keys = await listR2Objects(
          marketingAccountId,
          `assets/${LUCAS_TOKEN}/`,
        );
        console.log(`  · found ${keys.length} object(s)`);
        for (const key of keys) {
          await run(`DELETE ${key}`, () =>
            deleteR2Object(marketingAccountId, key),
          );
        }
      } catch (e) {
        console.log(
          `  ✗ R2 enumerate failed — ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  // ---------- AFTER snapshot ----------
  step("AFTER");
  const after = await getProspectByToken(LUCAS_TOKEN);
  if (!after) {
    console.log("  ✗ couldn't re-read Lucas — something is very wrong");
    process.exit(1);
  }
  console.log(`  status:                 ${after.status}`);
  console.log(
    `  step flags (1–6):        ${[
      after.onboardingStep1Done,
      after.onboardingStep2Done,
      after.onboardingStep3Done,
      after.onboardingStep4Done,
      after.onboardingStep5Done,
      after.onboardingContentDone,
    ].join(", ")}`,
  );
  console.log(`  goLiveDate:              ${after.goLiveDate ?? "(none)"}`);
  console.log(
    `  onboardingData keys:     ${Object.keys((after.onboardingData ?? {}) as Record<string, unknown>).join(", ") || "(empty)"}`,
  );
  console.log(`  changeRequests count:    ${after.changeRequests.length}`);
  console.log(
    `  haikuCache entries:      ${Object.keys(after.haikuCache ?? {}).length}`,
  );
  console.log(`  cloudflareAccountId:     ${after.cloudflareAccountId ?? "(none)"}`);
  console.log(`  cloudflareZoneId:        ${after.cloudflareZoneId ?? "(none)"}`);
  console.log(`  workerName:              ${after.workerName ?? "(none)"}`);
  console.log(`  siteLiveAt:              ${after.siteLiveAt ?? "(none)"}`);
  console.log(`  passwordHash:            ${after.passwordHash ? "[set]" : "[unset]"}`);
  console.log(`  moduleSelections:        ${after.moduleSelections.join(", ") || "(none)"}`);
  console.log(`  compatibilityResult:     ${after.compatibilityResult ?? "(none)"}`);
  console.log(`  phase2 submittedAt:      ${after.phase2SubmittedAt ?? "(none)"}`);
  console.log(`  phase3 submittedAt:      ${after.phase3SubmittedAt ?? "(none)"}`);
  console.log(`  setupFee:                ${after.setupFeeCalculated !== undefined ? `£${after.setupFeeCalculated}` : "(none)"}`);
  console.log(`  monthlyFee:              ${after.monthlyFeeCalculated !== undefined ? `£${after.monthlyFeeCalculated}` : "(none)"}`);

  header(DRY_RUN ? "Dry run complete — no changes were made." : "Reset complete.");
  if (!DRY_RUN) {
    if (TARGET === "enquiry") {
      console.log(
        `\nNext steps for re-running the FULL pipeline from enquiry:
  1. Lucas's Phase 1 data is intact (name/email/phone/business/etc.).
  2. He has NO password — qualification + acceptance will generate
     one + email it to him when the time comes.
  3. Open /admin → find Lucas → send him the Phase 2 qualification
     link manually, OR re-trigger the enquiry-received email so he
     can fill in qualification fresh.
  4. Once he submits Phase 2 → compatibility runs → if accepted
     you'll send him to /intake/${LUCAS_TOKEN} for Phase 3.
  5. After Phase 3 → Stripe/payment placeholder → status → Paid.
  6. Onboarding Hub → Steps 1–7 → site live.

NB: deployments must be live — \`npm run deploy\` (marketing) and
\`npm run deploy:ops\` (ops worker) — for the cron pipeline to pick
him up at each stage.\n`,
      );
    } else {
      console.log(
        `\nNext steps for testing the launch pipeline from "Paid":
  1. Lucas should still have his login (passwordHash preserved).
  2. Log in as Lucas at /login/${LUCAS_TOKEN} (or /account/${LUCAS_TOKEN}).
  3. The Hub will route him to Step 1 (Cloudflare invite).
  4. Within a minute, the ops cron will pick him up and start
     Step 1 → 2 → 3 → 4 → 5 → 6 → 7 as he progresses.
  5. Set 'Go Live Date' on the row whenever you want Step 7 to fire.

NB: deployments must be live — \`npm run deploy\` (marketing) and
\`npm run deploy:ops\` (ops worker) — for the cron to pick him up.\n`,
      );
    }
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
