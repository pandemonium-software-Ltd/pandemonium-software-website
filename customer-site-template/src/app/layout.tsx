// Root layout — applies the customer's brand colours as inline
// CSS custom properties, sets fonts, mounts the Header + Footer,
// and renders each page's body inside.
//
// `data-vibe` on <html> drives any vibe-specific CSS rules. For
// now only the modern vibe ships — others land in C5.7.

import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SITE_DATA } from "@/lib/site-data";
import { brandColorsStyleBlock } from "@/lib/colors";
import { buildLocalBusinessJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: {
    default: `${SITE_DATA.business.name} — ${SITE_DATA.business.type} in ${SITE_DATA.business.location || "the UK"}`,
    template: `%s — ${SITE_DATA.business.name}`,
  },
  description:
    SITE_DATA.copy.tagline ??
    `${SITE_DATA.business.name} — trusted local ${SITE_DATA.business.type.toLowerCase()}.`,
  metadataBase: new URL(`https://${SITE_DATA.domain}`),
  openGraph: {
    type: "website",
    siteName: SITE_DATA.business.name,
    images: [SITE_DATA.brandAssets.heroPhotoUrl],
  },
  // Per-customer favicons land in C5.3 once the asset-tagging
  // redesign captures one. For now Next.js falls back to its default.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Inline style block sets the customer's brand colours as CSS
  // custom properties. Tailwind's `bg-brand-primary-500` etc. then
  // resolve against these. Inline (not external CSS) so they're
  // available before any stylesheet loads — no flash of wrong colour.
  const brandStyles = brandColorsStyleBlock(SITE_DATA.colors);

  // Site-wide LocalBusiness JSON-LD (with nested Review +
  // AggregateRating when the customer has 1+ testimonials). Sits
  // in <head> on every page so Google sees it on the homepage AND
  // any deep-linked subpage. Built server-side from SITE_DATA so
  // it ships as static HTML — no client JS, no hydration cost.
  const localBusinessJsonLd = buildLocalBusinessJsonLd(SITE_DATA);

  // Lock-down injection conditions. Two paths trigger the
  // right-click + DevTools suppressor inside the customer's site:
  //   (1) PREVIEW_ACCESS_TOKEN env var set — the version was
  //       uploaded as a post-commit preview (gated). Always inject.
  //   (2) Page accessed inside an iframe (window.self !== top) —
  //       the customer is viewing via the Hub or wrapper page on
  //       modu-forge.co.uk. Pre-commit live builds use this path
  //       since they don't have PREVIEW_ACCESS_TOKEN set.
  //
  // Path (2) is the wider net: it activates whenever any framing
  // happens, regardless of build mode. Live customer-site visitors
  // (browsing direct, not in a frame) get no suppression and the
  // actual site behaves normally — no JS injected at all.
  //
  // Determined viewers with DevTools enabled before page load can
  // bypass either path; that's a known limitation. Deters casual
  // URL extraction + sharing without breaking interactivity.
  const isPreviewMode = !!process.env.PREVIEW_ACCESS_TOKEN;

  return (
    <html
      lang="en"
      data-vibe={SITE_DATA.vibe}
      // suppressHydrationWarning is fine here — we set this on the
      // server and never change it client-side.
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: brandStyles }} />
        {/* JSON-LD structured data for Google. LocalBusiness is the
            base schema; nested Review + AggregateRating qualify the
            site for star-rating snippets in search results. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd),
          }}
        />
        {/* Always emit the suppressor script. The script
            runtime-checks whether to install listeners:
              install if PREVIEW_ACCESS_TOKEN is set (build-time
              constant inlined below) OR window.self !== window.top
              (we're in an iframe).
            Live, direct visitors hit neither condition and the
            script is a 1-line no-op — zero impact on real users. */}
        {/* eslint-disable-next-line react/no-danger */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var IN_PREVIEW_BUILD = ${isPreviewMode ? "true" : "false"};
                var IN_FRAME = window.self !== window.top;
                if (!IN_PREVIEW_BUILD && !IN_FRAME) return;
                document.addEventListener('contextmenu', function(e) {
                  e.preventDefault();
                }, true);
                document.addEventListener('keydown', function(e) {
                  if (e.key === 'F12') { e.preventDefault(); return; }
                  if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
                    e.preventDefault(); return;
                  }
                  if ((e.ctrlKey || e.metaKey) && e.shiftKey && /^(I|J|C)$/i.test(e.key)) {
                    e.preventDefault(); return;
                  }
                  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
                    e.preventDefault(); return;
                  }
                  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault(); return;
                  }
                }, true);
              })();
            `,
          }}
        />
        {/* Frame-ancestors enforcement: when we're in preview build
            mode, this is set by the Worker middleware. For the
            in-iframe-only case (pre-commit Hub embed), the customer-
            site Worker doesn't add the header, so the iframe
            embeds anywhere. The auth gate on the Hub side is the
            primary control there — direct workers.dev visits to a
            non-preview Worker pre-commit will work BUT the URL is
            never published anywhere, so the risk is the customer
            themselves accidentally sharing it. The hub-side iframe
            is the discoverable entry point. */}
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-navy-900 focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Header data={SITE_DATA} />
        <main id="main">{children}</main>
        <Footer data={SITE_DATA} />
      </body>
    </html>
  );
}
