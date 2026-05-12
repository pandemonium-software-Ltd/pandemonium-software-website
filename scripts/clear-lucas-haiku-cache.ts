// Wipe Lucas's Haiku polish cache so old polished entries don't
// stick around after we dropped polishTagline + gated the remaining
// polish targets behind source flags.
//
// Why: cache entries are keyed by hash of the raw input. The
// existing cache may contain a polished tagline (e.g. "Gardens
// transformed by someone who actually knows what they're doing.")
// keyed on an old raw tagline value. With polish disabled for
// tagline going forward, those entries are dead weight — and if
// any other field still trips a cache hit on a stale key, the
// customer would see polished output where they shouldn't.
//
// Safe to run any time: cache regenerates on next build (or just
// stays empty since aboutBlurb is now content-sourced for Lucas).
//
// Run with: npx tsx --env-file=.dev.vars scripts/clear-lucas-haiku-cache.ts

import {
  getProspectByToken,
  writeHaikuCache,
} from "../src/lib/notion-prospects";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const cache = (lucas.haikuCache ?? {}) as Record<string, unknown>;
  const entries = Object.keys(cache).length;
  console.log(`Before: ${entries} cache entries`);
  if (entries > 0) {
    console.log("Keys:");
    for (const k of Object.keys(cache)) {
      console.log(`  ${k}`);
    }
  }

  await writeHaikuCache(lucas.pageId, {});

  const after = await getProspectByToken(LUCAS_TOKEN);
  const afterCount = Object.keys(
    (after?.haikuCache ?? {}) as Record<string, unknown>,
  ).length;
  console.log(`\nAfter: ${afterCount} cache entries`);
  console.log("✓ Haiku cache cleared. Next build will skip polish entirely");
  console.log(
    "  for tagline (dropped), and only polish other fields when intake-",
  );
  console.log("  sourced (which Lucas's data no longer is).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
