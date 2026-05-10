"use client";

// Onboarding Hub — Step 4: Brand assets (C5.3b redesigned).
//
// Six semantic sections instead of the original Logo + Photos pair.
// Each section captures images by their ROLE on the customer's site:
//
//   A. Logo            single, replaces on re-upload
//   B. Hero photo      single, full-width on the home page
//   C. About / team    single, optional, appears on the About page
//   D. Service photos  per-service (mapped by service name from
//                      Phase 3 intake)
//   E. Backgrounds     up to 5 images for section dividers
//   F. Gallery         everything else, up to 20
//
// Plus a legacy `photos[]` array from before the redesign — shown
// alongside Gallery as "untagged photos" with a note. Customers can
// delete legacy photos through the same UI.
//
// Each upload goes to a different R2 path prefix
// (assets/<token>/<kind>/...) so role is encoded in the storage
// key as well as in Notion. The /api/onboarding/upload route
// validates the kind + (for service uploads) the serviceName.
//
// Mark-done has no minimum count. Customers without good photos can
// flag that in notes; ModuForge supplies stock placeholders during
// the build. The "Update saved data" pattern lets customers come
// back to swap or add photos post-mark-done.

import { useRef, useState } from "react";
import type { Asset, ServiceAsset } from "@/lib/onboarding";

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
  /** Service names from Phase 3 intake — drives the per-service
   *  photo upload slots. Empty list = no Phase 3 yet, in which case
   *  the Services section is hidden with a "complete Phase 3 first"
   *  hint. */
  services: ReadonlyArray<{ name: string }>;
  savePartial: (patch: Record<string, unknown>) => Promise<boolean>;
  markDone: (patch: Record<string, unknown>) => Promise<boolean>;
};

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_GALLERY = 20;
const MAX_BACKGROUNDS = 5;

type UploadKind =
  | "logo"
  | "hero"
  | "about"
  | "service"
  | "background"
  | "gallery";

