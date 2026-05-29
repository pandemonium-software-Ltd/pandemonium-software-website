// /payment/[token] — Phase 3 → Stripe handoff.
//
// Stage 2A Part 1 placeholder: shows the calculated fees and a "payment
// coming soon" notice. Stage 2A Part 2 will swap this for a real Stripe
// Checkout button that redirects to a hosted Checkout session.
//
// This page is the destination of the intake form's "Submit and continue
// to payment" button. The fees are read from Notion (Phase 3 wrote them
// there) — we don't recalculate, so what the prospect sees here exactly
// matches what Ben sees in his notification email.

import type { Metadata } from "next";
import { getProspectByToken } from "@/lib/notion-prospects";
import { isStripeConfigured } from "@/lib/stripe";
import { site } from "@/lib/site";
import CheckoutButton from "@/components/CheckoutButton";
import {
  BASE_SETUP_GBP,
  BASE_MONTHLY_GBP,
  FOUNDING_MEMBER_SETUP_GBP,
  FOUNDING_MEMBER_MONTHLY_GBP,
  MODULE_BOOKING_SETUP_GBP,
  MODULE_BOOKING_MONTHLY_GBP,
  MODULE_ENQUIRY_SETUP_GBP,
  MODULE_ENQUIRY_MONTHLY_GBP,
  MODULE_NEWSLETTER_SETUP_GBP,
  MODULE_NEWSLETTER_MONTHLY_GBP,
  MODULE_OFFERS_SETUP_GBP,
  MODULE_OFFERS_MONTHLY_GBP,
  GBP_ADDON_ONE_OFF_GBP,
  GBP_ADDON_MONTHLY_GBP,
  MODULE_MULTILOCATION_SETUP_GBP,
  calculateFees,
} from "@/lib/fees";
import { modulesToSelection } from "@/lib/billing/module-policy";

/** Per-module display data — costs + friendly labels for the
 *  payment-page line items. Multi-location handled separately
 *  because it's a counter with no monthly. */
const MODULE_LINE: Readonly<
  Record<string, { label: string; setup: number; monthly: number }>
> = {
  "Online Booking": {
    label: "Online Booking",
    setup: MODULE_BOOKING_SETUP_GBP,
    monthly: MODULE_BOOKING_MONTHLY_GBP,
  },
  "Enquiry Form": {
    label: "Enquiry Form",
    setup: MODULE_ENQUIRY_SETUP_GBP,
    monthly: MODULE_ENQUIRY_MONTHLY_GBP,
  },
  Newsletter: {
    label: "Newsletter",
    setup: MODULE_NEWSLETTER_SETUP_GBP,
    monthly: MODULE_NEWSLETTER_MONTHLY_GBP,
  },
  Offers: {
    label: "Offers",
    setup: MODULE_OFFERS_SETUP_GBP,
    monthly: MODULE_OFFERS_MONTHLY_GBP,
  },
  "Google Business Profile Setup/Audit": {
    label: "Google Business Profile + reviews",
    setup: GBP_ADDON_ONE_OFF_GBP,
    monthly: GBP_ADDON_MONTHLY_GBP,
  },
};

