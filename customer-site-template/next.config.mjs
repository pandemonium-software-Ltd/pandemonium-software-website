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
        // Future custom domain for R2 (assets.modu-forge.co.uk → R2
        // bucket). Not currently configured but kept here so it
        // works when the DNS lands.
        protocol: "https",
        hostname: "assets.modu-forge.co.uk",
      },
      {
        // R2 public bucket URLs — every R2 bucket gets a
        // pub-<hash>.r2.dev hostname when "Allow Public Access" is
        // enabled. The hash is per-bucket so we wildcard across
        // any customer's bucket.
        protocol: "https",
        hostname: "**.r2.dev",
      },
      {
        // Dev/fixture only — placehold.co for the local-dev fixture.
        // Safe to leave in production: the build never uses it.
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default nextConfig;
