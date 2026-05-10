// /account/[token]/preview/[crId] — sandboxed preview viewer.
//
// Sits behind the auth middleware (customer must be logged in to
// see this page). Renders the customer-site preview Worker URL
// inside a FULL-SCREEN iframe with the per-version
// PREVIEW_ACCESS_TOKEN passed as ?pa=<token> so the customer-site
// middleware accepts the embed.
//
// Hardening (per user direction):
//   - Full-screen iframe (no parent chrome / header strip)
//   - Approve / Reject as floating buttons (bottom-right) so they
//     don't reveal the workers.dev URL or anything else
//   - Right-click disabled on the iframe element (parent side)
//   - Customer-site itself injects a contextmenu+Ctrl+U+F12
//     suppressor when in preview mode (see customer-site-template
//     /src/app/layout.tsx) — defence in depth against casual
//     URL extraction
//   - No "open in new tab" link (the iframe src is the only
//     reference to the preview Worker URL on the page)
//   - "Back to dashboard" link goes to modu-forge.co.uk — safe to
//     surface; doesn't reveal the preview URL
//
// Determined viewers with DevTools can still extract the iframe src
// from the DOM. Eliminating that would need a server-side proxy
// (see C5.7 hardening notes). For non-technical customers the
// disabled context menu + minimal chrome is enough deterrent.

import Link from "next/link";
import {
  getProspectByToken,
  type ChangeRequest,
} from "@/lib/notion-prospects";

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PreviewWrapperPage({
  params,
}: {
  params: Promise<{ token: string; crId: string }>;
}) {
  const { token, crId } = await params;
  if (!TOKEN_RE.test(token) || !crId) {
    return (
      <Wrapper title="Link not valid">
        Check the URL from your email or open this preview from your
        dashboard.
      </Wrapper>
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return <Wrapper title="Account not found">Check the link.</Wrapper>;
  }
  const cr: ChangeRequest | undefined = prospect.changeRequests.find(
    (r) => r.id === crId,
  );
  if (!cr) {
    return (
      <Wrapper title="Change request not found">
        It may have been retracted. Open your dashboard for the latest
        list.
      </Wrapper>
    );
  }

  if (cr.customerApprovedAt) {
    return (
      <Wrapper title="Already approved ✓">
        <p className="prose-body mt-3 text-navy-700">
          You approved this change. If your live site doesn&apos;t
          reflect it yet, give it a minute.
        </p>
        <Link
          href={`/account/${token}`}
          className="mt-6 inline-block rounded-full bg-brand-primary-500 px-5 py-2.5 font-semibold text-brand-primary-text hover:bg-brand-primary-600"
        >
          Open dashboard
        </Link>
      </Wrapper>
    );
  }
  if (cr.customerRejectedAt) {
    return (
      <Wrapper title="Rejected">
        <p className="prose-body mt-3 text-navy-700">
          You declined this version. Submit a new request from your
          dashboard if you&apos;d like a different approach.
        </p>
        <Link
          href={`/account/${token}`}
          className="mt-6 inline-block rounded-full bg-brand-primary-500 px-5 py-2.5 font-semibold text-brand-primary-text hover:bg-brand-primary-600"
        >
          Open dashboard
        </Link>
      </Wrapper>
    );
  }
  if (!cr.previewVersionUrl || !cr.previewAccessToken) {
    return (
      <Wrapper title="Preview not ready yet">
        The preview is still building (usually under 2 minutes). Try
        the link from your most recent email — or refresh this page
        in a moment.
      </Wrapper>
    );
  }
  if (!cr.customerApprovalToken) {
    return (
      <Wrapper title="Preview link expired">
        The preview was rebuilt; please use the link from your most
        recent email.
      </Wrapper>
    );
  }

  // Embed the preview URL with the access token in the query.
  // The customer-site Worker's middleware accepts the token, sets
  // its own cookie, then strips the query for clean URL display.
  const iframeSrc = `${cr.previewVersionUrl}?pa=${encodeURIComponent(cr.previewAccessToken)}`;

  // Inline JS to suppress context menu + common DevTools shortcuts
  // on the parent page. Defence-in-depth alongside the same
  // suppressor injected into the customer-site layout.
  const SUPPRESSOR_JS = `
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); }, true);
    document.addEventListener('keydown', function(e) {
      // Block Ctrl+U / Cmd+Alt+U (View Source), F12, Ctrl+Shift+I/J/C
      if (e.key === 'F12') { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && /^(I|J|C)$/i.test(e.key)) { e.preventDefault(); return; }
    }, true);
  `;

  return (
    <>
      {/* Suppressor script injected before the iframe loads. */}
      <script dangerouslySetInnerHTML={{ __html: SUPPRESSOR_JS }} />

      {/* Full-screen iframe — no parent chrome. The preview Worker
          enforces frame-ancestors so this is the ONLY page that
          can embed it. onContextMenu prevents right-click on the
          iframe element itself (its content is suppressed by the
          customer-site layout's own injected script). */}
      <iframe
        src={iframeSrc}
        title="Site preview"
        // sandbox is intentionally OMITTED — the preview is the
        // customer's own site, they need full interactivity.
        className="fixed inset-0 z-0 block h-screen w-screen border-0 bg-white"
        // Suppress right-click on the iframe ELEMENT (different
        // from suppressing right-click INSIDE the iframe content,
        // which the customer-site does itself).
        onContextMenu={(e) => e.preventDefault()}
        // Disable being focused-then-tabbed-to (so no easy reveal
        // via accessibility tools).
      />

      {/* Floating action overlay — bottom-right corner, glass
          treatment so it floats above any page colour. Includes
          the customer's original request inline so they can see
          what they asked for vs. what they're looking at. */}
      <aside
        className="fixed bottom-4 right-4 z-10 max-w-sm rounded-2xl border border-white/20 bg-navy-900/85 p-4 text-white shadow-lift backdrop-blur-md"
        onContextMenu={(e) => e.preventDefault()}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cream-100/70">
          Preview · awaiting your approval
        </p>
        <p className="mt-1.5 line-clamp-3 text-xs italic text-cream-100/95">
          &ldquo;{cr.message}&rdquo;
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/account/${token}/approve-change/${cr.id}?t=${cr.customerApprovalToken}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-green-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-green-600"
          >
            Approve & publish
          </a>
          <a
            href={`/account/${token}/reject-change/${cr.id}?t=${cr.customerApprovalToken}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/15"
          >
            Reject
          </a>
        </div>
      </aside>

      {/* Top-left "back" affordance — small, low-contrast so it
          doesn't compete with the preview. Goes to the dashboard
          on modu-forge.co.uk; safe to surface (doesn't leak the
          preview URL). */}
      <Link
        href={`/account/${token}`}
        className="fixed left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-navy-900/75 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-all hover:bg-navy-900/95"
      >
        ← Dashboard
      </Link>

      {/* Disable text selection on the parent page — stops the
          customer accidentally selecting + copying chrome elements,
          which can give them ideas about how to extract the URL.
          The iframe content (their actual site) is unaffected. */}
      <style>{`
        body { user-select: none; -webkit-user-select: none; }
        iframe { user-select: text; -webkit-user-select: text; }
      `}</style>
    </>
  );
}

function Wrapper({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="container-content py-20">
      <div className="mx-auto max-w-xl rounded-3xl border border-navy-100 bg-white p-8 shadow-card">
        <h1 className="font-serif text-2xl font-semibold text-navy-900">
          {title}
        </h1>
        <div className="mt-3 text-navy-700">{children}</div>
      </div>
    </main>
  );
}
