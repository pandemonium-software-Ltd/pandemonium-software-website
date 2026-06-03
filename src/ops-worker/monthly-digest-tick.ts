// Monthly digest tick.
//
// Triggered by the "0 8 1 * *" cron entry in wrangler-ops.jsonc
// — 1st of each month at 08:00 UTC. Iterates every Live customer,
// pulls last month's website + newsletter analytics, renders a
// ModuForge-branded email, sends via Resend.
//
// Idempotent risk: if the cron fires twice in the same hour (CF
// rarely does this on retries) a customer gets two copies of the
// same digest. The blast-radius is low (slight customer
// annoyance) and dedup'ing requires a per-customer "last-sent"
// stamp we'd have to write back to Notion or D1. Skipping that
// for v1 — handle if it actually happens.
//
// Errors per customer don't block siblings — a single 5xx from
// Resend or a malformed prospect record won't stop the rest of
// the fleet from getting their digest.

import { listProspectsNeedingOps } from "../lib/notion-prospects";
import { getServerEnv } from "../lib/env";
import {
  lastCompletedMonth,
  readDigestPayload,
} from "../lib/monthly-digest";
import { renderMonthlyDigest } from "../lib/monthly-digest-email";
import { site } from "../lib/site";
import type { D1Database } from "../lib/d1-analytics";

const FROM_ADDRESS = "ModuForge <results@modu-forge.co.uk>";
const REPLY_TO = "benpandher@proton.me";

export async function runMonthlyDigestTick(args: {
  db: D1Database;
}): Promise<void> {
  const tickId = new Date().toISOString();
  const month = lastCompletedMonth();
  console.log(
    `[digest:${tickId}] starting for ${month.monthKey} (${month.monthLabel})`,
  );

  const env = getServerEnv();
  if (!env.RESEND_API_KEY) {
    console.error(`[digest:${tickId}] RESEND_API_KEY not set — aborting`);
    return;
  }

  let prospects;
  try {
    prospects = await listProspectsNeedingOps();
  } catch (e) {
    console.error(
      `[digest:${tickId}] failed to list prospects: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const liveCustomers = prospects.filter(
    (p) => p.status === "Live" && !!p.email,
  );
  console.log(
    `[digest:${tickId}] ${liveCustomers.length} live customer(s) to email`,
  );

  // M-14: In-memory dedup — prevents duplicate digests if the cron
  // fires twice in the same window. Tracks tokens already sent this
  // tick. TODO: Replace with a D1-backed `lastDigestMonth` field
  // per prospect for durable cross-tick dedup (YYYY-MM string).
  const sentThisTick = new Set<string>();

  let ok = 0;
  let failed = 0;
  for (const prospect of liveCustomers) {
    if (sentThisTick.has(prospect.token)) {
      console.log(
        `[digest:${tickId}] skipping ${prospect.email} — already sent this tick (dedup)`,
      );
      continue;
    }
    try {
      const payload = await readDigestPayload({
        db: args.db,
        prospect,
        month,
      });

      const firstName = (prospect.name.split(/\s+/)[0] ?? prospect.name).trim();
      const businessName = prospect.business || prospect.name;
      const dashboardUrl = `${site.url.replace(/\/$/, "")}/account/${prospect.token}`;

      const { subject, html, text } = renderMonthlyDigest({
        firstName,
        businessName,
        dashboardUrl,
        payload,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [prospect.email],
          reply_to: REPLY_TO,
          subject,
          html,
          text,
          // Tag so the Resend webhook can categorise + so they
          // don't pollute newsletter open-rate stats (the webhook
          // only counts events with tag.token + tag.send_id).
          tags: [
            { name: "kind", value: "monthly_digest" },
            { name: "token", value: prospect.token },
            { name: "month", value: month.monthKey },
          ],
        }),
      });

      if (!res.ok) {
        failed++;
        const errText = await res.text().catch(() => "(no body)");
        console.error(
          `[digest:${tickId}] ${prospect.token.slice(0, 8)}: Resend ${res.status} — ${errText.slice(0, 200)}`,
        );
        continue;
      }
      sentThisTick.add(prospect.token);
      ok++;
      const headline = payload.hasActivity
        ? `${payload.website.pageviews} visits`
        : "quiet month";
      console.log(
        `[digest:${tickId}] sent to ${prospect.token.slice(0, 8)} — ${headline}`,
      );
    } catch (e) {
      failed++;
      console.error(
        `[digest:${tickId}] ${prospect.token.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(
    `[digest:${tickId}] complete: ${ok} sent, ${failed} failed`,
  );
}
