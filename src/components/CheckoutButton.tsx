// Stripe Checkout launcher used on /payment/[token].
//
// Client component because we need state for the express-request
// checkbox + the loading + error states, then a redirect after
// the server returns the Checkout URL. The actual Stripe API call
// happens server-side in /api/payment/checkout.
//
// Express-request checkbox: customer ticks to waive their 14-day
// CCRs cancellation right on the setup fee so work can begin
// immediately. Default UNticked — Stripe Checkout is still
// available without the tick, but in that case work pauses until
// the 14-day window closes. We surface this in the helper copy.

"use client";

import { useState, useTransition } from "react";

type Props = {
  token: string;
  totalToday: number;
};

export default function CheckoutButton({ token, totalToday }: Props) {
  const [expressRequest, setExpressRequest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/payment/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, expressRequest }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(
            body.error ?? "Couldn't start checkout. Try again in a minute.",
          );
          return;
        }
        const body = (await res.json()) as { url?: string };
        if (!body.url) {
          setError("Stripe didn't return a checkout URL.");
          return;
        }
        // Redirect the browser to the hosted Checkout page.
        window.location.href = body.url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Network error: ${msg}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-xl bg-cream-50 p-4 text-sm leading-relaxed text-navy-800">
        <input
          type="checkbox"
          checked={expressRequest}
          onChange={(e) => setExpressRequest(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-none accent-navy-900"
        />
        <span>
          <strong className="text-navy-900">
            I expressly request that work begins immediately
          </strong>{" "}
          and acknowledge that the setup fee becomes non-refundable
          as soon as development work has started. (Leave unticked
          if you&apos;d rather I hold off until day 15 of the
          14-day cancellation period.)
        </span>
      </label>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="btn-primary w-full disabled:opacity-60"
      >
        {pending ? "Starting checkout…" : `Pay £${totalToday} to start your build`}
      </button>
      {error && (
        <p className="text-sm text-ember-700" role="alert">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-navy-500">
        You&apos;ll be redirected to Stripe&apos;s secure checkout
        page to enter your card details.
      </p>
    </div>
  );
}
