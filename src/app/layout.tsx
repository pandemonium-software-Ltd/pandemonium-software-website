import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { site } from "@/lib/site";
import { VIBE_PREVIEW_FONTS_URL } from "@/components/VibePreview";
import "./globals.css";

const serif = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.shortName} — Websites for UK trades and small businesses`,
    template: `%s · ${site.shortName}`,
  },
  description: site.description,
  keywords: [
    "UK small business website",
    "UK tradesmen website",
    "Oxfordshire small business website",
    "plumber website UK",
    "electrician website UK",
    "builder website UK",
    "trades website design",
    "photographer website UK",
    "therapist website UK",
    "flat-fee small business website",
    "ModuForge",
  ],
  authors: [{ name: "Ben Pandher" }],
  // creator / publisher are the legal entity for SEO / structured data.
  creator: site.name,
  publisher: site.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: site.url,
    title: `${site.shortName} — Websites for UK trades and small businesses`,
    description: site.description,
    siteName: site.shortName,
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.shortName} — Websites for UK trades and small businesses`,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1d30",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${site.url}/#organization`,
    name: site.name,
    description: site.description,
    url: site.url,
    email: site.contactEmail,
    address: {
      "@type": "PostalAddress",
      addressLocality: site.location.city,
      addressRegion: site.location.region,
      addressCountry: site.location.countryCode,
    },
    areaServed: {
      "@type": "AdministrativeArea",
      name: site.location.region,
    },
    priceRange: "££",
  };

  return (
    <html lang="en-GB" className={`${serif.variable} ${sans.variable}`}>
      <head>
        {/* Preconnect + stylesheet for the 6 font families used by
            <VibePreview /> on the homepage gallery + the intake-form
            vibe picker. Single combined Google Fonts request covers
            all four vibes so the previews render in the right
            typeface immediately. Loaded once at the layout level so
            pages with multiple previews don't duplicate the request. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={VIBE_PREVIEW_FONTS_URL} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd),
          }}
        />
      </body>
    </html>
  );
}
