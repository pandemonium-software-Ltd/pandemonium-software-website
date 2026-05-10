// /account/[token]/reject-change/[crId] — customer hits this when
// they click "Reject" in a preview-ready email.
//
// Reject is gentler than approve — we DON'T immediately reject the
// change request (that's terminal + closes it). Instead we:
//   1. Stamp customerRejectedAt as an audit marker
//   2. Revert Cowork's auto-applied patch in Notion (using the
//      stored previousValue) so the data is back to pre-Cowork state
//   3. Set status back to pending (NOT rejected) so Ben sees it in
//      the admin list as a still-open request and can reply with a
//      different approach
//   4. Leave the preview version uploaded — Cloudflare cleans up
//      old versions automatically; no harm in it sitting there
//
// The rationale: the customer rejecting Cowork's auto-apply doesn't
// mean they don't want the change at all — it means they didn't
// want THAT version of it. Putting it back to pending invites Ben
// to try another approach OR to ask the customer for clarification.

import { redirect } from "next/navigation";
import {
  getProspectByToken,
  patchChangeRequest,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_TOKEN_RE = /^[0-9a-f]{16,64}$/i;

export default async function RejectChangePage({
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
  if (
    !cr.customerApprovalToken ||
    !timingSafeEqual(cr.customerApprovalToken, approvalToken)
  ) {
    return (
      <Wrapper
        title="Reject link expired"
        body="Your reject link doesn't match. The change may have been re-built since."
      />
    );
  }
  if (cr.customerRejectedAt) {
    return (
      <Wrapper
        title="Already rejected"
        body="You've already rejected this version. Submit a new change request to try again."
        ctaHref={`/account/${token}`}
        ctaLabel="Open dashboard"
      />
    );
  }
  if (cr.customerApprovedAt) {
    return (
      <Wrapper
        title="Already approved"
        body="You already approved this change — it's live. Submit a new change request if you want to revert."
        ctaHref={`/account/${token}`}
        ctaLabel="Open dashboard"
      />
    );
  }

  // Revert Cowork's patch if there was one. Defensive: only revert
  // a target we know how to roll back; otherwise just stamp rejected
  // and let Ben handle it.
  if (cr.coworkPatch && cr.coworkPatch.previousValue !== undefined) {
    await revertPatch(prospect.pageId, prospect.onboardingData, cr.coworkPatch);
  }

  await patchChangeRequest(prospect.pageId, crId, {
    customerRejectedAt: new Date().toISOString(),
    // status stays pending so Ben sees it in his queue.
  });

  redirect(`/account/${token}?just-rejected=${crId}`);
}

/**
 * Roll back a Cowork-applied patch. Reads onboarding data, restores
 * the previous value at `target`, writes back. Best effort — any
 * shape we don't recognise is left alone (Ben will see a "rejected
 * but not reverted" state in the admin and can fix manually).
 */
async function revertPatch(
  pageId: string,
  onboardingDataRaw: unknown,
  patch: NonNullable<
    import("@/lib/notion-prospects").ChangeRequest["coworkPatch"]
  >,
): Promise<void> {
  const ob = (onboardingDataRaw ?? {}) as Record<string, unknown>;
  // Targets follow the format described in the C5.7 design doc:
  //   "copy.tagline", "copy.aboutBlurb",
  //   "business.phoneDisplay", "business.publicEmail",
  //   "business.address", "business.serviceArea"
  // For v1 we only revert these flat targets. Service / faq targets
  // come in v2 (need locator-aware revert).
  const flatTargets = new Set([
    "copy.tagline",
    "copy.aboutBlurb",
    "business.contactName",
    "business.phoneDisplay",
    "business.publicEmail",
    "business.address",
    "business.serviceArea",
  ]);
  if (!flatTargets.has(patch.target)) return;

  const [section, field] = patch.target.split(".");
  if (!section || !field) return;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  if (section === "copy") {
    // copy.* fields live at content.<field> in our schema
    content[field] = patch.previousValue;
  } else if (section === "business") {
    const business = (content.business ?? {}) as Record<string, unknown>;
    business[field] = patch.previousValue;
    content.business = business;
  }
  ob.content = content;

  // Write back the whole onboarding-data blob via the standard
  // updater. Doesn't change any other slice.
  await updateProspectOnboarding(pageId, {
    data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
  });
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
