"use client";

import Link from "next/link";
import { useState } from "react";

type Module = {
  id: string;
  name: string;
  setup: number;
  monthly: number;
  blurb: string;
  who: string;
  mandatory?: boolean;
};

const MODULES: Module[] = [
  {
    id: "base",
    name: "Base website",
    setup: 150,
    monthly: 25,
    blurb:
      "A clean, mobile-friendly website with your services, your photos, your contact details and a clear way to get in touch. Hosted properly, kept updated, and included in every package.",
    who: "Everyone. This is your proper online home.",
    mandatory: true,
  },
  {
    id: "booking",
    name: "Online Booking",
    setup: 60,
    monthly: 10,
    blurb:
      "Let customers book a time slot on your calendar without phoning you. Sync it with your Google or Apple calendar so you never get double-booked.",
    who: "Great for plumbers, electricians, locksmiths and anyone doing short appointments.",
  },
  {
    id: "enquiry",
    name: "Enquiry Form",
    setup: 40,
    monthly: 2.5,
    blurb:
      "A simple form customers can fill in to tell you about a job — photos and all. Messages come straight to your email, clean and spam-filtered.",
    who: "Great for builders, gardeners and anyone who prices bigger jobs on request.",
  },
  {
    id: "newsletter",
    name: "Newsletter & Offers",
    setup: 60,
    monthly: 12,
    blurb:
      "Collect emails from past customers and send them the occasional update or seasonal offer. We set it up and show you how to send a message in two minutes.",
    who: "Great for trades with repeat customers — boilers, gardens, chimney sweeping, servicing.",
  },
];

function formatGBP(n: number) {
  const hasPence = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: hasPence ? 2 : 0,
    maximumFractionDigits: hasPence ? 2 : 0,
  });
}

export default function PricingCalculator() {
  const [selected, setSelected] = useState<Record<string, boolean>>({
    base: true,
    booking: false,
    enquiry: false,
    newsletter: false,
  });

  const toggle = (id: string) => {
    const mod = MODULES.find((m) => m.id === id);
    if (mod?.mandatory) return;
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totals = MODULES.reduce(
    (acc, m) => {
      if (selected[m.id]) {
        acc.setup += m.setup;
        acc.monthly += m.monthly;
      }
      return acc;
    },
    { setup: 0, monthly: 0 },
  );

  const anyExtras = MODULES.some((m) => !m.mandatory && selected[m.id]);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      {/* Modules */}
      <div>
        <h2 className="font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
          Pick what you need
        </h2>
        <p className="mt-3 text-lg text-navy-700">
          Every package starts with the base website. Add any extras that make
          sense for your trade — you can always add or remove them later.
        </p>

        <ul className="mt-8 space-y-4">
          {MODULES.map((m) => {
            const isOn = !!selected[m.id];
            const isMandatory = !!m.mandatory;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  disabled={isMandatory}
                  aria-pressed={isOn}
                  className={[
                    "group relative flex w-full cursor-pointer flex-col gap-3 rounded-2xl p-6 text-left transition-all",
                    "ring-1 ring-inset",
                    isOn
                      ? "bg-white shadow-lift ring-navy-900"
                      : "bg-white shadow-card ring-navy-100 hover:ring-navy-300",
                    isMandatory ? "cursor-default" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <Checkbox checked={isOn} mandatory={isMandatory} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-serif text-xl font-semibold text-navy-900">
                            {m.name}
                          </h3>
                          {isMandatory && (
                            <span className="rounded-full bg-ember-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ember-700">
                              Included
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-[0.95rem] leading-relaxed text-navy-700">
                          {m.blurb}
                        </p>
                        <p className="mt-3 text-sm italic text-navy-500">
                          {m.who}
                        </p>
                      </div>
                    </div>

                    <div className="flex-none text-right">
                      <p className="font-serif text-lg font-semibold text-navy-900">
                        {isMandatory ? formatGBP(m.setup) : `+${formatGBP(m.setup)}`}
                      </p>
                      <p className="text-xs uppercase tracking-wider text-navy-500">
                        setup
                      </p>
                      <p className="mt-2 font-serif text-lg font-semibold text-navy-900">
                        {isMandatory
                          ? `${formatGBP(m.monthly)}/mo`
                          : `+${formatGBP(m.monthly)}/mo`}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Sticky total */}
      <div className="lg:sticky lg:top-28">
        <div className="rounded-3xl bg-navy-950 p-8 text-white shadow-lift">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-300">
            Your total
          </p>
          <div className="mt-6 grid gap-5">
            <div className="flex items-baseline justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm text-cream-200/70">Setup fee</p>
                <p className="text-[11px] uppercase tracking-wider text-cream-300/60">
                  One-off
                </p>
              </div>
              <p className="font-serif text-3xl font-semibold text-white md:text-4xl">
                {formatGBP(totals.setup)}
              </p>
            </div>

            <div className="flex items-baseline justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm text-cream-200/70">Monthly fee</p>
                <p className="text-[11px] uppercase tracking-wider text-cream-300/60">
                  Ongoing
                </p>
              </div>
              <p className="font-serif text-3xl font-semibold text-white md:text-4xl">
                {formatGBP(totals.monthly)}
                <span className="text-base font-normal text-cream-300/70">
                  {" "}
                  / mo
                </span>
              </p>
            </div>

            <div className="rounded-2xl bg-ember-500 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ember-100">
                What you&apos;ll pay today
              </p>
              <p className="mt-2 font-serif text-3xl font-semibold text-white md:text-[2.2rem]">
                {formatGBP(totals.setup + totals.monthly)}
              </p>
              <p className="mt-2 text-[13px] leading-snug text-ember-50">
                That&apos;s the setup fee plus your first monthly payment,
                taken on the same day we get started.
              </p>
            </div>
          </div>

          <p className="mt-6 text-[13px] leading-snug text-cream-300/75">
            Your monthly subscription begins on day one, so your first
            payment and setup fee come out together. After that, you&apos;re
            on a simple monthly plan with 30 days&apos; notice to cancel.
          </p>

          <Link
            href="/intake"
            className="btn-primary mt-6 w-full !bg-white !text-navy-900 hover:!bg-ember-400 hover:!text-white"
          >
            Get started
          </Link>
          {!anyExtras && (
            <p className="mt-4 text-center text-[13px] text-cream-300/70">
              Tick any extras above to see how they change the total.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Checkbox({
  checked,
  mandatory,
}: {
  checked: boolean;
  mandatory: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-md border-2 transition-colors",
        checked
          ? "border-navy-900 bg-navy-900"
          : "border-navy-300 bg-white group-hover:border-navy-500",
        mandatory ? "opacity-90" : "",
      ].join(" ")}
    >
      {checked && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f97316"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12 L10 17 L19 7" />
        </svg>
      )}
    </span>
  );
}