export const metadata: Metadata = {
  title: "Payment",
  description:
    "Confirm your fees and pay to start your build.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return <ErrorWrapper title="That link doesn't look right." />;
  }

  const prospect = await getProspectByToken(token).catch(() => null);
  if (!prospect) {
    return <ErrorWrapper title="Link not found." />;
  }

  // Must have completed intake and have fees calculated.
  if (
    !prospect.setupFeeCalculated ||
    !prospect.monthlyFeeCalculated ||
    (prospect.status !== "Phase 3 Complete" &&
      prospect.status !== "Paid" &&
      prospect.status !== "Build Started" &&
      prospect.status !== "Live")
  ) {
    return (
      <ErrorWrapper
        title="Your intake isn't complete yet."
        body="Finish the intake form first — once you submit it, you'll be redirected here automatically."
      />
    );
  }

  const alreadyPaid =
    prospect.status === "Paid" ||
    prospect.status === "Build Started" ||
    prospect.status === "Live";

  // Compute totals from raw inputs (modules + extraLocations +
  // foundingMember) — the SAME inputs Stripe Checkout uses to
  // build its line items. Single source of truth eliminates the
  // drift class of bugs where the cached Notion setupFeeCalculated
  // and the Stripe charge disagree (e.g. if the prospect was
  // edited via /admin without recomputing fees). Cached Notion
  // numbers are kept for back-office reporting but no longer
  // drive the customer-facing total.
  const computedFees = calculateFees(
    modulesToSelection(prospect.moduleSelections, prospect.extraLocations),
    prospect.foundingMember,
  );

  return (
    <>
      <section className="bg-cream-100/60 pb-10 pt-14 md:pb-12 md:pt-20">
        <div className="container-content max-w-3xl text-center">
          <span className="eyebrow">{alreadyPaid ? "Receipt" : "Payment"}</span>
          <h1 className="heading-1">
            {alreadyPaid
              ? "Already paid — you're all set."
              : "Almost there."}
          </h1>
          <p className="prose-body mx-auto mt-6 max-w-2xl">
            {alreadyPaid
              ? "Your build clock is running. You'll get an email from me when the preview is ready for review."
              : `Here's your fixed quote, ${prospect.name.split(/\s+/)[0]}. Setup fee + first month are charged together when you click pay; the monthly subscription bills on the same day each month after that.`}
          </p>
        </div>
      </section>

      <section className="pb-24 pt-8">
        <div className="container-content max-w-2xl">
          <div className="card bg-white">
            <h2 className="font-serif text-xl font-semibold text-navy-900">
              Your order
            </h2>
            {prospect.foundingMember && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-ember-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ember-800">
                Founding member · rate locked 5 years
              </p>
            )}

            <table className="mt-5 w-full text-sm text-navy-900">
              <thead className="text-xs uppercase tracking-wider text-navy-500">
                <tr>
                  <th className="pb-2 text-left font-semibold">Item</th>
                  <th className="pb-2 text-right font-semibold">Setup</th>
                  <th className="pb-2 text-right font-semibold">Monthly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                <tr>
                  <td className="py-2.5">
                    Site + hosting
                    <span className="block text-xs text-navy-500">
                      base subscription
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    £
                    {prospect.foundingMember
                      ? FOUNDING_MEMBER_SETUP_GBP
                      : BASE_SETUP_GBP}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    £
                    {prospect.foundingMember
                      ? FOUNDING_MEMBER_MONTHLY_GBP
                      : BASE_MONTHLY_GBP}
                  </td>
                </tr>
                {prospect.moduleSelections
                  .filter((m) => m !== "Multi-location" && MODULE_LINE[m])
                  .map((m) => {
                    const line = MODULE_LINE[m];
                    return (
                      <tr key={m}>
                        <td className="py-2.5">{line.label}</td>
                        <td className="py-2.5 text-right font-mono">
                          +£{line.setup}
                        </td>
                        <td className="py-2.5 text-right font-mono">
                          +£{line.monthly}
                        </td>
                      </tr>
                    );
                  })}
                {prospect.extraLocations > 0 && (
                  <tr>
                    <td className="py-2.5">
                      Multi-location
                      <span className="block text-xs text-navy-500">
                        {prospect.extraLocations} extra location
                        {prospect.extraLocations === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      +£
                      {prospect.extraLocations *
                        MODULE_MULTILOCATION_SETUP_GBP}
                    </td>
                    <td className="py-2.5 text-right font-mono text-navy-400">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-navy-200 text-base font-semibold">
                <tr>
                  <td className="pt-3">Total</td>
                  <td className="pt-3 text-right font-mono">
                    £{computedFees.setup}
                  </td>
                  <td className="pt-3 text-right font-mono">
                    £{computedFees.monthly}/mo
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-5 rounded-xl bg-navy-950 p-4 text-white">
              <p className="text-xs uppercase tracking-wider text-cream-300/70">
                Today you pay
              </p>
              <p className="mt-1 font-serif text-3xl font-semibold">
                £{computedFees.setup + computedFees.monthly}
              </p>
              <p className="mt-1 text-xs text-cream-300/80">
                Setup fee + first month, charged together. The
                monthly bills on the same day each month after that.
              </p>
            </div>

            <p className="mt-4 text-xs text-navy-500">
              Cancel any time from your dashboard. Setup fee
              non-refundable once development has started — full
              terms in our{" "}
              <a href="/terms#schedule-a" className="link">
                cancellation policy
              </a>
              .
            </p>

            <div className="mt-8">
              {alreadyPaid ? (
                <div
                  role="status"
                  className="rounded-xl border-2 border-green-600 bg-green-50 p-4 text-sm text-green-800"
                >
                  Payment received. No action needed from you right now.
                </div>
              ) : isStripeConfigured() ? (
                <CheckoutButton
                  token={token}
                  totalToday={computedFees.setup + computedFees.monthly}
                />
              ) : (
                <div className="rounded-xl border-2 border-navy-200 bg-cream-50 p-5 text-sm text-navy-700">
                  <p className="font-semibold text-navy-900">
                    Payment in a moment.
                  </p>
                  <p className="mt-2">
                    I&apos;ve also just emailed you a summary with these
                    same fees. Stripe Checkout integration is being
                    finalised — I&apos;ll send the payment link next.
                    Once it&apos;s paid, you&apos;re straight into the
                    Onboarding Hub.
                  </p>
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                    <p className="font-semibold">
                      📬 Email not in your inbox?
                    </p>
                    <p className="mt-1">
                      Check your spam / junk folder —{" "}
                      <code>modu-forge.co.uk</code> is a new sender
                      domain so some inboxes are extra cautious at
                      first.
                    </p>
                  </div>
                  <p className="mt-3">
                    Questions before then?{" "}
                    <a href={`mailto:${site.contactEmail}`} className="link">
                      {site.contactEmail}
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>

          {!alreadyPaid && (
            <p className="mt-6 text-center text-sm text-navy-500">
              Your intake answers are saved. Edit any time before payment by
              returning to{" "}
              <a href={`/intake/${token}`} className="link">
                your intake link
              </a>
              .
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function ErrorWrapper({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <section className="section bg-white">
      <div className="container-content max-w-2xl">
        <div className="card bg-white">
          <span className="eyebrow text-ember-700">Hmm.</span>
          <h1 className="heading-2 mt-3">{title}</h1>
          <p className="prose-body mt-5">
            {body ??
              "Double-check the URL from our email, or reply and we'll resend it."}
          </p>
          <p className="prose-body mt-4">
            Email us at{" "}
            <a href={`mailto:${site.contactEmail}`} className="link">
              {site.contactEmail}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
