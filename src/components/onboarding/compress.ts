// Client-side image compression for Hub Step 4 brand-asset uploads.
//
// Why client-side: keeps the originals out of R2 entirely (storage
// + serve costs), shifts the CPU cost to the customer's device
// (free for us), and avoids needing image-processing in Workers
// (sharp doesn't bundle, Cloudflare Images costs $5/mo + per-tx).
//
// Triggered when:
//   - file size > COMPRESS_SIZE_THRESHOLD (1.5 MB) OR
//   - any side > COMPRESS_DIMENSION_THRESHOLD (2400 px)
//
// Skipped when:
//   - file is SVG (vector — Canvas API would rasterise it badly)
//   - file is already under both thresholds (no-op)
//
// On compression failure, returns the original file rather than
// throwing — the upload still goes through, just at original size.
// Worst case the server's MAX_BYTES check catches a too-big file.

import imageCompression from "browser-image-compression";

/** Files larger than this get compressed. 1.5 MB is the sweet
 *  spot: most pages can serve <1.5 MB images without lazy-loading
 *  noticeably hurting LCP. */
const COMPRESS_SIZE_THRESHOLD_MB = 1.5;

/** Resize images wider/taller than this. 2400 px covers retina
 *  hero displays (1920px @ 2x = 3840 nominal but real viewport is
 *  rarely that wide; next/image's srcset breakpoints stop at 1920
 *  for non-retina, 3840 for retina; 2400 is a sensible mid-cap that
 *  keeps retina sharpness while shedding most of the surplus). */
const COMPRESS_DIMENSION_PX = 2400;

/** Bypass compression for these mime types. SVG = vector;
 *  rasterising it would inflate file size + lose scalability. */
const SKIP_TYPES = new Set(["image/svg+xml"]);

/**
 * Returns either the (smaller) compressed file or the original if
 * compression isn't worth it. Always returns SOME File so callers
 * don't need a separate failure path.
 */
export async function maybeCompress(file: File): Promise<File> {
  if (SKIP_TYPES.has(file.type.toLowerCase())) return file;

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
