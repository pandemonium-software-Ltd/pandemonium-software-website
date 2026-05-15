// Dump a prospect's change-request inbox so we can see what the
// customer just submitted + what the Cowork pipeline has done with
// it (classification, status, replies).
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/peek-change-requests.ts <token>

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error("Usage: npx tsx --env-file=.dev.vars scripts/peek-change-requests.ts <token>");
    process.exit(1);
  }
  const p = await getProspectByToken(token);
  if (!p) {
    console.error("Prospect not found");
    process.exit(1);
  }
  console.log(`prospect:           ${p.name} (${p.business ?? "—"})`);
  console.log(`status:             ${p.status}`);
  console.log(`siteLiveAt:         ${p.siteLiveAt ?? "(unset)"}`);
  console.log(`changeRequests:     ${p.changeRequests.length}`);
  for (const cr of p.changeRequests) {
    console.log("\n========================================");
    console.log(JSON.stringify(cr, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
