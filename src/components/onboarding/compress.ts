// Client-side image compression for Hub Step 4 brand-asset uploads.
//
// Why client-side: keeps the originals out of R2 entirely (storage
// + serve costs), shifts the CPU cost to the customer's device
// (free for us), and avoids needing image-processing in Workers
// (sharp doesn't bundle, Cloudflare Images costs $5/mo + per-tx).
//
// Triggered when:
//   - file size > COMPRESS_SIZE_THRESHOLD (1 MB) OR
//   - any side > COMPRESS_DIMENSION_THRESHOLD (1920 px)
//
// HEIC handling:
//   - iPhone default camera format; Chrome/Firefox/Edge can't
//     decode it via Canvas. We lazy-import heic2any (~150 KB) to
//     convert HEIC → JPEG in the browser, then run the rest of
//     the compression pipeline. Lazy = non-iPhone uploads pay 0
//     bytes for this.
//
// Skipped when:
//   - file is SVG (vector — Canvas API would rasterise it badly)
//   - file is already under both thresholds (no-op)
//
// On compression failure, returns the original file rather than
// throwing — the upload still goes through, just at original size.
// Worst case the server's MAX_BYTES check catches a too-big file.

import imageCompression from "browser-image-compression";

/** Files larger than this get compressed. Tightened to 1 MB on
 *  2026-05-10 so that the 5 MB server cap is effectively
 *  unreachable for any normal phone/camera photo — most non-tech
 *  customers should never see a "file too big" error. Pages stay
 *  fast: 1 MB is comfortably under the LCP-friendly threshold. */
const COMPRESS_SIZE_THRESHOLD_MB = 1.0;

/** Resize images wider/taller than this. Tightened from 2400 →
 *  1920 px (Full HD) since next/image's srcset stops at 1920 for
 *  non-retina and customer sites don't target retina hero photos.
 *  Smaller cap = smaller bytes = faster pages on mobile. */
const COMPRESS_DIMENSION_PX = 1920;

/** Bypass compression for these mime types. SVG = vector;
 *  rasterising it would inflate file size + lose scalability. */
const SKIP_TYPES = new Set(["image/svg+xml"]);

/** HEIC/HEIF = the iPhone default camera format. Browser Canvas
 *  API can't decode it (Safari can, Chrome/Firefox/Edge can't),
 *  so we run a one-shot client-side conversion to JPEG via
 *  heic2any (lazy-loaded — non-iPhone customers pay zero bytes).
 *  After conversion the file falls through to the same
 *  compression path as a JPEG. */
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

/**
 * Returns either the (smaller) compressed file or the original if
 * compression isn't worth it. Always returns SOME File so callers
 * don't need a separate failure path.
 *
 * Pipeline:
 *   1. SVG → return as-is
 *   2. HEIC → lazy-load heic2any → convert to JPEG → fall through
 *   3. Already-small AND already-narrow → return as-is
 *   4. Anything else → run browser-image-compression
 */
export async function maybeCompress(file: File): Promise<File> {
  if (SKIP_TYPES.has(file.type.toLowerCase())) return file;

  // HEIC pre-step. Lazy import keeps the ~150 KB heic2any bundle
  // off non-iPhone uploads. After conversion, `file` is a JPEG and
  // the rest of the pipeline runs normally. Detect via mime type
  // OR file extension — Safari sometimes reports an empty type and
  // iPhone files are reliably named .heic/.heif.
  const lowerName = file.name.toLowerCase();
  const isHeic =
    HEIC_TYPES.has(file.type.toLowerCase()) ||
    /\.(heic|heif)$/.test(lowerName);
  if (isHeic) {
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9, // visually lossless; later compression step
        // will further squeeze if needed.
      });
      const blob = Array.isArray(converted) ? converted[0]! : converted;
      const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
      file = new File([blob], newName, {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    } catch (e) {
      console.warn(
        "[compress] HEIC decode failed, passing original through:",
        e instanceof Error ? e.message : String(e),
      );
      // Server will reject HEIC with a friendly message; we don't
      // want to silently store an unrenderable file.
      return file;
    }
  }

  // Cheap pre-check: if it's already under the size threshold, we
  // can skip the dimension check (which requires loading the image).
  // The library would also short-circuit, but skipping the work is
  // faster on slow devices.
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB <= COMPRESS_SIZE_THRESHOLD_MB) {
    // Still might need to resize a small-bytes-but-huge-dimensions
    // image (rare — e.g. an over-compressed 3000×3000 jpeg). The
    // library handles that, but only if we let it run. Cheaper to
    // peek at the dimensions ourselves.
    const dims = await peekDimensions(file).catch(() => null);
    if (!dims || (dims.width <= COMPRESS_DIMENSION_PX && dims.height <= COMPRESS_DIMENSION_PX)) {
      return file;
    }
  }

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: COMPRESS_SIZE_THRESHOLD_MB,
      maxWidthOrHeight: COMPRESS_DIMENSION_PX,
      // Web-worker keeps the main thread responsive while a 4 MB
      // JPEG is being re-encoded. Fall through gracefully (sync
      // path) on browsers without worker support.
      useWebWorker: true,
      // Preserve EXIF orientation flags so portrait phone photos
      // don't end up sideways. Library default is to strip; we
      // explicitly opt in.
      preserveExif: true,
      // Clamp the iteration count — the library by default keeps
      // halving quality until it gets under maxSizeMB. With the
      // 1.5 MB target + sane sources, 5 iterations is plenty and
      // stops a pathological input from spinning forever.
      maxIteration: 5,
    });
    // Defensive: only return the compressed file if it actually
    // got smaller. For some inputs (e.g. tiny optimised PNGs)
    // re-encoding can produce a slightly larger file.
    return compressed.size < file.size ? compressed : file;
  } catch (e) {
    // Compression failure shouldn't block the upload — surface to
    // console for debugging but pass the original through.
    console.warn(
      "[compress] failed, falling back to original:",
      e instanceof Error ? e.message : String(e),
    );
    return file;
  }
}

/**
 * Read an image's dimensions without fully decoding it. Returns
 * null on any failure (caller falls back to passing the file
 * through to the compression library which handles its own
 * dimension check).
 */
function peekDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}
