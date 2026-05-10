// /account/[token]/approve-change/[crId] — landing page customers
// hit when they click "Approve & publish" in a preview-ready email.
//
// Flow:
//   1. Validates token shape + crId presence
//   2. Looks up the prospect + change request
//   3. Validates the `?t=<approval-token>` query param matches the
//      stored customerApprovalToken (so guessed URLs can't approve
//      someone else's change)
//   4. If already-approved or already-rejected, shows a friendly
//      idempotent message
//   5. Otherwise: stamps customerApprovedAt + dispatches the
//      customer-site-promote workflow + renders a "promoting…" page
//      that auto-refreshes back to the dashboard
//
// All work is server-side on the page render — no client JS needed
// for the happy path. The customer's link click is the action.
//
// Security note: the per-request approval token is the auth here.
// It's 32 hex chars (~128 bits), generated when Cowork applies the
// patch, only delivered via the customer's email. Treats this as a
// magic link — same security model as the receipt-email links.

import { redirect } from "next/navigation";
import { getProspectByToken, patchChangeRequest } from "@/lib/notion-prospects";
import { dispatchRepositoryEvent, GithubApiError } from "@/lib/github";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

export default async function ApproveChangePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; crId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { token, crId } = await params;
  const { t: approvalToken = "" } = await searchParams;

  if (!TOKEN_RE.test(token)) {
    return <Wrapper title="Link not valid" body="Check the URL from your email." />;
  }
  if (!crId) {
    return <Wrapper title="Link missing details" body="No change request id in URL." />;
  }
  if (!APPROVAL_TOKEN_RE.test(approvalToken)) {
    return (
      <Wrapper
        title="Approval token missing"
        body="Use the link from your most recent preview-ready email."
      />
    );
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return <Wrapper title="Account not found" body="Check the link." />;
  }

  const cr = prospect.changeRequests.find((r) => r.id === crId);
  if (!cr) {
    return (
      <Wrapper
        title="Change request not found"
        body="It may have been retracted. Check your dashboard."
      />
    );
  }

  // Token check (constant-time-ish — strings are short enough that
  // length mismatch is the realistic timing attack vector, and we
  // bail on length first).
  if (
    !cr.customerApprovalToken ||
    !timingSafeEqual(cr.customerApprovalToken, approvalToken)
  ) {
    return (
      <Wrapper
        title="Approval link expired"
        body="Your approval link doesn't match. The change may have been re-built since you got the email — please use the latest preview-ready email or reply to me directly."
      />
    );
  }

  // Idempotency: if already approved, show a friendly already-done
  // page rather than re-dispatching the promote workflow.
  if (cr.customerApprovedAt) {
    return (
      <Wrapper
        title="Already approved ✓"
        body="This change was approved. If your site doesn't reflect it yet, give it a minute and refresh."
        ctaHref={`/account/${token}`}
        ctaLabel="Open dashboard"
      />
    );
  }
  if (cr.customerRejectedAt) {
    return (
      <Wrapper
        title="This change was rejected"
        body="You already declined this version. Submit a new change request from your dashboard if you'd like to try again."
        ctaHref={`/account/${token}`}
        ctaLabel="Open dashboard"
      />
    );
  }
  if (cr.status === "resolved" || cr.status === "rejected") {
    return (
      <Wrapper
        title={`Already ${cr.status}`}
        body="This request has already been closed. Check your dashboard for status."
        ctaHref={`/account/${token}`}
        ctaLabel="Open dashboard"
      />
    );
  }

  if (!cr.previewVersionId) {
    return (
      <Wrapper
        title="No preview to promote"
        body="The preview build hasn't completed yet. Please try the link from a more recent email."
      />
    );
  }
  if (!prospect.workerName || !prospect.cloudflareAccountId) {
    return (
      <Wrapper
        title="Site setup incomplete"
        body="Your site isn't fully set up yet. Reply to me directly."
      />
    );
  }

  // Stamp + dispatch. Order: stamp BEFORE dispatch so a clicked-link
  // crash mid-dispatch leaves a clear "approved but not promoted"
  // state we can recover from.
  await patchChangeRequest(prospect.pageId, crId, {
    customerApprovedAt: new Date().toISOString(),
  });

  const env = getServerEnv();
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return (
      <Wrapper
        title="Promotion paused"
        body="GitHub Actions credentials aren't configured. Your approval is recorded; please reply to me and I'll promote manually."
      />
    );
  }
  try {
    await dispatchRepositoryEvent({
      token: env.GITHUB_TOKEN,
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      eventType: "customer-site-promote",
      clientPayload: {
        token,
        versionId: cr.previewVersionId,
        workerName: prospect.workerName,
        accountId: prospect.cloudflareAccountId,
        changeRequestId: crId,
      },
    });
  } catch (e) {
    const msg =
      e instanceof GithubApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    return (
      <Wrapper
        title="Couldn't promote yet"
        body={`Approval is recorded but the promote dispatch failed: ${msg}. I'll see this and follow up — you don't need to do anything.`}
      />
    );
  }

  // Redirect to a "promoting" page that polls for the final state.
  // Keeps the URL clean (no token in the address bar after click).
  redirect(`/account/${token}?just-approved=${crId}`);
}

function Wrapper({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <main className="container-content py-20">
      <div className="mx-auto max-w-xl rounded-3xl border border-navy-100 bg-white p-8 shadow-card">
        <h1 className="font-serif text-2xl font-semibold text-navy-900">
          {title}
        </h1>
        <p className="mt-3 prose-body text-navy-700">{body}</p>
        {ctaHref && ctaLabel && (
          <a
            href={ctaHref}
            className="mt-6 inline-block rounded-full bg-brand-primary-500 px-5 py-2.5 font-semibold text-brand-primary-text hover:bg-brand-primary-600"
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </main>
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
