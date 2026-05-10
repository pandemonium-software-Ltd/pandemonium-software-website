// Site-data resolver. Reads the per-customer build artifact if
// present, falls back to the committed local-dev fixture otherwise.
//
// CI build flow:
//   1. GitHub Actions writes prospect intake JSON →
//      `src/data/site-data.json` before `next build`.
//   2. This module imports it (statically, so Next.js can include
//      it in the build).
//   3. If the file doesn't exist (local dev), Node throws on import.
//      We catch via a try-import pattern — fall back to fixture.json.
//
// Static imports mean both files end up evaluated at build time.
// Bundle bloat is minimal (a few KB JSON each).

import type { SiteData } from "./types";
import fixture from "../data/fixture.json";

// Per-customer data is OPTIONAL at the type level — falls back to
// fixture for local dev. The CI build replaces the fixture import
// path or writes to site-data.json before invoking next build.
//
// We use a runtime require-style pattern via dynamic-resolved
// import to handle the fallback cleanly. Next.js' static analyser
// allows this when the path is constant.
let siteData: SiteData;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const live = require("../data/site-data.json");
  siteData = live as SiteData;
} catch {
  siteData = fixture as SiteData;
}

export const SITE_DATA: SiteData = siteData;
