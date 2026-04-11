/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static HTML export — produces /out with plain HTML/CSS/JS for
  // deployment to Cloudflare Pages. No Node.js runtime required.
  output: "export",
  // next/image requires a loader; we use inline SVGs only, so turning
  // off built-in image optimisation keeps the static export working.
  images: {
    unoptimized: true,
  },
  // Security headers are defined in public/_headers (Cloudflare Pages
  // native format) because next.config's headers() is a no-op for
  // static exports.
};

export default nextConfig;
