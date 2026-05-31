// Root layout — applies the customer's brand colours as inline
// CSS custom properties, sets fonts, mounts the Header + Footer,
// and renders each page's body inside.
//
// `data-vibe` on <html> drives vibe-specific CSS rules (see
// globals.css for the per-vibe variable overrides — fonts, corner
// radii, heading weight, body letter-spacing). The matching font
// pair is loaded here from Google Fonts based on the customer's
// vibe so each build ships only the fonts it actually uses.
//
// Four vibes ship today: modern (default — Geist), traditional
// (Playfair Display + Lora), premium (Cormorant Garamond + Inter),
// friendly (Nunito).

import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieNotice from "@/components/CookieNotice";
import { SITE_DATA } from "@/lib/site-data";
import { brandColorsStyleBlock } from "@/lib/colors";
import { buildLocalBusinessJsonLd } from "@/lib/jsonld";

/** Google Fonts stylesheet URLs per vibe. Each pair covers the
 *  heading + body families referenced in globals.css's
 *  `[data-vibe="..."]` blocks. Only the customer's chosen vibe's
 *  pair is loaded per build — keeps the request weight tight.
 *
 *  Adding a new vibe: pick fonts that read distinctively from the
 *  existing four, update globals.css variable overrides, add the
 *  Google Fonts URL here, extend the Vibe enum in site-generator
 *  types.ts + adapter.ts VALID_VIBES. */
const VIBE_FONTS_URL: Record<string, string> = {
  // Geist — clean contemporary sans, the design-system default.
  modern:
    "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono&display=swap",
  // Playfair Display headings + Lora body — classic serif duo,
  // reads as an established firm with print heritage.
  traditional:
    "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Lora:wght@400;500;600&display=swap",
  // Cormorant Garamond display + Inter body — refined high-end
  // pairing, Cormorant's airy weights work for premium feel.
  premium:
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap",
  // Nunito — rounded humanist sans, warm + approachable. Used for
  // both heading + body so the friendly look stays unified.
  friendly:
    "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap",
};

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

  // Pick the Google Fonts URL for the customer's vibe. Each entry
  // covers BOTH heading + body font families (paired so the CSS
  // var fallbacks in globals.css always resolve to a loaded face).
  // Geist is the default for modern; the unknown-vibe branch also
  // uses Geist as a safe baseline.
  const fontsUrl = VIBE_FONTS_URL[SITE_DATA.vibe] ?? VIBE_FONTS_URL.modern;

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
        <link rel="stylesheet" href={fontsUrl} />
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
        {/* Cookie disclosure banner — only essential cookies are
         *  used (Cloudflare + Cal.com session), so this is a notice
         *  not a consent toggle. See CookieNotice.tsx head comment
         *  for the legal reasoning. */}
        <CookieNotice />
        {/* Propagate ?pa= preview-access token across client-side
         *  navigations so the middleware gate passes on every page
         *  when viewed inside the Hub iframe. Third-party cookies
         *  are blocked in Safari/Chrome iframes, so sessionStorage
         *  is the only reliable cross-page persistence. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var k="pa",s=sessionStorage,p=new URLSearchParams(location.search).get(k);if(p)s.setItem(k,p);var t=s.getItem(k);if(!t)return;document.addEventListener("click",function(e){var a=e.target;while(a&&a.tagName!=="A")a=a.parentElement;if(!a||!a.href)return;try{var u=new URL(a.href);if(u.origin===location.origin&&!u.searchParams.has(k)){u.searchParams.set(k,t);a.href=u.toString()}}catch(x){}})})();`,
          }}
        />
      </body>
    </html>
  );
}
