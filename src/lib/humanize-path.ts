// Shared helpers for turning raw URL paths into something a
// non-technical small-business owner will recognise. Used by both
// the customer dashboard's Analytics tile and the monthly digest
// email so the two surfaces never disagree on what to call a page.
//
// Two helpers:
//   humanizePath()     — friendly label for any path
//   isMeaningfulPath() — true if the path is a real page (not an
//                        asset, probe, or framework chunk worth
//                        surfacing to a customer)

/** Turn a URL path into a friendly page name a non-technical
 *  customer will recognise. Examples:
 *    /                  → "Home"
 *    /contact           → "Contact"
 *    /our-services      → "Our services"
 *    /book              → "Book online"
 *    /blog/foo-bar      → "Blog: Foo bar"
 *
 *  Known one-word/short paths get curated labels from COMMON;
 *  unknown paths fall back to title-cased segments joined with
 *  ": " for nested paths. */
export function humanizePath(raw: string): string {
  const path = (raw || "/").split("?")[0].split("#")[0];
  if (path === "/" || path === "") return "Home";
  if (COMMON[path]) return COMMON[path];
  // Generic fallback: split on slashes, drop empties, title-case
  // each segment with dashes turned into spaces. Use ": " between
  // segments so "/blog/foo-bar" becomes "Blog: Foo bar".
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((seg) =>
      seg
        .replace(/-/g, " ")
        .replace(/^./, (c) => c.toUpperCase()),
    );
  return parts.join(": ");
}

/** Curated labels for paths likely to appear on UK trade /
 *  small-business sites. Singular + plural variants both mapped
 *  so the same label shows regardless of which the customer chose
 *  for their navigation. Each entry written in customer-friendly
 *  English ("Book online" not "/booking", "Get a quote" not
 *  "/quote"). */
const COMMON: Record<string, string> = {
  // Core nav
  "/contact": "Contact us",
  "/about": "About us",
  "/about-us": "About us",
  "/who-we-are": "About us",
  "/services": "Services",
  "/our-services": "Our services",
  "/what-we-do": "Services",
  // Bookings + enquiries
  "/book": "Book online",
  "/booking": "Book online",
  "/bookings": "Book online",
  "/enquire": "Enquire",
  "/enquiries": "Enquiries",
  "/enquiry": "Enquiry",
  "/quote": "Get a quote",
  "/quotes": "Get a quote",
  "/get-a-quote": "Get a quote",
  // Showcase
  "/work": "Our work",
  "/portfolio": "Portfolio",
  "/gallery": "Gallery",
  "/projects": "Projects",
  "/case-studies": "Case studies",
  "/images": "Images",
  "/photos": "Photos",
  // Social proof
  "/testimonials": "Testimonials",
  "/reviews": "Reviews",
  "/team": "The team",
  "/the-team": "The team",
  // Commerce
  "/pricing": "Pricing",
  "/prices": "Prices",
  "/shop": "Shop",
  "/products": "Products",
  "/products-services": "Products & services",
  // Content
  "/blog": "Blog",
  "/news": "News",
  "/articles": "Articles",
  // FAQ
  "/faq": "FAQs",
  "/faqs": "FAQs",
  "/frequently-asked-questions": "FAQs",
  // Legal
  "/privacy": "Privacy policy",
  "/privacy-policy": "Privacy policy",
  "/terms": "Terms",
  "/terms-and-conditions": "Terms & conditions",
  "/cookies": "Cookies policy",
  "/cookie-policy": "Cookies policy",
};

/** True if the path is worth showing in a "top pages" list — i.e.
 *  a real page a visitor saw, not an asset or a bot probe. Used to
 *  filter the top-pages aggregation in BOTH the dashboard
 *  Analytics tile and the monthly digest email so customers don't
 *  see "/favicon.ico" or "/wp-admin/install.php" as their #1 page.
 *
 *  Filters:
 *    /_next/*    → Next.js JS chunks + image proxy
 *    /wp-*       → WordPress probe attacks (every public site
 *                  gets these — not interesting)
 *    static asset files (.ico, .svg, .xml, .txt, .js, .css, .map,
 *                       common image extensions)
 *    /robots.txt, /sitemap.xml, /favicon.ico — explicit common cases */
export function isMeaningfulPath(raw: string): boolean {
  const path = (raw || "/").split("?")[0].split("#")[0];
  if (path === "" || path === "/") return true;
  if (path.startsWith("/_next/")) return false;
  if (path.startsWith("/wp-")) return false;
  if (path.includes("/wp-includes/")) return false;
  if (path.includes("/wp-admin/")) return false;
  // Explicit asset paths that show up in CF analytics.
  if (path === "/favicon.ico") return false;
  if (path === "/robots.txt") return false;
  if (path === "/sitemap.xml") return false;
  if (path === "/icon.svg") return false;
  if (path === "/apple-touch-icon.png") return false;
  // Extension-based catch-all for common static assets.
  const tail = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (
    [
      "ico",
      "svg",
      "css",
      "js",
      "map",
      "txt",
      "xml",
      "json",
      "woff",
      "woff2",
      "ttf",
      "otf",
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "avif",
      "mp4",
      "webm",
      "pdf",
    ].includes(tail)
  ) {
    return false;
  }
  return true;
}
