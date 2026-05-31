// /api/account/upload-photo — post-launch photo upload for the
// "Need a change?" quick-edit form.
//
// POST multipart/form-data { token, file, slot }
//   - Validates token + account status (Paid onwards)
//   - Validates image (PNG/JPEG/WebP, ≤ 5 MB)
//   - Puts to R2 under assets/<token>/cr-photo/<uuid>-<safe-name>
//   - Returns { url, key, filename } — the caller then submits a
//     change-request referencing the uploaded URL so the operator
//     knows which photo to swap.
//
// Unlike /api/onboarding/upload this does NOT merge into step4
// asset data — the operator/Cowork applies it when processing the
// change request. The file sits in R2 ready to be referenced.

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getProspectByToken } from "@/lib/notion-prospects";
import { getServerEnv } from "@/lib/env";
import { requireCustomerSession } from "@/lib/auth/require-customer-session";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

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
  const sessionAuth = await requireCustomerSession(request, token);
  if (!sessionAuth.ok) return sessionAuth.response;
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_BYTES / 1024 / 1024}MB.`,
      },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    return NextResponse.json(
      {
        error:
          "Only PNG, JPEG and WebP images are accepted. Got: " +
          (file.type || "unknown"),
      },
      { status: 400 },
    );
  }

  let prospect;
  try {
    prospect = await getProspectByToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[upload-photo] Notion lookup error:", msg);
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
      { error: "Photo uploads are paused on this account." },
      { status: 403 },
    );
  }

  const bucket = getBucket();
  if (!bucket) {
    return NextResponse.json(
      { error: "Image storage isn't configured yet." },
      { status: 503 },
    );
  }

  const id = crypto.randomUUID();
  const safe = safeFilename(file.name || "photo.bin");
  const key = `assets/${token}/cr-photo/${id}-${safe}`;
  try {
    const buf = await file.arrayBuffer();
    await bucket.put(key, buf, {
      httpMetadata: { contentType: file.type },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[upload-photo] R2 put failed:", msg);
    return NextResponse.json(
      { error: "Image upload failed. Try again." },
      { status: 500 },
    );
  }

  const env = getServerEnv();
  const base = (env.R2_PUBLIC_URL_BASE ?? "https://assets.modu-forge.co.uk")
    .replace(/\/$/, "");
  const url = `${base}/${key}`;

  return NextResponse.json({
    success: true,
    url,
    key,
    filename: file.name || safe,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
