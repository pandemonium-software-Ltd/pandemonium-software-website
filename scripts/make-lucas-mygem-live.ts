// Make Lucas-MyGem live RIGHT NOW (rather than waiting for his
// 2026-05-22 scheduled go-live-date).
//
// His customer site is already deployed (manual live build earlier
// today landed the latest template + Tier 1/2/3 visuals + legal
// pages + customer-branded emails). All that's left is the
// operator paperwork:
//
//   1. Update goLiveDate → today (cosmetic — Notion record stays
//      accurate)
//   2. Flip status: Onboarding Complete → Live
//   3. Stamp siteLiveAt = now
//   4. Clear finalLaunchTriggeredAt (if set — releases the cooldown
//      latch so the cron stops thinking a build is in flight)
//   5. Send the customer "site-live" email
//
// Equivalent to what the build-callback would do if step7-go-live's
// cron fired and the launch build's callback came back with
// finalLaunch=true. We're doing it by hand because the user wants
// Lucas live now, not in 7 days.
//
// Run with: npx tsx --env-file=.dev.vars scripts/make-lucas-mygem-live.ts

import {
  getProspectByToken,
  updateProspectOnboarding,
  markSiteLive,
  clearFinalLaunchTriggered,
} from "../src/lib/notion-prospects";
import { sendCustomerEmail } from "../src/ops-worker/notify";
import { getServerEnv } from "../src/lib/env";
import { site } from "../src/lib/site";

const LUCAS_MYGEM_TOKEN = "d930bdb5-f015-44e5-afcc-f741a3c98d8a";

async function main() {
  const p = await getProspectByToken(LUCAS_MYGEM_TOKEN);
  if (!p) {
    console.error("Lucas-MyGem not found.");
    process.exit(1);
  }

  console.log(`\nBEFORE:`);
  console.log(`  status:                  ${p.status}`);
  console.log(`  goLiveDate:              ${p.goLiveDate ?? "(unset)"}`);
  console.log(`  siteLiveAt:              ${p.siteLiveAt ?? "(unset)"}`);
  console.log(`  finalLaunchTriggeredAt:  ${p.finalLaunchTriggeredAt ?? "(unset)"}`);

  if (p.status === "Live") {
    console.log("\nAlready Live — nothing to do.");
    process.exit(0);
  }
  if (p.status !== "Onboarding Complete") {
    console.error(
      `\nRefusing to flip — expected status "Onboarding Complete", got "${p.status}".`,
    );
    console.error("Customer must finish onboarding sign-off first.");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  console.log(`\nApplying:`);
  // Status → Live + goLiveDate → today + stamp Onboarding
  // Completed At (already set; this is a no-op if so) — single
  // PATCH so Notion sees an atomic transition.
  await updateProspectOnboarding(p.pageId, {
    statusFlip: "Live",
    goLiveDate: today,
  });
  console.log(`  ✓ Status flipped: Onboarding Complete → Live`);
  console.log(`  ✓ Go Live Date set: ${today}`);

  // Stamp siteLiveAt — represents "the public-facing launch
  // moment". Distinct from the earlier siteLiveAt stamp which was
  // from step2-domain ("placeholder Worker bound + reachable").
  // The launch-day stamp signals "customer's content is live".
  await markSiteLive(p.pageId);
  console.log(`  ✓ Site Live At stamped (now)`);

  // Clear final-launch latch (idempotent — only matters if step7
  // had stamped it). Releases the cooldown so subsequent ops
  // don't think a build is still in flight.
  await clearFinalLaunchTriggered(p.pageId);
  console.log(`  ✓ Final Launch Triggered At cleared`);

  // Site-live email — fail-soft. The status flip is already in
  // Notion; an email hiccup doesn't change that the customer is
  // live.
  const domain = (() => {
    const ob = (p.onboardingData ?? {}) as Record<string, unknown>;
    const ds = (ob.domain ?? {}) as { domain?: unknown };
    return typeof ds.domain === "string" ? ds.domain.trim() : "";
  })();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const accountUrl = `${baseUrl}/account/${LUCAS_MYGEM_TOKEN}`;
  const siteUrl = domain ? `https://${domain}` : accountUrl;

  try {
    await sendCustomerEmail(getServerEnv(), p.email, "site-live", {
      customerName: firstName(p.name),
      siteUrl,
      accountUrl,
    });
    console.log(`  ✓ "You're live 🎉" email sent to ${p.email}`);
  } catch (e) {
    console.warn(
      `  ✗ Site-live email failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const after = await getProspectByToken(LUCAS_MYGEM_TOKEN);
  console.log(`\nAFTER:`);
  console.log(`  status:                  ${after?.status}`);
  console.log(`  goLiveDate:              ${after?.goLiveDate}`);
  console.log(`  siteLiveAt:              ${after?.siteLiveAt}`);
  console.log(`  finalLaunchTriggeredAt:  ${after?.finalLaunchTriggeredAt ?? "(cleared)"}`);

  console.log(`\n✓ Lucas-MyGem is live: ${siteUrl}`);
}

function firstName(s: string): string {
  return s.split(/\s+/)[0] || "there";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
