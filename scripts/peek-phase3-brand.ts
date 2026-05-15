// Peek at a prospect's Phase 3 brand slice + the onboardingData
// branding slice so we can see what colour / layout / style they
// actually committed to. Used when the adapter rejects with
// "vibe missing" or similar — figure out where the gap is.
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/peek-phase3-brand.ts <token>

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error("Usage: npx tsx --env-file=.dev.vars scripts/peek-phase3-brand.ts <token>");
    process.exit(1);
  }
  const p = await getProspectByToken(token);
  if (!p) {
    console.error("Prospect not found");
    process.exit(1);
  }
  console.log(`prospect: ${p.name} (${p.business ?? "—"})`);
  console.log(`status:   ${p.status}`);

  const phase3 = (p.phase3Data ?? {}) as Record<string, unknown>;
  const brand = (phase3.brand ?? {}) as Record<string, unknown>;
  console.log(`\nphase3.brand:`);
  console.log(JSON.stringify(brand, null, 2));

  const ob = (p.onboardingData ?? {}) as Record<string, unknown>;
  const branding = (ob.branding ?? {}) as Record<string, unknown>;
  console.log(`\nonboardingData.branding (Hub Step 4 Content):`);
  console.log(JSON.stringify(branding, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
