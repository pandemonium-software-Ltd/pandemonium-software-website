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
  readCoworkPatches,
  updateProspectOnboarding,
} from "@/lib/notion-prospects";
import { notifyAdmin, adminFooter } from "@/lib/admin-notify";
import { getServerEnv } from "@/lib/env";

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

  // Revert ALL Cowork patches if there were any. Multi-patch
  // requests had each previousValue stamped at apply time so we can
  // unwind in REVERSE order (last applied = first reverted) to
  // restore exactly the pre-Cowork state. Defensive: targets we
  // don't know how to roll back are skipped (Ben sees a "rejected
  // but not fully reverted" state in admin and can fix manually).
  const patches = readCoworkPatches(cr);
  const revertedTargets: string[] = [];
  if (patches.length > 0) {
    for (const p of [...patches].reverse()) {
      if (p.previousValue === undefined) continue;
      const ok = await revertPatch(
        prospect.pageId,
        prospect.onboardingData,
        p,
      );
      if (ok) revertedTargets.push(p.target);
    }
  }

  await patchChangeRequest(prospect.pageId, crId, {
    customerRejectedAt: new Date().toISOString(),
    // status stays pending so Ben sees it in his queue.
  });

  // Tell Ben — customer rejection puts the request back in his queue
  // so he can either retry with a different approach or message the
  // customer for clarification. The rebuild reverted Cowork's patches
  // (if any) so Notion is back at pre-Cowork state.
  const revertSummary =
    patches.length === 0
      ? `(No Cowork patch was applied — nothing to revert.)\n\n`
      : revertedTargets.length === patches.length
        ? `All ${patches.length} Cowork patch${patches.length === 1 ? "" : "es"} reverted in Notion: ${revertedTargets.join(", ")}.\n\n`
        : `${revertedTargets.length}/${patches.length} Cowork patches reverted: ${revertedTargets.join(", ")}. ${patches.length - revertedTargets.length} couldn't be auto-reverted (no previousValue or unsupported target) — check Notion manually.\n\n`;
  await notifyAdmin(getServerEnv(), {
    category: "preview",
    subject: `Customer REJECTED preview — ${prospect.name}`,
    body:
      `${prospect.name} clicked Reject on a change-request preview. The CR is back in your queue (status=pending) for you to retry or follow up.\n\n` +
      `CR: ${crId.slice(0, 8)}…\n` +
      `Original ask:\n  "${cr.message}"\n\n` +
      revertSummary +
      `→ Open the dashboard to reply or escalate.\n\n` +
      adminFooter({
        prospectName: prospect.name,
        prospectToken: token,
        anchor: `cr-${crId.slice(0, 8)}`,
      }),
  }).catch(() => {});

  redirect(`/account/${token}?just-rejected=${crId}`);
}

/**
 * Roll back a Cowork-applied patch. Reads onboarding data, restores
 * the previous value at `target`, writes back. Best effort — any
 * shape we don't recognise is left alone (Ben will see a "rejected
 * but not fully reverted" state in the admin and can fix manually).
 *
 * Returns `true` when the revert was applied + persisted, `false`
 * when the target is unsupported or the field wasn't recognised.
 *
 * Multi-patch reverts MUST call this in REVERSE order so each
 * previousValue restores what was there before *that* patch (not
 * before the whole batch). The applier records previousValues at
 * apply time so this works even when patches stack on the same
 * customer between cron ticks.
 */
async function revertPatch(
  pageId: string,
  onboardingDataRaw: unknown,
  patch: NonNullable<
    import("@/lib/notion-prospects").ChangeRequest["coworkPatches"]
  >[number],
): Promise<boolean> {
  const ob = (onboardingDataRaw ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;

  // ----- Array-level operations (.add / .remove / aboutBullets full
  // replace) — previousValue is the entire pre-op array, so we
  // just write it back at the right path. Works for both:
  //   - content.services.add / .remove
  //   - content.faq.add / .remove
  //   - content.testimonials.add / .remove
  //   - content.aboutBullets / .add / .remove
  if (patch.target === "content.aboutBullets" ||
      patch.target === "content.aboutBullets.add" ||
      patch.target === "content.aboutBullets.remove") {
    content.aboutBullets = patch.previousValue;
    ob.content = content;
    await updateProspectOnboarding(pageId, {
      data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
    return true;
  }
  if (
    patch.target === "content.services.add" ||
    patch.target === "content.services.remove"
  ) {
    content.services = patch.previousValue;
    ob.content = content;
    await updateProspectOnboarding(pageId, {
      data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
    return true;
  }
  if (
    patch.target === "content.faq.add" ||
    patch.target === "content.faq.remove"
  ) {
    content.faq = patch.previousValue;
    ob.content = content;
    await updateProspectOnboarding(pageId, {
      data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
    return true;
  }
  if (
    patch.target === "content.testimonials.add" ||
    patch.target === "content.testimonials.remove"
  ) {
    content.testimonials = patch.previousValue;
    ob.content = content;
    await updateProspectOnboarding(pageId, {
      data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
    return true;
  }

  // Targets follow the format described in the C5.7 design doc:
  //   "copy.tagline", "copy.aboutBlurb",
  //   "business.phoneDisplay", "business.publicEmail",
  //   "business.address", "business.serviceArea", branding.*
  // Locator-aware per-field updates (services.<field>, faq.<field>,
  // testimonials.<field>) still need locator-aware revert — for now
  // they fall through to the unsupported branch and Ben sees a
  // "rejected but not fully reverted" hint.
  const flatTargets = new Set([
    "copy.tagline",
    "copy.aboutBlurb",
    "business.contactName",
    "business.phoneDisplay",
    "business.phoneTel",
    "business.publicEmail",
    "business.address",
    "business.serviceArea",
    "business.openingHours",
    "content.trust.yearsExperience",
    "content.trust.associations",
    "content.trust.awards",
    "branding.brandColorPrimary",
    "branding.brandColorSecondary",
  ]);
  if (!flatTargets.has(patch.target)) return false;

  // Handle compound paths like content.trust.* (3 segments).
  if (patch.target.startsWith("content.trust.")) {
    const field = patch.target.slice("content.trust.".length);
    const trust = (content.trust ?? {}) as Record<string, unknown>;
    trust[field] = patch.previousValue;
    content.trust = trust;
    ob.content = content;
    await updateProspectOnboarding(pageId, {
      data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
    return true;
  }
  // Branding lives in its own slice on ob, not under content.
  if (patch.target.startsWith("branding.")) {
    const field = patch.target.slice("branding.".length);
    const branding = (ob.branding ?? {}) as Record<string, unknown>;
    branding[field] = patch.previousValue;
    ob.branding = branding;
    await updateProspectOnboarding(pageId, {
      data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
    });
    return true;
  }

  const [section, field] = patch.target.split(".");
  if (!section || !field) return false;
  if (section === "copy") {
    // copy.* fields live at content.<field> in our schema
    content[field] = patch.previousValue;
  } else if (section === "business") {
    const business = (content.business ?? {}) as Record<string, unknown>;
    business[field] = patch.previousValue;
    content.business = business;
  } else {
    return false;
  }
  ob.content = content;

  // Write back the whole onboarding-data blob via the standard
  // updater. Doesn't change any other slice.
  await updateProspectOnboarding(pageId, {
    data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
  });
  return true;
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
