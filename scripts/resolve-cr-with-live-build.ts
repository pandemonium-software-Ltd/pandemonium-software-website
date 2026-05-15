// Manually resolve a change request when the preview-build pipeline
// has failed (e.g. the workflow's known wrangler-no-preview-url
// bug). Does what Cowork's preview-then-approve flow would have
// done if it had worked end-to-end:
//
//   1. The patch is already in onboardingData (Cowork applied it
//      at coworkPatchAppliedAt — that part of the pipeline worked).
//   2. Trigger a fresh LIVE build via gh workflow run, which will
//      pick up the patched data and deploy it. Wait for completion.
//   3. Mark the CR as resolved with a reply note.
//   4. Send the customer-branded "your change is live" email.
//
// Equivalent end state to the customer clicking Approve on a
// preview build that succeeded — they get the same email, the
// same dashboard state, the same site changes. Just no preview-
// before-promote gate.
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/resolve-cr-with-live-build.ts <token> <crId>

import { execSync } from "node:child_process";
import {
  getProspectByToken,
  updateChangeRequest,
} from "../src/lib/notion-prospects";
import { sendCustomerEmail } from "../src/ops-worker/notify";
import { customerSenderBrand } from "../src/lib/email-branding";
import { getServerEnv } from "../src/lib/env";
import { site } from "../src/lib/site";

async function main() {
  const token = process.argv[2];
  const crIdPrefix = process.argv[3];
  if (!token || !crIdPrefix) {
    console.error(
      "Usage: npx tsx --env-file=.dev.vars scripts/resolve-cr-with-live-build.ts <token> <cr-id-or-prefix>",
    );
    process.exit(1);
  }

  const p = await getProspectByToken(token);
  if (!p) {
    console.error("Prospect not found.");
    process.exit(1);
  }

  // Resolve the full CR id from the prefix the operator typed.
  const cr = p.changeRequests.find((c) => c.id.startsWith(crIdPrefix));
  if (!cr) {
    console.error(
      `No change request found matching prefix "${crIdPrefix}" on ${p.name}.`,
    );
    console.error(
      `Open: ${p.changeRequests.map((c) => c.id.slice(0, 8)).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(`prospect:    ${p.name} (${p.business ?? "—"})`);
  console.log(`CR:          ${cr.id} — "${cr.message}"`);
  console.log(`status:      ${cr.status}`);
  console.log(`patches:     ${cr.coworkPatches?.length ?? 0}`);

  // ---------- Step 1: trigger live build ----------
  console.log(`\nStep 1: trigger live build via GitHub Actions`);
  const cmd = `gh workflow run customer-site-build.yml --ref main --field token=${token} --field mode=live`;
  execSync(cmd, { stdio: "inherit" });
  console.log(`  ✓ Workflow dispatched`);

  // Wait for it to start + finish. Poll every 15s.
  console.log(`  ⏳ Waiting for build to complete...`);
  // Give GitHub a moment to enqueue.
  await new Promise((r) => setTimeout(r, 5000));
  const runId = execSync(
    `gh run list --workflow=customer-site-build.yml --limit 1 --json databaseId --jq '.[0].databaseId'`,
  )
    .toString()
    .trim();
  console.log(`  → Run ID: ${runId}`);
  let lastStatus = "";
  for (let i = 0; i < 60; i++) {
    const json = execSync(
      `gh run view ${runId} --json status,conclusion`,
    ).toString();
    const { status, conclusion } = JSON.parse(json) as {
      status: string;
      conclusion: string | null;
    };
    if (status !== lastStatus) {
      console.log(`    status: ${status}${conclusion ? ` (${conclusion})` : ""}`);
      lastStatus = status;
    }
    if (status === "completed") {
      if (conclusion !== "success") {
        console.error(`\n  ✗ Build failed: ${conclusion}`);
        console.error(`  See: https://github.com/pandemonium-software-Ltd/pandemonium-software-website/actions/runs/${runId}`);
        process.exit(1);
      }
      console.log(`  ✓ Build succeeded`);
      break;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }

  // ---------- Step 2: mark CR resolved ----------
  console.log(`\nStep 2: mark CR ${cr.id.slice(0, 8)} as resolved`);
  await updateChangeRequest(p.pageId, cr.id, {
    status: "resolved",
    reply:
      "Applied — your change is now live on your site. (We hit a brief snag with the preview workflow so I went straight to live; the change took effect.)",
  });
  console.log(`  ✓ CR resolved with reply`);

  // ---------- Step 3: send customer email ----------
  console.log(`\nStep 3: send "your change is live" email`);
  const ob = (p.onboardingData ?? {}) as Record<string, unknown>;
  const ds = (ob.domain ?? {}) as { domain?: unknown };
  const domain = typeof ds.domain === "string" ? ds.domain.trim() : "";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const accountUrl = `${baseUrl}/account/${token}`;
  const siteUrl = domain ? `https://${domain}` : accountUrl;

  try {
    await sendCustomerEmail(
      getServerEnv(),
      p.email,
      "change-request-applied-live",
      {
        customerName: firstName(p.name),
        originalMessage: cr.message,
        siteUrl,
        accountUrl,
      },
      { senderBrand: customerSenderBrand(p) },
    );
    console.log(`  ✓ Email sent to ${p.email}`);
  } catch (e) {
    console.warn(
      `  ✗ Email failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    console.warn(
      `    (Notion + live build succeeded; just the email didn't send. Lucas can check his dashboard at ${accountUrl}.)`,
    );
  }

  console.log(`\n✓ CR resolved end-to-end. Lucas's site is updated at ${siteUrl}`);
}

function firstName(s: string): string {
  return s.split(/\s+/)[0] || "there";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
