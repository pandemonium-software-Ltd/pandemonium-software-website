import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SSR mode — deployed to per-customer Cloudflare Workers via
  // @opennextjs/cloudflare. Same setup as the marketing site.
  output: "standalone",
  // Root is THIS directory — the marketing-site repo at the repo
  // root has its own lockfile, which would otherwise cause Next
  // to treat the parent as the workspace root and nest standalone
  // output under `customer-site-template/`. Pinning here keeps
  // .next/standalone/.next/* paths flat (which OpenNext expects).
  outputFileTracingRoot: here,
  // R2 + future image optimization. Add the customer's R2 public
  // URL host so next/image will accept it as a remote source.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.modu-forge.co.uk",
      },
      {
        // Dev/fixture only — placehold.co for the local-dev fixture.
        // Safe to leave in production: the build never uses it.
        protocol: "https",
        hostname: "placehold.co",
      },
      // C5.3b will add per-customer hosts if customers ever upload
      // to their own R2 buckets (current model: shared bucket).
    ],
  },
};

export default nextConfig;
