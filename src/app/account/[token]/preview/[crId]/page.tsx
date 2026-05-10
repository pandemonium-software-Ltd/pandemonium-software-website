// /account/[token]/preview/[crId] — sandboxed preview viewer.
//
// Sits behind the auth middleware (customer must be logged in to
// see this page). Renders the customer-site preview Worker URL
// inside an iframe, with the per-version PREVIEW_ACCESS_TOKEN
// passed as ?pa=<token> so the customer-site middleware accepts
// the embed.
//
// Why iframe + auth-gated parent: the workers.dev preview URL is
// effectively shareable IF you can guess it. The parent page
// being auth-gated means a leaked URL just bounces unauthorised
// visitors to login. The iframe + Content-Security-Policy on
// the customer-site Worker (frame-ancestors restriction) means
// even if the PREVIEW_ACCESS_TOKEN leaks, only modu-forge.co.uk
// can frame the content.
//
// Approve / reject CTAs live alongside the iframe so the customer
// reviews the change + decides in one place.

import Link from "next/link";
import { redirect } from "next/navigation";
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

  // Approval-token redirect for the approve / reject buttons —
  // those still verify the per-request approvalToken at the
  // existing /approve-change endpoint.
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

  return (
    <main className="min-h-screen bg-cream-50">
      <header className="border-b border-navy-100 bg-white">
        <div className="container-content flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
              Preview
            </p>
            <h1 className="font-serif text-lg font-semibold text-navy-900">
              Your change is ready to review
            </h1>
            <p className="mt-1 text-xs text-navy-600">
              Live site is unchanged. Approve to publish, or reject
              to ask for a different approach.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/account/${token}/approve-change/${cr.id}?t=${cr.customerApprovalToken}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Approve & publish
            </a>
            <a
              href={`/account/${token}/reject-change/${cr.id}?t=${cr.customerApprovalToken}`}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:border-red-400"
            >
              Reject
            </a>
            <Link
              href={`/account/${token}`}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-400"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
        <div className="container-content border-t border-navy-100 bg-cream-50 py-3">
          <p className="text-xs italic text-navy-600">
            What you asked for: <strong>{cr.message}</strong>
          </p>
        </div>
      </header>

      {/* Iframe — fills the rest of the viewport. The
          customer-site Worker enforces frame-ancestors so this is
          the ONLY place the preview can render embedded. */}
      <iframe
        src={iframeSrc}
        title="Site preview"
        // sandbox is intentionally OMITTED — the preview is the
        // customer's own site, they need full interactivity (links,
        // forms, scripts) to review properly. The trust boundary
        // is the auth-gated parent + frame-ancestors on the child.
        className="block h-[calc(100vh-9rem)] w-full border-0 bg-white"
      />
    </main>
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
