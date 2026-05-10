// /api/onboarding/upload — Hub Step 4 brand-asset uploads.
//
// POST: multipart/form-data { token, kind, file, serviceName? }
//   - validates token + onboarding-unlocked status
//   - validates file (content type + size)
//   - generates an R2 key like assets/<token>/<kind>/<uuid>-<safe-name>
//   - puts via the ASSETS_BUCKET R2 binding
//   - merges Asset record into the prospect's Onboarding Data step4
//     slice, behaviour depends on `kind`:
//       Single-replace (replaces existing, best-effort old R2 delete):
//         - "logo"   → assets.logo
//         - "hero"   → assets.hero          (NEW C5.3)
//         - "about"  → assets.about         (NEW C5.3)
//       Array-append (cap if exceeded; fail with old key rolled back):
//         - "service"    → assets.services[]   (max 10, requires serviceName field)
//         - "background" → assets.backgrounds[] (max 5)
//         - "gallery"    → assets.gallery[]    (max 20)
//         - "photo"      → assets.photos[]     (max 20, LEGACY pre-C5.3)
//
// DELETE: application/json { token, key }
//   - validates token + status + ownership (key prefix match)
//   - removes from R2 + from the prospect's step4 slice; finds the
//     containing field/array automatically
//
// R2 binding access: getCloudflareContext().env.ASSETS_BUCKET. Falls
// back to a 503 with a clear error if the binding is missing — that
// means the wrangler.jsonc binding isn't in production yet, the
// bucket doesn't exist, or R2 isn't enabled on the account.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  getProspectByToken,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import {
  isOnboardingMutable,
  isOnboardingUnlocked,
  mergeStepData,
  onboardingDataSchema,
  type Asset,
  type ServiceAsset,
  type OnboardingData,
} from "@/lib/onboarding";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-file cap. Tightened from 10 MB → 5 MB on 2026-05-10:
// modern phones produce 3-4 MB photos at full quality, and the
// client-side compression in Step4Assets typically brings uploads
// under 1.5 MB before they ever reach this route. 5 MB is the
// ceiling for the rare case where a customer disables compression
// or uploads via a direct API call.
const MAX_BYTES = 5 * 1024 * 1024;

// Per-customer total cap across ALL asset slots (logo + hero + about
// + service photos + backgrounds + gallery + legacy photos). Stops a
// single overzealous customer from filling the bucket. With client-
// side compression the realistic average is ~20-30 MB, so 80 MB has
// plenty of headroom but blocks runaway uploads.
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

// Per-kind upload limits. Keep in sync with the schema in
// src/lib/onboarding.ts step4AssetsSchema.
const KIND_CAPS = {
  service: 10,
  background: 5,
  gallery: 20,
  photo: 20, // legacy
} as const;

type AssetKind =
  | "logo"
  | "hero"
  | "about"
  | "service"
  | "background"
  | "gallery"
  | "photo";

const VALID_KINDS: ReadonlySet<AssetKind> = new Set([
  "logo",
  "hero",
  "about",
  "service",
  "background",
  "gallery",
  "photo",
]);

// Subset of step 4 slice fields we mutate. Schema ground-truth lives
// in src/lib/onboarding.ts.
type Slice = {
  logo?: Asset;
  hero?: Asset;
  about?: Asset;
  services?: ServiceAsset[];
  backgrounds?: Asset[];
  gallery?: Asset[];
  photos?: Asset[];
  notes?: string;
};

// Cloudflare Workers R2 binding — minimum surface we use.
type R2BucketLike = {
  put: (
    key: string,
    body: ArrayBuffer | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
};

function getBucket(): R2BucketLike | null {
  try {
    const ctx = getCloudflareContext();
    const bucket = (ctx.env as Record<string, unknown>).ASSETS_BUCKET;
    return (bucket as R2BucketLike | undefined) ?? null;
  } catch {
    return null;
  }
}

function safeFilename(name: string): string {
  // Strip path separators, limit length, replace spaces and unsafe chars.
  const base = name.split(/[/\\]/).pop() ?? name;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-100); // keep extension on the right
}

