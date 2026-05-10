// Site-data resolver. Always imports `src/data/site-data.json` —
// the file is GUARANTEED to exist by the `prebuild` / `predev` npm
// script (`scripts/ensure-site-data.mjs`), which copies the dev
// fixture if no live customer data is present.
//
// CI flow (GitHub Actions): the workflow writes the prospect's
// real intake data to site-data.json BEFORE invoking
// `npm run build`. The prebuild step then sees the file already
// exists and is a no-op.
//
// Local dev: prebuild copies fixture.json → site-data.json on
// first run. Edit fixture.json (committed) to change the dev
// experience; site-data.json (gitignored) gets refreshed every
// `npm run dev` if absent.

import type { SiteData } from "./types";
import siteData from "../data/site-data.json";

export const SITE_DATA: SiteData = siteData as SiteData;
