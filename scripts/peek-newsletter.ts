// Dump a prospect's newsletter slice — config + subscribers + last
// draft / sent issue (if persisted). Used to debug "my newsletter
// didn't…" issues.
//
// Run with: npx tsx --env-file=.dev.vars scripts/peek-newsletter.ts <token>

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error("Usage: npx tsx --env-file=.dev.vars scripts/peek-newsletter.ts <token>");
    process.exit(1);
  }
  const p = await getProspectByToken(token);
  if (!p) {
    console.error("Prospect not found");
    process.exit(1);
  }
  const ob = (p.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const newsletter = (content.newsletter ?? {}) as Record<string, unknown>;

  console.log(`prospect: ${p.name} (${p.business ?? "—"})`);
  console.log(`\nnewsletter slice:`);
  console.log(JSON.stringify(newsletter, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
