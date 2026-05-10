// /preview-locked — rendered by the middleware when someone tries
// to view this preview without the access token. Plain page, no
// site chrome (don't reveal the customer's brand to a stranger
// who guessed a Cloudflare preview URL).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Preview locked",
  robots: { index: false, follow: false },
};

export default function PreviewLockedPage() {
  return (
    <html lang="en">
      <head>
        <style>{`
          body {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            background: #f8f7f2;
            color: #1f2530;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
          }
          main {
            max-width: 32rem;
            text-align: center;
            background: white;
            padding: 3rem 2rem;
            border-radius: 1.25rem;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          }
          h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0 0 1rem;
          }
          p {
            margin: 0.75rem 0;
            color: #4a5160;
            line-height: 1.5;
          }
          a {
            color: #1d3a5f;
            font-weight: 600;
          }
        `}</style>
      </head>
      <body>
        <main>
          <h1>Preview locked</h1>
          <p>
            This preview can only be opened from your ModuForge
            dashboard.
          </p>
          <p>
            <a href="https://modu-forge.co.uk">
              Open ModuForge →
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
