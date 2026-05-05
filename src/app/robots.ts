import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private routes — these are token-gated but no need to let
        // crawlers find the entry points. /admin is Basic Auth gated;
        // /api routes return 405 on GET; /qualify, /intake, /payment
        // each set robots: { index: false } via metadata, but listing
        // them here too is belt-and-braces.
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/qualify/",
          "/intake/",
          "/payment/",
        ],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
