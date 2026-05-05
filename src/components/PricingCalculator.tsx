"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "@/lib/site";

type Module = {
  id: string;
  name: string;
  setup: number;
  monthly: number;
  blurb: string;
  mandatory?: boolean;
  includes?: string[];
};

const MODULES: Module[] = [
  {
    id: "base",
    name: "Base website",
    setup: 129,
    monthly: 19,
    blurb:
      "Everything you need to look professional online. Mobile-optimised, hosted properly, and looked after for you.",
    mandatory: true,
    includes: [
      "Professional mobile-first website, built to look great on phones",
      "Hosted on your own free Cloudflare Pages account — no hidden bills",
      "Security, maintenance and dependency updates done for you",
      "Monthly performance report, in plain English",
      "30 minutes of content changes per month, included",
      "Guided self-setup through the Onboarding Hub — short videos at every step",
      "UK-based support from a real person",
    ],
  },
  {
    id: "booking",
    name: "Online Booking",
    setup: 39,
    monthly: 4,
    blurb:
      "Let customers book jobs directly from your website. Syncs with your calendar, sends automatic confirmations and reminders, cuts phone tag.",
  },
  {
    id: "enquiry",
    name: "Enquiry System",
    setup: 39,
    monthly: 4,
    blurb:
      "A branded contact form on your site with spam protection. Enquiries land straight in your inbox — never miss a lead.",
  },
  {
    id: "newsletter",
    name: "Newsletter & Offers",
    setup: 39,
    monthly: 6,
    blurb:
      "Collect customer emails and send monthly offers or seasonal reminders. I draft each campaign for you to review — no writer's block, just review and send.",
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

  const firstYear = totals.setup + totals.monthly * 12;
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
                        {m.includes && (
                          <ul className="mt-4 space-y-1.5 text-[0.9rem] text-navy-600">
                            {m.includes.map((line) => (
                              <li key={line} className="flex items-start gap-2">
                                <svg
                                  className="mt-1 h-3.5 w-3.5 flex-none text-ember-500"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M5 12 L10 17 L19 7"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
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
                  One-off · paid today
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
                  Billed monthly · starts today
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
                Total first-year cost
              </p>
              <p className="mt-2 font-serif text-3xl font-semibold text-white md:text-[2.2rem]">
                {formatGBP(firstYear)}
              </p>
              <p className="mt-2 text-[13px] leading-snug text-ember-50">
                Setup fee plus twelve monthly payments. No hidden extras.
              </p>
            </div>
          </div>

          <p className="mt-6 text-[13px] leading-snug text-cream-300/75">
            Your setup fee and first monthly payment come out together on day
            one. After that, you&apos;re on a simple monthly plan with 30
            days&apos; notice to cancel.
          </p>

          <Link
            href={site.enquiryPath}
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
