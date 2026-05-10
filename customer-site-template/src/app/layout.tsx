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
