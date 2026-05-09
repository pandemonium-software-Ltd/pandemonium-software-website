// Generates the per-customer placeholder Worker source code.
//
// This Worker gets uploaded by step2-domain (Stage 2C C2.3) right
// after the customer's domain is verified. It serves a tiny
// "your site is being built" page with the customer's name, so the
// domain isn't a 522 error while we wait for the customer to sign
// off Step 5 and the real site gets deployed.
//
// Output is a self-contained ES module Worker (per the modern
// Workers format). The customer's name is HTML-escaped and baked
// directly into the script — no env bindings needed, no template
// rendering at request time.
//
// Why this lives in the ops worker (not the customer's Worker):
// the ops worker only generates the SOURCE STRING. It then uploads
// that string as a brand-new Worker into the customer's Cloudflare
// account via uploadWorkerScript(). The customer's Worker runs
// independently in their account, billed against their own free
// tier (until the customer's traffic exceeds it).

/**
 * Generate the placeholder Worker module source.
 * Result is valid JS that exports a default fetch handler.
 */
export function placeholderScript(customerName: string): string {
  const safeName = escapeHtml(customerName);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeName} — coming soon</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 600px; margin: 4rem auto; padding: 2rem; text-align: center; color: #1e1b4b; line-height: 1.6; }
    h1 { font-size: 2.25rem; margin: 0 0 0.5rem; font-weight: 600; letter-spacing: -0.02em; }
    .blurb { color: #64748b; font-size: 1.1rem; }
    .footer { font-size: 0.85rem; margin-top: 4rem; color: #94a3b8; }
    a { color: #4f46e5; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>${safeName}</h1>
  <p class="blurb">Your new website is being built — back soon.</p>
  <p class="footer">Powered by <a href="https://moduforge.co.uk">ModuForge</a></p>
</body>
</html>`;

  // Use JSON.stringify to produce a JS string literal that handles
  // every escape correctly (newlines, quotes, backslashes). The
  // customer name is already HTML-escaped above; this layer just
  // makes the JS safe.
  return `export default {
  async fetch(request) {
    return new Response(${JSON.stringify(html)}, {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  }
};
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Derive the per-customer Worker name from the prospect's Phase 1
 * Unique Token. Locked-in convention per §10:
 *   `mf-<8-char-hex-prefix-of-token>` (e.g. `mf-d2f42fb6`)
 *
 * Cloudflare Worker names: lowercase alphanumeric + hyphens,
 * 1-63 chars. Our format is 11 chars — comfortably within limits.
 */
export function workerNameForProspect(token: string): string {
  // Extract the first hex segment of the (UUID-style) token, lowercase.
  // Defensive: handle non-UUID tokens by stripping non-alphanumeric
  // and taking the first 8 chars.
  const stripped = token.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const prefix = stripped.slice(0, 8) || "default";
  return `mf-${prefix}`;
}
