/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SSR mode — deployed to Cloudflare Workers via @opennextjs/cloudflare.
  // 'standalone' produces a self-contained .next/standalone/ directory
  // that OpenNext bundles into a Cloudflare Worker.
  output: "standalone",
  // Security headers are in public/_headers (Cloudflare-native format).
};

export default nextConfig;
