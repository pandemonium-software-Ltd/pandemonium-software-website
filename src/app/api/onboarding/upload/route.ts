// /api/onboarding/upload — Hub Step 4 brand-asset uploads.
//
// POST: multipart/form-data { token, kind: "logo" | "photo", file }
//   - validates token + onboarding-unlocked status
//   - validates file (content type + size)
//   - generates an R2 key like assets/<token>/<kind>/<uuid>-<safe-name>
//   - puts via the ASSETS_BUCKET R2 binding
//   - for kind="logo": replaces previous logo (best-effort old-key delete)
//   - for kind="photo": appends to the photos array (max 20)
//   - merges Asset record into the prospect's Onboarding Data step4 slice
//
// DELETE: application/json { token, key }
//   - validates token + status
//   - validates the key belongs to this prospect (key starts with
//     assets/<token>/) so customers can't delete each other's assets
//   - removes from R2 + from the prospect's step4 slice (clears logo
//     if it was the logo, filters photos array otherwise)
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
  isOnboardingUnlocked,
  mergeStepData,
  onboardingDataSchema,
  type Asset,
  type OnboardingData,
} from "@/lib/onboarding";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

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
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");

  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid token." },
      { status: 400 },
    );
  }
  if (kind !== "logo" && kind !== "photo") {
    return NextResponse.json(
      { error: "kind must be 'logo' or 'photo'." },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file in upload." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "Empty file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (${formatBytes(file.size)}). Max is 10 MB per file.`,
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

  // Read current onboarding data + merge the new asset in. For
  // kind="logo" we replace any existing logo (and best-effort delete
  // the old R2 object). For kind="photo" we append to the photos
  // array (capping at 20 to match the schema).
  const parsed = onboardingDataSchema.safeParse(prospect.onboardingData ?? {});
  const baseData: OnboardingData = parsed.success ? parsed.data : {};
  const currentSlice = (baseData.assets ?? {}) as {
    logo?: Asset;
    photos?: Asset[];
    notes?: string;
  };
  const previousLogo = currentSlice.logo;
  let nextSlice: typeof currentSlice;

  if (kind === "logo") {
    nextSlice = { ...currentSlice, logo: newAsset };
  } else {
    const existing = Array.isArray(currentSlice.photos)
      ? currentSlice.photos
      : [];
    if (existing.length >= 20) {
      // Roll back the R2 put — we won't accept it.
      await bucket.delete(key).catch(() => {});
      return NextResponse.json(
        {
          error:
            "You've reached the 20-photo limit. Delete one before adding another.",
        },
        { status: 400 },
      );
    }
    nextSlice = { ...currentSlice, photos: [...existing, newAsset] };
  }

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

  // Best-effort: delete the old logo's R2 object after the new one is
  // safely persisted in Notion. Failure here is logged but doesn't
  // affect the customer's flow.
  if (kind === "logo" && previousLogo?.key && previousLogo.key !== key) {
    bucket.delete(previousLogo.key).catch((err: unknown) => {
      console.warn(
        "[api/onboarding/upload] couldn't delete old logo:",
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  return NextResponse.json({ success: true, asset: newAsset, kind });
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

  // Update Notion: clear logo if it matches, else filter photos.
  const parsed = onboardingDataSchema.safeParse(prospect.onboardingData ?? {});
  const baseData: OnboardingData = parsed.success ? parsed.data : {};
  const currentSlice = (baseData.assets ?? {}) as {
    logo?: Asset;
    photos?: Asset[];
    notes?: string;
  };
  let nextSlice: typeof currentSlice = currentSlice;
  if (currentSlice.logo?.key === key) {
    const { logo: _drop, ...rest } = currentSlice;
    void _drop;
    nextSlice = rest;
  } else if (Array.isArray(currentSlice.photos)) {
    nextSlice = {
      ...currentSlice,
      photos: currentSlice.photos.filter((p) => p.key !== key),
    };
  }

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

// ---------- Helpers ----------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST or DELETE." },
    { status: 405, headers: { Allow: "POST, DELETE" } },
  );
}
