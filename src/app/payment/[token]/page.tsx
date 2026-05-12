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
              Your quote
            </h2>

            <dl className="mt-5 grid gap-3 text-navy-900">
              <Row label="Setup fee (one-off)" value={`£${prospect.setupFeeCalculated}`} />
              <Row label="Monthly subscription" value={`£${prospect.monthlyFeeCalculated}/month`} />
              {prospect.foundingMember && (
                <Row label="Status" value="Founding Member rate locked for life" tone="ember" />
              )}
            </dl>

            {prospect.moduleSelections.length > 0 && (
              <div className="mt-6 rounded-xl bg-cream-100 p-4">
                <p className="text-sm font-semibold text-navy-900">
                  Modules included
                </p>
                <ul className="mt-2 space-y-1 text-sm text-navy-700">
                  <li>• Base website (always included)</li>
                  {prospect.moduleSelections.map((m) => (
                    <li key={m}>• {m}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8 border-t border-navy-100 pt-6">
              <p className="text-sm text-navy-700">
                <strong className="text-navy-900">Today, you&apos;ll be charged:</strong>{" "}
                £{(prospect.setupFeeCalculated ?? 0) + (prospect.monthlyFeeCalculated ?? 0)}
                {" — "}
                that&apos;s the setup fee + your first month.
              </p>
              <p className="mt-2 text-xs text-navy-500">
                30-day cancellation notice. 48-hour refund window on the
                setup fee. You own everything.
              </p>
            </div>

            <div className="mt-8">
              {alreadyPaid ? (
                <div
                  role="status"
                  className="rounded-xl border-2 border-green-600 bg-green-50 p-4 text-sm text-green-800"
                >
                  Payment received. No action needed from you right now.
                </div>
              ) : isStripeConfigured() ? (
                // TODO(Stage 2A Part 2): wire this up
                //   1. POST /api/stripe/checkout-session  { token }
                //   2. server creates Stripe Checkout session with
                //      setup + recurring price_data
                //   3. redirect to session.url
                //   4. on success, /api/stripe/webhook flips Status to "Paid"
                //   5. /payment/[token] re-renders the alreadyPaid branch
                <button
                  type="button"
                  disabled
                  className="btn-primary w-full opacity-60"
                  title="Stripe integration arrives in Stage 2A Part 2"
                >
                  Pay £{(prospect.setupFeeCalculated ?? 0) + (prospect.monthlyFeeCalculated ?? 0)} (coming soon)
                </button>
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

          <p className="mt-6 text-center text-sm text-navy-500">
            Your intake answers are saved. Edit any time before payment by
            returning to{" "}
            <a href={`/intake/${token}`} className="link">
              your intake link
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ember";
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-navy-100 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-sm text-navy-700">{label}</dt>
      <dd
        className={[
          "font-serif text-lg font-semibold",
          tone === "ember" ? "text-ember-700" : "text-navy-900",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
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
