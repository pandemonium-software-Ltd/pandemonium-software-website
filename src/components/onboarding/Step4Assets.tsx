"use client";

// Onboarding Hub — Step 4: Brand assets.
//
// Customer uploads their logo (one) and photos (up to 20). Each
// upload POSTs multipart to /api/onboarding/upload, which writes
// to R2 (moduforge-customer-assets bucket) and appends the asset
// record to the prospect's Onboarding Data step4 slice.
//
// Thumbnails:
//   - If a public R2 URL base is configured (R2_PUBLIC_URL_BASE env),
//     <img src={r2Public(asset.key)} /> renders the live thumbnail
//     straight from R2.
//   - If not (R2 not yet enabled or public access not configured),
//     we fall back to filename-only tiles. Upload still works; just
//     no in-page preview.
//
// Mark-done has no minimum count: customers without assets can flag
// that in the notes field and ModuForge supplies stock placeholders
// during the build. The "Update saved data" pattern from other
// steps applies here too — coming back to add or swap photos
// post-mark-done is fully supported.

import { useRef, useState } from "react";
import type { Asset } from "@/lib/onboarding";

type Props = {
  data: Record<string, unknown>;
  done: boolean;
  readOnly: boolean;
  /** Public URL base for R2 assets (e.g.
   *  https://pub-<hash>.r2.dev). Empty string = thumbnails not
   *  available; we render filename tiles instead. */
  r2PublicUrlBase: string;
  /** Token threaded through so the upload route can verify ownership. */
  token: string;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_PHOTOS = 20;

export default function Step4Assets({
  data,
  done,
  readOnly,
  r2PublicUrlBase,
  token,
  savePartial,
  markDone,
}: Props) {
  const initialLogo = (data.logo ?? null) as Asset | null;
  const initialPhotos = (Array.isArray(data.photos) ? data.photos : []) as Asset[];
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [logo, setLogo] = useState<Asset | null>(initialLogo);
  const [photos, setPhotos] = useState<Asset[]>(initialPhotos);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"none" | "logo" | "photo">(
    "none",
  );
  const [photoDrag, setPhotoDrag] = useState(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const disabled = readOnly;

  // ---------- Upload + delete ----------

  async function uploadOne(kind: "logo" | "photo", file: File) {
    setError(null);
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        success?: boolean;
        asset?: Asset;
        kind?: string;
        error?: string;
      };
      if (!res.ok || !json.success || !json.asset) {
        setError(json.error ?? "Upload failed. Try again.");
        return null;
      }
      if (kind === "logo") {
        setLogo(json.asset);
      } else {
        setPhotos((prev) => [...prev, json.asset!]);
      }
      return json.asset;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setUploading("none");
    }
  }

  async function uploadPhotos(files: File[]) {
    // Cap to remaining slots.
    const remaining = Math.max(0, MAX_PHOTOS - photos.length);
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(
        `You're at ${photos.length}/${MAX_PHOTOS} photos. Only ${remaining} more will be accepted from this batch.`,
      );
    }
    for (const f of toUpload) {
      // Sequential to keep error messages clear; total throughput is
      // dominated by R2 latency anyway.
      await uploadOne("photo", f);
    }
  }

  async function deleteAsset(key: string) {
    setError(null);
    try {
      const res = await fetch("/api/onboarding/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, key }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Couldn't remove that file.");
        return;
      }
      if (logo?.key === key) {
        setLogo(null);
      } else {
        setPhotos((prev) => prev.filter((p) => p.key !== key));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ---------- Step save / mark done ----------

  function buildPatch(): Record<string, unknown> {
    return {
      logo: logo ?? undefined,
      photos,
      notes: notes.trim(),
    };
  }

  async function handleSave() {
    setError(null);
    setPending("save");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't save just now. Try again.");
  }

  async function handleMarkDone() {
    setError(null);
    setPending("done");
    const ok = await markDone(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't mark done. Try again.");
  }

  async function handleUpdate() {
    setError(null);
    setPending("update");
    const ok = await savePartial(buildPatch());
    setPending("none");
    if (!ok) setError("Couldn't update just now. Try again.");
  }

  // ---------- Drag-and-drop ----------

  function onPhotoDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setPhotoDrag(false);
    if (disabled || uploading !== "none") return;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) void uploadPhotos(files);
  }

  return (
    <article className="rounded-3xl bg-white p-7 shadow-card md:p-10">
      <header className="border-b border-navy-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
          Step 4
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Brand assets
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
          Drop your logo and photos here. PNG, JPEG, WebP or SVG —
          10 MB per file, up to 20 photos. If you don&apos;t have
          good photos yet, flag that in the notes below and I&apos;ll
          use stock placeholders until you do.
        </p>
      </header>

      {/* ---------- A. Logo ---------- */}
      <section className="mt-7">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          A. Your logo
        </h3>
        <p className="mt-2 text-sm text-navy-600">
          One image. New uploads replace the previous logo automatically.
        </p>
        <details className="mt-3 rounded-lg border-2 border-navy-100 bg-cream-50 p-3 text-sm text-navy-700">
          <summary className="cursor-pointer font-semibold text-navy-900">
            Don&apos;t have a logo?
          </summary>
          <p className="mt-2">
            ModuForge doesn&apos;t supply logos — your brand identity
            should be yours, not mine. A few low-cost ways to get one:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              <a
                href="https://canva.com"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Canva
              </a>{" "}
              — free DIY logo maker; templates work surprisingly well
            </li>
            <li>
              <a
                href="https://fiverr.com"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Fiverr
              </a>{" "}
              — designer-made logos from £15-£50 (4-7 days)
            </li>
            <li>
              <a
                href="https://99designs.co.uk"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                99designs
              </a>{" "}
              — competition-style; multiple concepts to pick from
            </li>
          </ul>
          <p className="mt-2">
            You can save this step and come back once you&apos;ve got
            something. Your site can&apos;t go live without a logo.
          </p>
        </details>

        <div className="mt-4 flex flex-wrap items-start gap-4">
          {logo ? (
            <AssetTile
              asset={logo}
              r2PublicUrlBase={r2PublicUrlBase}
              onDelete={disabled ? undefined : () => deleteAsset(logo.key)}
              kind="logo"
            />
          ) : (
            <div className="flex h-32 w-32 flex-none items-center justify-center rounded-xl border-2 border-dashed border-navy-200 bg-cream-50 text-xs text-navy-500">
              No logo yet
            </div>
          )}
          <div>
            <input
              ref={logoInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              disabled={disabled || uploading !== "none"}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await uploadOne("logo", f);
                if (logoInputRef.current) logoInputRef.current.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={disabled || uploading !== "none"}
              className="btn-secondary"
            >
              {uploading === "logo"
                ? "Uploading…"
                : logo
                  ? "Replace logo"
                  : "Upload logo"}
            </button>
            <p className="mt-2 max-w-xs text-xs text-navy-500">
              SVG works best for logos — it scales perfectly to any
              size. PNG with a transparent background is the next best
              thing.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- B. Photos ---------- */}
      <section className="mt-9">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          B. Photos ({photos.length}/{MAX_PHOTOS})
        </h3>
        <p className="mt-2 text-sm text-navy-600">
          Drop photos in below or click to browse. They&apos;ll appear
          in the gallery on your site, on social cards when people
          share your pages, and in your Google Business Profile (if
          you bought that addon).
        </p>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && uploading === "none") setPhotoDrag(true);
          }}
          onDragLeave={() => setPhotoDrag(false)}
          onDrop={onPhotoDrop}
          onClick={() =>
            !disabled && uploading === "none" && photoInputRef.current?.click()
          }
          className={[
            "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
            photoDrag
              ? "border-ember-500 bg-ember-50"
              : "border-navy-200 bg-cream-50 hover:border-navy-400",
            disabled || uploading !== "none"
              ? "cursor-not-allowed opacity-60"
              : "",
          ].join(" ")}
        >
          <svg
            className="h-8 w-8 text-navy-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="mt-3 text-sm font-semibold text-navy-900">
            {uploading === "photo"
              ? "Uploading photo…"
              : "Drop photos here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-navy-500">
            PNG, JPEG, WebP — 10 MB each
          </p>
          <input
            ref={photoInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            disabled={disabled || uploading !== "none"}
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) await uploadPhotos(files);
              if (photoInputRef.current) photoInputRef.current.value = "";
            }}
          />
        </div>

        {/* Thumbnails grid */}
        {photos.length > 0 && (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <li key={p.key}>
                <AssetTile
                  asset={p}
                  r2PublicUrlBase={r2PublicUrlBase}
                  onDelete={disabled ? undefined : () => deleteAsset(p.key)}
                  kind="photo"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Notes + buttons ---------- */}
      <section className="mt-7">
        <label className="block">
          <span className="block text-sm font-semibold text-navy-900">
            Anything I should know? (optional)
          </span>
          <textarea
            value={notes}
            disabled={disabled}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. I don't have any photos yet — please use stock placeholders for now and I'll send you 5-6 good shots within a fortnight."
            rows={3}
            maxLength={2000}
            className="mt-2 w-full resize-y rounded-xl border-2 border-navy-200 bg-white px-4 py-3 text-base text-navy-900 outline-none focus:border-navy-900 disabled:bg-cream-50"
          />
        </label>

        {error && (
          <p className="mt-4 text-sm text-ember-700" role="alert">
            {error}
          </p>
        )}
      </section>

      <footer className="mt-7 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-6">
        {done ? (
          <>
            <p className="text-sm text-green-700" role="status">
              <strong>Done.</strong> Edit above and click Update if you
              add or swap anything.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={handleUpdate}
                disabled={pending !== "none"}
                className="btn-secondary"
              >
                {pending === "update" ? "Updating…" : "Update saved data"}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending !== "none" || disabled}
              className="btn-secondary"
            >
              {pending === "save" ? "Saving…" : "Save progress"}
            </button>
            <button
              type="button"
              onClick={handleMarkDone}
              disabled={pending !== "none" || disabled}
              className="btn-primary"
            >
              {pending === "done"
                ? "Marking done…"
                : "Mark this step done"}
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

// ---------- Asset tile ----------

function AssetTile({
  asset,
  r2PublicUrlBase,
  onDelete,
  kind,
}: {
  asset: Asset;
  r2PublicUrlBase: string;
  onDelete?: () => void;
  kind: "logo" | "photo";
}) {
  const url = r2PublicUrlBase
    ? `${r2PublicUrlBase.replace(/\/$/, "")}/${asset.key}`
    : "";
  const sizeLabel =
    asset.size < 1024
      ? `${asset.size} B`
      : asset.size < 1024 * 1024
        ? `${(asset.size / 1024).toFixed(1)} KB`
        : `${(asset.size / 1024 / 1024).toFixed(1)} MB`;
  return (
    <div
      className={[
        "relative flex flex-col overflow-hidden rounded-xl border-2 border-navy-100 bg-cream-50",
        kind === "logo" ? "h-32 w-32" : "aspect-square",
      ].join(" ")}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={asset.filename}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] text-navy-600">
          <span className="break-words">{asset.filename}</span>
        </div>
      )}
      <span className="absolute bottom-0 left-0 right-0 truncate bg-white/85 px-1.5 py-0.5 text-[10px] text-navy-700">
        {asset.filename} · {sizeLabel}
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Remove ${asset.filename}`}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-navy-900/85 text-white transition-colors hover:bg-ember-600"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 5l14 14M19 5L5 19"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
