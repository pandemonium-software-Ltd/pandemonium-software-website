/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static HTML export — produces /out with plain HTML/CSS/JS for
  // deployment as Cloudflare Workers Static Assets (see wrangler.jsonc).
  // No Node.js runtime required in production.
  output: "export",
  // next/image requires a loader; we use inline SVGs only, so turning
  // off built-in image optimisation keeps the static export working.
  images: {
    unoptimized: true,
  },
  // Security headers are defined in public/_headers (Cloudflare's
  // native headers format, respected by both Workers Static Assets
  // and Pages) because next.config's headers() is a no-op for
  // static exports.
};

export default nextConfig;
