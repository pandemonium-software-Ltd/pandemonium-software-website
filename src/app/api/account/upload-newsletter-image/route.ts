// /api/account/upload-newsletter-image — post-launch image upload
// for the newsletter composer.
//
// POST multipart/form-data { token, file }
//   - Validates token + account status (must be in
//     ELIGIBLE_STATUSES so onboarding-phase customers can't hit
//     this endpoint to bypass the onboarding upload route).
//   - Validates image (content-type starts with image/, size ≤ 5MB).
//   - Puts to R2 under
//     `assets/<token>/newsletter/<uuid>-<safe-name>`.
//   - Returns { url } pointing at the R2 public URL. The composer
//     stores the URL in `draft.imageUrl` and the send route inlines
//     it into the email template's <img src="...">.
//
// Unlike the onboarding upload route, this one doesn't merge the
// uploaded asset into the prospect's onboardingData — newsletter
// images are per-send, not persisted on the prospect record. Each
// upload returns a fresh URL; the customer can swap images for each
// newsletter draft without juggling history.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getProspectByToken } from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — same ceiling as onboarding uploads.

// Accept the customer's current statuses where a newsletter send
// would actually fire. Pre-launch customers don't have the
// Newsletter module live yet on a customer-site, so blocking here
// stops orphan uploads accumulating in R2.
const ELIGIBLE_STATUSES = new Set([
  "Paid",
  "Onboarding Started",
  "Onboarding Complete",
  "Build Started",
  "Live",
]);

type R2BucketLike = {
  put: (
    key: string,
    body: ArrayBuffer | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
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
  const base = name.split(/[/\\]/).pop() ?? name;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-100);
}

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
  const file = form.get("file");

  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid token." },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded." },
      { status: 400 },
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      {
        error:
          "File must be an image (JPG, PNG, WebP, GIF). Got: " +
          (file.type || "unknown"),
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_BYTES / 1024 / 1024}MB.`,
      },
      { status: 413 },
    );
  }

  // Validate customer + status.
  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[upload-newsletter-image] Notion lookup error:", msg);
    return NextResponse.json(
      { error: "Couldn't look up your account. Please try again." },
      { status: 500 },
    );
  }
  if (!prospect) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 },
    );
  }
  if (!ELIGIBLE_STATUSES.has(prospect.status)) {
    return NextResponse.json(
      {
        error:
          "Newsletter image uploads are paused on this account.",
      },
      { status: 403 },
    );
  }

  // Put the file in R2.
  const bucket = getBucket();
  if (!bucket) {
    return NextResponse.json(
      {
        error:
          "Image storage isn't configured on this deployment. The ASSETS_BUCKET R2 binding is missing.",
      },
      { status: 503 },
    );
  }

  const id = crypto.randomUUID();
  const safe = safeFilename(file.name);
  const key = `assets/${token}/newsletter/${id}-${safe}`;
  try {
    const buf = await file.arrayBuffer();
    await bucket.put(key, buf, {
      httpMetadata: { contentType: file.type },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[upload-newsletter-image] R2 put failed:", msg);
    return NextResponse.json(
      { error: "Image upload failed. Try again." },
      { status: 500 },
    );
  }

  // Resolve the public URL — same R2_PUBLIC_URL_BASE the rest of
  // the customer site uses so the served image is on the same CDN
  // / hostname as their hero / about / gallery photos.
  const env = getServerEnv();
  const base = (env.R2_PUBLIC_URL_BASE ?? "https://assets.modu-forge.co.uk")
    .replace(/\/$/, "");
  const url = `${base}/${key}`;

  return NextResponse.json({ success: true, url, key });
}