export default function Step4Assets({
  data,
  done,
  readOnly,
  r2PublicUrlBase,
  token,
  services,
  savePartial,
  markDone,
}: Props) {
  // ---------- Initial state from saved data ----------
  const initialLogo = (data.logo ?? null) as Asset | null;
  const initialHero = (data.hero ?? null) as Asset | null;
  const initialAbout = (data.about ?? null) as Asset | null;
  const initialServicePhotos = (
    Array.isArray(data.services) ? data.services : []
  ) as ServiceAsset[];
  const initialBackgrounds = (
    Array.isArray(data.backgrounds) ? data.backgrounds : []
  ) as Asset[];
  const initialGallery = (
    Array.isArray(data.gallery) ? data.gallery : []
  ) as Asset[];
  const initialLegacyPhotos = (
    Array.isArray(data.photos) ? data.photos : []
  ) as Asset[];
  const initialNotes = typeof data.notes === "string" ? data.notes : "";

  const [logo, setLogo] = useState<Asset | null>(initialLogo);
  const [hero, setHero] = useState<Asset | null>(initialHero);
  const [aboutPhoto, setAboutPhoto] = useState<Asset | null>(initialAbout);
  const [servicePhotos, setServicePhotos] = useState<ServiceAsset[]>(
    initialServicePhotos,
  );
  const [backgrounds, setBackgrounds] = useState<Asset[]>(initialBackgrounds);
  const [gallery, setGallery] = useState<Asset[]>(initialGallery);
  const [legacyPhotos, setLegacyPhotos] =
    useState<Asset[]>(initialLegacyPhotos);
  const [notes, setNotes] = useState(initialNotes);

  const [pending, setPending] = useState<
    "none" | "save" | "done" | "update"
  >("none");
  const [error, setError] = useState<string | null>(null);
  /** Identifies which slot is mid-upload so we can show the right
   *  "Uploading…" label + disable the right button. Format:
   *  "logo" | "hero" | "about" | `service:<serviceName>` | "background" | "gallery" | null */
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const disabled = readOnly;

  // ---------- Upload + delete ----------

  async function uploadOne(
    kind: UploadKind,
    file: File,
    opts?: { serviceName?: string },
  ): Promise<Asset | null> {
    setError(null);
    const slot =
      kind === "service" ? `service:${opts?.serviceName}` : kind;
    setUploadingSlot(slot);
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("kind", kind);
      fd.set("file", file);
      if (opts?.serviceName) fd.set("serviceName", opts.serviceName);
      const res = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        success?: boolean;
        asset?: Asset;
        error?: string;
      };
      if (!res.ok || !json.success || !json.asset) {
        setError(json.error ?? "Upload failed. Try again.");
        return null;
      }
      // Apply to local state mirroring server's per-kind behaviour.
      const asset = json.asset;
      switch (kind) {
        case "logo":
          setLogo(asset);
          break;
        case "hero":
          setHero(asset);
          break;
        case "about":
          setAboutPhoto(asset);
          break;
        case "service":
          setServicePhotos((prev) => [
            ...prev,
            { ...asset, serviceName: opts!.serviceName! },
          ]);
          break;
        case "background":
          setBackgrounds((prev) => [...prev, asset]);
          break;
        case "gallery":
          setGallery((prev) => [...prev, asset]);
          break;
      }
      return asset;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setUploadingSlot(null);
    }
  }

  async function uploadMany(
    kind: "background" | "gallery",
    files: File[],
  ) {
    const cap = kind === "gallery" ? MAX_GALLERY : MAX_BACKGROUNDS;
    const currentCount =
      kind === "gallery" ? gallery.length : backgrounds.length;
    const remaining = Math.max(0, cap - currentCount);
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(
        `You're at ${currentCount}/${cap} ${kind === "gallery" ? "gallery photos" : "backgrounds"}. Only ${remaining} more will be accepted.`,
      );
    }
    for (const f of toUpload) {
      // Sequential to keep error messages clear.
      await uploadOne(kind, f);
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
      // Drop locally from whichever bucket it lives in.
      if (logo?.key === key) setLogo(null);
      if (hero?.key === key) setHero(null);
      if (aboutPhoto?.key === key) setAboutPhoto(null);
      setServicePhotos((prev) => prev.filter((s) => s.key !== key));
      setBackgrounds((prev) => prev.filter((b) => b.key !== key));
      setGallery((prev) => prev.filter((g) => g.key !== key));
      setLegacyPhotos((prev) => prev.filter((p) => p.key !== key));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ---------- Save / mark-done ----------

  function buildPatch(): Record<string, unknown> {
    return {
      logo: logo ?? undefined,
      hero: hero ?? undefined,
      about: aboutPhoto ?? undefined,
      services: servicePhotos,
      backgrounds,
      gallery,
      // Legacy field — preserved on save so old uploads don't get
      // dropped silently. Customers can delete them individually.
      photos: legacyPhotos,
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
          Each section below maps to a specific spot on your site. The
          more you tag the photos by what they&apos;re for, the better
          the site fits together. PNG, JPEG, WebP or SVG; 10 MB per
          file. If you&apos;re short on photos, flag it in the notes
          and I&apos;ll use stock placeholders until you send me good
          ones.
        </p>
      </header>

      {/* ---------- A. Logo ---------- */}
      <SingleAssetSection
        title="A. Logo"
        helper="Appears in the site header, footer, and as your favicon. SVG works best — scales perfectly. PNG with a transparent background is the next-best."
        asset={logo}
        kind="logo"
        uploading={uploadingSlot === "logo"}
        anyUploading={uploadingSlot !== null}
        disabled={disabled}
        r2PublicUrlBase={r2PublicUrlBase}
        onUpload={(f) => uploadOne("logo", f)}
        onDelete={() => logo && deleteAsset(logo.key)}
        showLogoTips
      />

      {/* ---------- B. Hero ---------- */}
      <SingleAssetSection
        title="B. Hero photo"
        helper="The big one — appears full-width on your home page. Pick the strongest photo of your work or your team. Landscape format works best (4:3 or 16:9)."
        asset={hero}
        kind="hero"
        uploading={uploadingSlot === "hero"}
        anyUploading={uploadingSlot !== null}
        disabled={disabled}
        r2PublicUrlBase={r2PublicUrlBase}
        onUpload={(f) => uploadOne("hero", f)}
        onDelete={() => hero && deleteAsset(hero.key)}
      />

      {/* ---------- C. About / team ---------- */}
      <SingleAssetSection
        title="C. About / team photo"
        helper="Optional. A photo of you, your team, or a behind-the-scenes shot — appears on the About page. Helps customers feel they know who they're hiring."
        asset={aboutPhoto}
        kind="about"
        uploading={uploadingSlot === "about"}
        anyUploading={uploadingSlot !== null}
        disabled={disabled}
        r2PublicUrlBase={r2PublicUrlBase}
        onUpload={(f) => uploadOne("about", f)}
        onDelete={() => aboutPhoto && deleteAsset(aboutPhoto.key)}
        optional
      />

      {/* ---------- D. Service photos ---------- */}
      <section className="mt-9">
        <h3 className="font-serif text-lg font-semibold text-navy-900">
          D. Service photos
        </h3>
        <p className="mt-2 text-sm text-navy-600">
          Optional. Upload a photo for each service you offer — appears
          on the matching service card on your Services page. One photo
          per service is plenty.
        </p>
        {services.length === 0 ? (
          <p className="mt-4 rounded-lg border border-navy-100 bg-cream-50 p-4 text-sm text-navy-700">
            Your services list is empty. Add at least one service in
            the Site content step (or fill in the Phase 3 intake) and
            this section will list each one with its own upload slot.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {services.map((svc) => {
              // The current photo for this service (the most recent
              // upload wins if customer somehow uploaded twice for
              // the same name). Drop matches by name — order doesn't
              // matter, just identity.
              const currentPhoto = [...servicePhotos]
                .reverse()
                .find((sp) => sp.serviceName === svc.name);
              const slotKey = `service:${svc.name}`;
              const isUploading = uploadingSlot === slotKey;
              return (
                <ServicePhotoRow
                  key={svc.name}
                  serviceName={svc.name}
                  asset={currentPhoto ?? null}
                  uploading={isUploading}
                  anyUploading={uploadingSlot !== null}
                  disabled={disabled}
                  r2PublicUrlBase={r2PublicUrlBase}
                  onUpload={(f) =>
                    uploadOne("service", f, { serviceName: svc.name })
                  }
                  onDelete={() =>
                    currentPhoto && deleteAsset(currentPhoto.key)
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- E. Backgrounds ---------- */}
      <MultiAssetSection
        title={`E. Background images (${backgrounds.length}/${MAX_BACKGROUNDS})`}
        helper="Optional. Subtle imagery for section dividers — abstract textures, wide landscape shots, or soft brand patterns. Used for visual rhythm between content blocks."
        assets={backgrounds}
        kind="background"
        uploading={uploadingSlot === "background"}
        anyUploading={uploadingSlot !== null}
        disabled={disabled}
        r2PublicUrlBase={r2PublicUrlBase}
        max={MAX_BACKGROUNDS}
        onUpload={(files) => uploadMany("background", files)}
        onDelete={(key) => deleteAsset(key)}
      />

      {/* ---------- F. Gallery ---------- */}
      <MultiAssetSection
        title={`F. Gallery (${gallery.length}/${MAX_GALLERY})`}
        helper="Anything else worth showing — additional photos of your work, your premises, before-and-after shots. Used in social cards when people share your pages, and embedded in your Google Business Profile if you bought that addon."
        assets={gallery}
        kind="gallery"
        uploading={uploadingSlot === "gallery"}
        anyUploading={uploadingSlot !== null}
        disabled={disabled}
        r2PublicUrlBase={r2PublicUrlBase}
        max={MAX_GALLERY}
        onUpload={(files) => uploadMany("gallery", files)}
        onDelete={(key) => deleteAsset(key)}
      />

      {/* ---------- Legacy untagged photos ---------- */}
      {legacyPhotos.length > 0 && (
        <section className="mt-9 rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
          <h3 className="font-serif text-base font-semibold text-navy-900">
            Untagged photos from before the redesign
            <span className="ml-2 text-sm font-normal text-navy-600">
              ({legacyPhotos.length})
            </span>
          </h3>
          <p className="mt-2 text-sm text-navy-700">
            These were uploaded before each photo had a specific role.
            Currently they fall through to your Gallery + the first one
            becomes your Hero. Re-upload them into the right sections
            above when you have a moment, then delete them here.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {legacyPhotos.map((p) => (
              <li key={p.key}>
                <AssetTile
                  asset={p}
                  r2PublicUrlBase={r2PublicUrlBase}
                  onDelete={
                    disabled ? undefined : () => deleteAsset(p.key)
                  }
                  variant="square"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Notes + buttons ---------- */}
      <section className="mt-9">
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

// ---------- Single-asset section ----------
//
// Used for Logo, Hero, About — each is a single image that gets
// replaced on re-upload. Layout: title + helper copy + tile + button.

function SingleAssetSection({
  title,
  helper,
  asset,
  kind,
  uploading,
  anyUploading,
  disabled,
  r2PublicUrlBase,
  onUpload,
  onDelete,
  showLogoTips,
  optional,
}: {
  title: string;
  helper: string;
  asset: Asset | null;
  kind: UploadKind;
  uploading: boolean;
  anyUploading: boolean;
  disabled: boolean;
  r2PublicUrlBase: string;
  onUpload: (file: File) => Promise<Asset | null>;
  onDelete: () => void;
  /** Logo-specific extras: collapsible "don't have a logo?" callout. */
  showLogoTips?: boolean;
  /** Tag the section as optional in the heading. */
  optional?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <section className="mt-9">
      <h3 className="font-serif text-lg font-semibold text-navy-900">
        {title}
        {optional && (
          <span className="ml-2 text-sm font-normal text-navy-500">
            (optional)
          </span>
        )}
      </h3>
      <p className="mt-2 text-sm text-navy-600">{helper}</p>

      {showLogoTips && (
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
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-4">
        {asset ? (
          <AssetTile
            asset={asset}
            r2PublicUrlBase={r2PublicUrlBase}
            onDelete={disabled ? undefined : onDelete}
            variant={kind === "logo" ? "logo" : "wide"}
          />
        ) : (
          <div
            className={[
              "flex flex-none items-center justify-center rounded-xl border-2 border-dashed border-navy-200 bg-cream-50 text-xs text-navy-500",
              kind === "logo" ? "h-32 w-32" : "h-32 w-48",
            ].join(" ")}
          >
            None yet
          </div>
        )}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            disabled={disabled || anyUploading}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await onUpload(f);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || anyUploading}
            className="btn-secondary"
          >
            {uploading
              ? "Uploading…"
              : asset
                ? `Replace ${kind}`
                : `Upload ${kind}`}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------- Per-service photo row ----------
//
// One row per service. Compact horizontal layout: service name +
// thumbnail + upload/replace button.

function ServicePhotoRow({
  serviceName,
  asset,
  uploading,
  anyUploading,
  disabled,
  r2PublicUrlBase,
  onUpload,
  onDelete,
}: {
  serviceName: string;
  asset: ServiceAsset | null;
  uploading: boolean;
  anyUploading: boolean;
  disabled: boolean;
  r2PublicUrlBase: string;
  onUpload: (file: File) => Promise<Asset | null>;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-xl border border-navy-100 bg-cream-50 p-4">
      {asset ? (
        <AssetTile
          asset={asset}
          r2PublicUrlBase={r2PublicUrlBase}
          onDelete={disabled ? undefined : onDelete}
          variant="thumb"
        />
      ) : (
        <div className="flex h-20 w-20 flex-none items-center justify-center rounded-lg border-2 border-dashed border-navy-200 bg-white text-[10px] text-navy-500">
          No photo
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900">
          {serviceName}
        </p>
        <p className="text-xs text-navy-600">
          {asset ? "Photo set" : "Optional — add one if you have a good shot"}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        disabled={disabled || anyUploading}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await onUpload(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || anyUploading}
        className="rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 hover:border-navy-400 disabled:opacity-50"
      >
        {uploading ? "Uploading…" : asset ? "Replace" : "Upload"}
      </button>
    </li>
  );
}

// ---------- Multi-asset bucket section ----------
//
// Used for Backgrounds + Gallery. Drag-drop dropzone + thumbnail
// grid with delete buttons.

function MultiAssetSection({
  title,
  helper,
  assets,
  kind,
  uploading,
  anyUploading,
  disabled,
  r2PublicUrlBase,
  max,
  onUpload,
  onDelete,
}: {
  title: string;
  helper: string;
  assets: Asset[];
  kind: "background" | "gallery";
  uploading: boolean;
  anyUploading: boolean;
  disabled: boolean;
  r2PublicUrlBase: string;
  max: number;
  onUpload: (files: File[]) => Promise<void>;
  onDelete: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const atCap = assets.length >= max;

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || anyUploading || atCap) return;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) void onUpload(files);
  }

  return (
    <section className="mt-9">
      <h3 className="font-serif text-lg font-semibold text-navy-900">
        {title}
      </h3>
      <p className="mt-2 text-sm text-navy-600">{helper}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !anyUploading && !atCap) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() =>
          !disabled &&
          !anyUploading &&
          !atCap &&
          inputRef.current?.click()
        }
        className={[
          "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
          dragOver
            ? "border-ember-500 bg-ember-50"
            : "border-navy-200 bg-cream-50 hover:border-navy-400",
          disabled || anyUploading || atCap
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
          {atCap
            ? `At ${max}-${kind === "gallery" ? "photo" : "image"} limit — delete one to add more`
            : uploading
              ? "Uploading…"
              : `Drop ${kind === "gallery" ? "photos" : "images"} here, or click to browse`}
        </p>
        <p className="mt-1 text-xs text-navy-500">
          PNG, JPEG, WebP — 10 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          disabled={disabled || anyUploading || atCap}
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) await onUpload(files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {assets.length > 0 && (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((a) => (
            <li key={a.key}>
              <AssetTile
                asset={a}
                r2PublicUrlBase={r2PublicUrlBase}
                onDelete={disabled ? undefined : () => onDelete(a.key)}
                variant="square"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Asset tile ----------
//
// Reused across all sections with different size variants:
//   - logo:   square 8rem (matches old behaviour)
//   - wide:   landscape 12rem × 8rem (hero / about preview)
//   - thumb:  small 5rem (per-service row)
//   - square: aspect-square (gallery / background grid items)

function AssetTile({
  asset,
  r2PublicUrlBase,
  onDelete,
  variant,
}: {
  asset: Asset;
  r2PublicUrlBase: string;
  onDelete?: () => void;
  variant: "logo" | "wide" | "thumb" | "square";
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
  const sizeClass =
    variant === "logo"
      ? "h-32 w-32"
      : variant === "wide"
        ? "h-32 w-48"
        : variant === "thumb"
          ? "h-20 w-20"
          : "aspect-square";
  const objectClass = variant === "logo" ? "object-contain" : "object-cover";
  return (
    <div
      className={[
        "relative flex flex-col overflow-hidden rounded-xl border-2 border-navy-100 bg-cream-50",
        sizeClass,
      ].join(" ")}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={asset.filename}
          className={`h-full w-full ${objectClass} ${variant === "logo" ? "p-2" : ""}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] text-navy-600">
          <span className="break-words">{asset.filename}</span>
        </div>
      )}
      {variant !== "thumb" && (
        <span className="absolute bottom-0 left-0 right-0 truncate bg-white/85 px-1.5 py-0.5 text-[10px] text-navy-700">
          {asset.filename} · {sizeLabel}
        </span>
      )}
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
