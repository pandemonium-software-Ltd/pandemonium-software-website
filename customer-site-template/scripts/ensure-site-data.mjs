#!/usr/bin/env node
// Ensure src/data/site-data.json exists before next build / dev.
//
// CI flow (GitHub Actions): the workflow writes the customer's
// real data to site-data.json directly; this script sees it and
// does nothing. Local dev flow: site-data.json is gitignored, so
// on first run we copy fixture.json → site-data.json so Next.js
// has something to import. Per-iteration the customer-site-template
// runs against the fixture data unless the developer manually
// overwrites site-data.json with a different prospect's intake.
//
// Why a script (not a try-catch in site-data.ts): Next.js's static
// analyser can't follow conditional requires/imports. A pre-step
// that GUARANTEES the import target exists keeps the runtime code
// trivial.

import { existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "src", "data", "fixture.json");
const liveData = join(here, "..", "src", "data", "site-data.json");

if (!existsSync(liveData)) {
  if (!existsSync(fixture)) {
    console.error(
      "[ensure-site-data] No fixture.json — repo is missing required dev data.",
    );
    process.exit(1);
  }
  copyFileSync(fixture, liveData);
  console.log(
    "[ensure-site-data] Copied fixture.json → site-data.json (local dev)",
  );
} else {
  // Quiet — file already exists, either from CI or a prior dev run.
}
