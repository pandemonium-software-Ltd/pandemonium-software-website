import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SSR mode — deployed to Cloudflare Workers via @opennextjs/cloudflare.
  // 'standalone' produces a self-contained .next/standalone/ directory
  // that OpenNext bundles into a Cloudflare Worker.
  output: "standalone",
  // Pin the trace root to this project. Without this, Next walks up to
  // find a package.json — and because our absolute path contains spaces
  // (".../Pandemonium Software Consulting Ltd/..."), Next decides it's
  // in a monorepo and nests the standalone bundle under the full
  // absolute path (.next/standalone/Pandemonium…/.next/server/).
  // opennextjs-cloudflare expects it at .next/standalone/.next/server/
  // and fails with ENOENT. Pinning the trace root to this directory
  // emits the standalone bundle at the canonical path.
  outputFileTracingRoot: __dirname,
  // Security headers are in public/_headers (Cloudflare-native format).
};

export default nextConfig;
