// GET /api/internal/site-data?token=<prospect-token>
//
// Internal endpoint called by the GitHub Actions
// `customer-site-build.yml` workflow. Returns the prospect's
// SiteGeneratorInput JSON ready for the customer-site-template
// build to consume directly (Action writes it to
// customer-site-template/src/data/site-data.json).
//
// Auth: shared secret in the `x-internal-secret` header. The same
// secret value lives in:
//   - Marketing site env (INTERNAL_BUILD_SECRET)
//   - GitHub repository secret (INTERNAL_BUILD_SECRET)
//   - Ops worker env (INTERNAL_BUILD_SECRET — for callback verification)
// Rotate by updating in all three places at once.
//
// Returns the SiteGeneratorInput shape OR a structured error
// (`{ error, code }`). 401 for bad/missing secret, 404 for
// unknown token, 422 if adapter rejects the prospect (with the
// AdapterError message — surfaces to the GitHub Action logs so
// the operator can see + fix the data in Notion).

import { NextResponse } from "next/server";
import {
  getProspectByToken,
  writeHaikuCache,
} from "@/lib/notion-prospects";
import {
  adaptProspect,
  AdapterError,
} from "@/lib/site-generator/adapter";
import { enrichWithHaiku } from "@/lib/haiku/enrich";
import type { HaikuCache } from "@/lib/haiku/cache";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const env = getServerEnv();
  const expected = env.INTERNAL_BUILD_SECRET;
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "INTERNAL_BUILD_SECRET not configured on this deployment.",
        code: "secret_unconfigured",
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-internal-secret");
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "bad_secret" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid token.", code: "bad_token" },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found.", code: "not_found" },
      { status: 404 },
    );
  }

  let input;
  let copySources;
  try {
    const adapted = adaptProspect(prospect);
    input = adapted.input;
    copySources = adapted.copySources;
  } catch (e) {
    if (e instanceof AdapterError) {
      return NextResponse.json(
        {
          error: e.message,
          code: "adapter_rejected",
        },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg, code: "adapter_error" },
      { status: 500 },
    );
  }

  // Haiku 4.5 copy assist (C5.5). Polishes about-blurb / long service
  // descriptions / FAQ answers using the cache stored in Notion ONLY
  // when the source is `intake` (Phase 3 raw dump). Customer-edited
  // text from Hub Step 4 or change-request patches passes through
  // verbatim — see enrich.ts for the source gating. Tagline polish
  // was dropped entirely (always content-sourced today, and customer
  // intent on hero copy is non-negotiable). Cache hit = free + instant;
  // cache miss = one Haiku call per changed field. NEVER throws —
  // if Anthropic is down or the key is missing, raw customer text
  // passes straight through.
  const initialCache = (prospect.haikuCache ?? {}) as HaikuCache;
  const { enriched, cache, cacheChanged } = await enrichWithHaiku(
    input,
    initialCache,
    copySources,
  );
  if (cacheChanged) {
    // Persist new cache entries so the next build is a full hit.
    // Best-effort: a Notion write failure is logged but doesn't
    // fail the build (the polished copy is already in `enriched`).
    try {
      await writeHaikuCache(prospect.pageId, cache);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[haiku] cache persist failed: ${msg}`);
    }
  }

  // Resolve r2:// asset URLs to public URLs the build can hot-link
  // directly. Same logic as the marketing site's render path.
  const r2Base = env.R2_PUBLIC_URL_BASE ?? "https://assets.modu-forge.co.uk";
  const resolved = resolveR2Urls(enriched, r2Base);

  // Plus the operational fields the Action needs to know which
  // Worker to deploy to.
  return NextResponse.json({
    siteData: resolved,
    deploy: {
      cloudflareAccountId: prospect.cloudflareAccountId,
      workerName: prospect.workerName,
      isLaunched: !!prospect.siteLiveAt,
    },
  });
}

// Constant-time string compare to dodge timing-attack risk on the
// secret check.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Resolve r2:// → public URL, mirror of the marketing-site render
// path so the customer-site-template build sees fully-qualified
// URLs ready to feed straight into next/image.
function resolveR2Urls<T extends { brandAssets: Record<string, unknown> }>(
  input: T,
  r2Base: string,
): T {
  const trim = r2Base.replace(/\/$/, "");
  const resolve = (s: string): string =>
    s.startsWith("r2://") ? `${trim}/${s.slice("r2://".length)}` : s;
  const ba = input.brandAssets as Record<string, unknown>;
  const next: Record<string, unknown> = { ...ba };
  if (typeof ba.logoUrl === "string") next.logoUrl = resolve(ba.logoUrl);
  if (typeof ba.heroPhotoUrl === "string")
    next.heroPhotoUrl = resolve(ba.heroPhotoUrl);
  if (typeof ba.aboutPhotoUrl === "string")
    next.aboutPhotoUrl = resolve(ba.aboutPhotoUrl);
  if (Array.isArray(ba.galleryPhotoUrls))
    next.galleryPhotoUrls = ba.galleryPhotoUrls.map((u) =>
      typeof u === "string" ? resolve(u) : u,
    );
  if (Array.isArray(ba.backgroundUrls))
    next.backgroundUrls = ba.backgroundUrls.map((u) =>
      typeof u === "string" ? resolve(u) : u,
    );
  if (Array.isArray(ba.servicePhotos))
    next.servicePhotos = ba.servicePhotos.map((sp) => {
      if (!sp || typeof sp !== "object") return sp;
      const obj = sp as Record<string, unknown>;
      return typeof obj.url === "string"
        ? { ...obj, url: resolve(obj.url) }
        : obj;
    });
  return { ...input, brandAssets: next };
}
