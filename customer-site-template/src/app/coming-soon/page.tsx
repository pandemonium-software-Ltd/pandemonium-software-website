import type { Metadata } from "next";
import { SITE_DATA } from "@/lib/site-data";

export const metadata: Metadata = {
  title: `${SITE_DATA.business.name} — Coming Soon`,
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  const name = SITE_DATA.business.name;
  const logoUrl = SITE_DATA.brandAssets.logoUrl;
  const primary = SITE_DATA.colors.primary;

  return (
    <html lang="en">
      <head>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            background: #fafaf9;
            color: #1f2937;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
          }
          main {
            max-width: 28rem;
            text-align: center;
          }
          .logo {
            width: 80px;
            height: 80px;
            object-fit: contain;
            margin: 0 auto 1.5rem;
            border-radius: 0.75rem;
          }
          h1 {
            font-size: 1.75rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 0.75rem;
          }
          .divider {
            width: 3rem;
            height: 3px;
            background: ${primary};
            border-radius: 2px;
            margin: 0 auto 1.25rem;
          }
          p {
            color: #6b7280;
            font-size: 1.05rem;
            line-height: 1.6;
          }
        `}</style>
      </head>
      <body>
        <main>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="logo" src={logoUrl} alt="" />
          )}
          <h1>{name}</h1>
          <div className="divider" />
          <p>Our new website is launching soon.</p>
        </main>
      </body>
    </html>
  );
}