// ---------- POST: upload ----------

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const token = String(form.get("token") ?? "");
  const kindRaw = String(form.get("kind") ?? "");
  const file = form.get("file");
  const serviceName = String(form.get("serviceName") ?? "").trim();

  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid token." },
      { status: 400 },
    );
  }
  if (!VALID_KINDS.has(kindRaw as AssetKind)) {
    return NextResponse.json(
      {
        error: `kind must be one of: ${Array.from(VALID_KINDS).join(", ")}.`,
      },
      { status: 400 },
    );
  }
  const kind = kindRaw as AssetKind;
  if (kind === "service") {
    if (!serviceName || serviceName.length > 200) {
      return NextResponse.json(
        {
          error:
            "Service uploads require a serviceName form field (1-200 chars) matching one of the customer's intake services.",
        },
        { status: 400 },
      );
    }
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file in upload." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (${formatBytes(file.size)}). Max is ${formatBytes(MAX_BYTES)} per file.`,
      },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    return NextResponse.json(
      {
        error:
          "Only PNG, JPEG, WebP and SVG images are accepted. Convert other formats first.",
      },
      { status: 400 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  if (!isOnboardingUnlocked(prospect.status)) {
    return NextResponse.json(
      { error: "Your onboarding link isn't active yet." },
      { status: 403 },
    );
  }
  if (!isOnboardingMutable(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Your onboarding is signed off — the Hub is now read-only. For any change requests (including new photos), use the 'Need a change?' form on your account dashboard.",
      },
      { status: 403 },
    );
  }

  const bucket = getBucket();
  if (!bucket) {
    return NextResponse.json(
      {
        error:
          "Asset storage isn't configured yet. If you've just enabled R2, please refresh in a few minutes.",
      },
      { status: 503 },
    );
  }

  // Parse the prospect's existing onboarding data once — used both
  // for the total-bytes cap check and for the slice merge below.
  const parsed = onboardingDataSchema.safeParse(prospect.onboardingData ?? {});
  const baseData: OnboardingData = parsed.success ? parsed.data : {};
  const currentSlice: Slice = (baseData.assets ?? {}) as Slice;

  // Total-bytes cap. Sum every asset already in this prospect's
  // step 4 slice + the incoming file; reject if it would breach
  // MAX_TOTAL_BYTES. Client-side compression in Step4Assets does
  // this same check pre-upload and shows a friendlier message;
  // the server check is the authoritative backstop for direct API
  // callers / disabled JS / racing parallel uploads.
  const currentTotal = sumAssetBytes(currentSlice);
  if (currentTotal + file.size > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        error:
          `You're at ${formatBytes(currentTotal)} / ${formatBytes(MAX_TOTAL_BYTES)} of your asset storage budget. ` +
          `Adding this ${formatBytes(file.size)} file would put you over. ` +
          `Delete some photos before adding more.`,
      },
      { status: 413 },
    );
  }

  // Generate the R2 key: assets/<token>/<kind>/<uuid>-<safe-filename>
  const id = crypto.randomUUID();
  const safe = safeFilename(file.name || `${kind}.bin`);
  const key = `assets/${token}/${kind}/${id}-${safe}`;

  // Upload to R2.
  try {
    const buf = await file.arrayBuffer();
    await bucket.put(key, buf, {
      httpMetadata: { contentType: file.type },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding/upload] R2 put error:", msg);
    return NextResponse.json(
      { error: "Upload to storage failed. Please try again." },
      { status: 500 },
    );
  }

  // Build the Asset record we'll persist in Notion.
  const newAsset: Asset = {
    key,
    filename: file.name || safe,
    size: file.size,
    contentType: file.type,
    uploadedAt: new Date().toISOString(),
  };

  // Per-kind routing for merging the new asset into the slice lives
  // in `mergeAsset` to keep this handler readable.
  const mergeResult = mergeAsset(currentSlice, kind, newAsset, {
    serviceName: kind === "service" ? serviceName : undefined,
  });
  if ("error" in mergeResult) {
    // Roll back the R2 put — we won't accept it.
    await bucket.delete(key).catch(() => {});
    return NextResponse.json({ error: mergeResult.error }, { status: 400 });
  }
  const { nextSlice, previousAsset } = mergeResult;

  const mergedData = mergeStepData(baseData, "assets", nextSlice);
  try {
    await updateProspectOnboarding(prospect.pageId, { data: mergedData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding/upload] Notion update error:", msg);
    // Best-effort R2 cleanup so we don't leave an orphaned object.
    await bucket.delete(key).catch(() => {});
    return NextResponse.json(
      { error: "Couldn't save just now. Please try again." },
      { status: 500 },
    );
  }

  // Best-effort: delete the old asset's R2 object after the new one
  // is safely persisted in Notion (single-replace kinds only).
  // Failure here is logged but doesn't affect the customer's flow.
  if (previousAsset?.key && previousAsset.key !== key) {
    bucket.delete(previousAsset.key).catch((err: unknown) => {
      console.warn(
        `[api/onboarding/upload] couldn't delete old ${kind}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  return NextResponse.json({ success: true, asset: newAsset, kind });
}

/**
 * Per-kind merge logic. Returns the next slice + (for single-replace
 * kinds) the previous asset that should be cleaned up from R2.
 * Returns `{ error }` for cap violations so the caller can roll back
 * the R2 upload.
 */
function mergeAsset(
  slice: Slice,
  kind: AssetKind,
  asset: Asset,
  opts: { serviceName?: string },
):
  | { nextSlice: Slice; previousAsset?: Asset }
  | { error: string } {
  switch (kind) {
    case "logo":
      return {
        nextSlice: { ...slice, logo: asset },
        previousAsset: slice.logo,
      };
    case "hero":
      return {
        nextSlice: { ...slice, hero: asset },
        previousAsset: slice.hero,
      };
    case "about":
      return {
        nextSlice: { ...slice, about: asset },
        previousAsset: slice.about,
      };
    case "service": {
      const existing = slice.services ?? [];
      if (existing.length >= KIND_CAPS.service) {
        return {
          error: `You're at the ${KIND_CAPS.service}-photo limit for service photos. Delete one before adding another.`,
        };
      }
      const sa: ServiceAsset = {
        ...asset,
        serviceName: opts.serviceName!,
      };
      return { nextSlice: { ...slice, services: [...existing, sa] } };
    }
    case "background": {
      const existing = slice.backgrounds ?? [];
      if (existing.length >= KIND_CAPS.background) {
        return {
          error: `You're at the ${KIND_CAPS.background}-image limit for background images. Delete one before adding another.`,
        };
      }
      return {
        nextSlice: { ...slice, backgrounds: [...existing, asset] },
      };
    }
    case "gallery": {
      const existing = slice.gallery ?? [];
      if (existing.length >= KIND_CAPS.gallery) {
        return {
          error: `You're at the ${KIND_CAPS.gallery}-photo gallery limit. Delete one before adding another.`,
        };
      }
      return { nextSlice: { ...slice, gallery: [...existing, asset] } };
    }
    case "photo": {
      // Legacy bucket, kept working so any old client doesn't break.
      const existing = slice.photos ?? [];
      if (existing.length >= KIND_CAPS.photo) {
        return {
          error: `You've reached the ${KIND_CAPS.photo}-photo limit. Delete one before adding another.`,
        };
      }
      return { nextSlice: { ...slice, photos: [...existing, asset] } };
    }
  }
}

// ---------- DELETE: remove one asset ----------

export async function DELETE(request: Request) {
  let body: { token?: unknown; key?: unknown };
  try {
    body = (await request.json()) as { token?: unknown; key?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token : "";
  const key = typeof body.key === "string" ? body.key : "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid token." },
      { status: 400 },
    );
  }
  if (!key) {
    return NextResponse.json(
      { error: "Missing asset key." },
      { status: 400 },
    );
  }
  // Critical: confirm the key belongs to this token's prefix. Otherwise
  // any authenticated customer could delete any other customer's
  // assets by guessing keys.
  if (!key.startsWith(`assets/${token}/`)) {
    return NextResponse.json(
      { error: "That asset doesn't belong to your account." },
      { status: 403 },
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  if (!isOnboardingUnlocked(prospect.status)) {
    return NextResponse.json(
      { error: "Your onboarding link isn't active yet." },
      { status: 403 },
    );
  }
  if (!isOnboardingMutable(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Your onboarding is signed off — the Hub is now read-only. For any change requests (including new photos), use the 'Need a change?' form on your account dashboard.",
      },
      { status: 403 },
    );
  }

  const bucket = getBucket();
  if (!bucket) {
    return NextResponse.json(
      { error: "Asset storage isn't configured yet." },
      { status: 503 },
    );
  }

  // Delete from R2 first; if it fails, we don't touch Notion. (If the
  // object's already gone — e.g. concurrent delete — R2 silently
  // succeeds, which is what we want.)
  try {
    await bucket.delete(key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding/upload DELETE] R2 delete error:", msg);
    return NextResponse.json(
      { error: "Couldn't remove the file from storage just now." },
      { status: 500 },
    );
  }

  // Update Notion: search across all single + array fields, remove
  // the matching key wherever it lives. Schema-aligned with the new
  // C5.3 asset roles.
  const parsed = onboardingDataSchema.safeParse(prospect.onboardingData ?? {});
  const baseData: OnboardingData = parsed.success ? parsed.data : {};
  const slice: Slice = (baseData.assets ?? {}) as Slice;
  const nextSlice = removeAssetByKey(slice, key);

  const mergedData = mergeStepData(baseData, "assets", nextSlice);
  try {
    await updateProspectOnboarding(prospect.pageId, { data: mergedData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/onboarding/upload DELETE] Notion update error:", msg);
    return NextResponse.json(
      {
        error:
          "File removed from storage, but couldn't update your record. Please refresh.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

/**
 * Remove the asset with the given key from wherever it lives in the
 * step 4 slice. Returns a new slice; doesn't mutate. Idempotent — if
 * the key isn't found, returns the slice unchanged.
 */
function removeAssetByKey(slice: Slice, key: string): Slice {
  let next: Slice = slice;
  if (slice.logo?.key === key) {
    const { logo: _drop, ...rest } = next;
    void _drop;
    next = rest;
  }
  if (slice.hero?.key === key) {
    const { hero: _drop, ...rest } = next;
    void _drop;
    next = rest;
  }
  if (slice.about?.key === key) {
    const { about: _drop, ...rest } = next;
    void _drop;
    next = rest;
  }
  if (Array.isArray(next.services)) {
    next = { ...next, services: next.services.filter((s) => s.key !== key) };
  }
  if (Array.isArray(next.backgrounds)) {
    next = {
      ...next,
      backgrounds: next.backgrounds.filter((b) => b.key !== key),
    };
  }
  if (Array.isArray(next.gallery)) {
    next = { ...next, gallery: next.gallery.filter((g) => g.key !== key) };
  }
  if (Array.isArray(next.photos)) {
    next = { ...next, photos: next.photos.filter((p) => p.key !== key) };
  }
  return next;
}

// ---------- Helpers ----------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Sum the byte size of every asset across every slot in a step 4
 * slice. Used by the upload route's MAX_TOTAL_BYTES check + the
 * Step4Assets client-side budget badge.
 *
 * Defensive on missing `size` values (Notion-stored assets always
 * carry a number, but a hand-edited slice could be malformed —
 * fall through with 0 rather than throwing).
 */
function sumAssetBytes(slice: Slice): number {
  let total = 0;
  if (slice.logo?.size) total += slice.logo.size;
  if (slice.hero?.size) total += slice.hero.size;
  if (slice.about?.size) total += slice.about.size;
  for (const s of slice.services ?? []) total += s.size ?? 0;
  for (const b of slice.backgrounds ?? []) total += b.size ?? 0;
  for (const g of slice.gallery ?? []) total += g.size ?? 0;
  for (const p of slice.photos ?? []) total += p.size ?? 0;
  return total;
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST or DELETE." },
    { status: 405, headers: { Allow: "POST, DELETE" } },
  );
}
