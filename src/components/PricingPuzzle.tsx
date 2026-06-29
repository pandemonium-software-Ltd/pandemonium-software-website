"use client";

// Pricing puzzle (Phase M, v2). Web layout:
//   • A THIN tier bar — Founder / Standard / Premium — each showing
//     monthly + upfront price. Selecting a tier gives the live site
//     preview a distinct premium glow.
//   • LEFT: a single-column list of add-ons. Each row has an icon, name,
//     price and an (i) info button that pops out the detail.
//   • RIGHT: a large live "your site" preview. Toggling an add-on flies
//     the matching block (icon + name) in from the left — so you can see
//     exactly where each one lands — with the running total beneath.
//
// Totals come from calculateFees() (fees.ts = single source of truth).
// Mobile keeps the same list + preview stacked, with a sticky total bar.
// Reduced-motion users still get every state; only the easing relaxes.

import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/lib/site";
import {
  CalendarIcon,
  MailIcon,
  PlaneIcon,
  TagIcon,
  StarsIcon,
  PinIcon,
} from "@/components/module-icons";
import {
  calculateFees,
  BASE_SETUP_GBP,
  BASE_MONTHLY_GBP,
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
  FOUNDING_MEMBER_SETUP_GBP,
  FOUNDING_MEMBER_MONTHLY_GBP,
} from "@/lib/fees";

const EMBER = "#f97316";
const NAVY = "#0f1d30";

// Spring snap for blocks flying in from the list.
const FLY =
  "[transition:max-height_0.5s_cubic-bezier(0.34,1.45,0.5,1),opacity_0.3s_ease,transform_0.5s_cubic-bezier(0.34,1.45,0.5,1),margin-top_0.45s_ease]";

type ModuleId = "booking" | "enquiry" | "newsletter" | "offers" | "gbp";
type Tier = "founding" | "standard" | "premium";

type AddOn = {
  id: ModuleId;
  name: string;
  setup: number;
  monthly: number;
  blurb: string;
  icon: React.ReactNode;
  content: boolean; // bundled into the Founder tier
};

const ADDONS: AddOn[] = [
  {
    id: "booking",
    name: "Online Booking",
    setup: MODULE_BOOKING_SETUP_GBP,
    monthly: MODULE_BOOKING_MONTHLY_GBP,
    icon: <CalendarIcon />,
    content: true,
    blurb:
      "Let customers book jobs directly from your site. Syncs with your calendar, sends automatic confirmations and reminders, cuts the phone tag.",
  },
  {
    id: "enquiry",
    name: "Enquiry Form",
    setup: MODULE_ENQUIRY_SETUP_GBP,
    monthly: MODULE_ENQUIRY_MONTHLY_GBP,
    icon: <MailIcon />,
    content: true,
    blurb:
      "A branded contact form with spam protection. Enquiries land straight in your inbox without exposing your email address — never miss a lead.",
  },
  {
    id: "newsletter",
    name: "Newsletter",
    setup: MODULE_NEWSLETTER_SETUP_GBP,
    monthly: MODULE_NEWSLETTER_MONTHLY_GBP,
    icon: <PlaneIcon />,
    content: true,
    blurb:
      "Collect customer emails and send a monthly newsletter from name@yourdomain. Each campaign is auto-drafted in your voice (reviewed by me first) — just check and send.",
  },
  {
    id: "offers",
    name: "Offers",
    setup: MODULE_OFFERS_SETUP_GBP,
    monthly: MODULE_OFFERS_MONTHLY_GBP,
    icon: <TagIcon />,
    content: true,
    blurb:
      "A promotional strip on your homepage — headline, dates and a call to action — you control from your dashboard. Cowork moderates each offer before it goes live.",
  },
  {
    id: "gbp",
    name: "Google reviews",
    setup: GBP_ADDON_ONE_OFF_GBP,
    monthly: GBP_ADDON_MONTHLY_GBP,
    icon: <StarsIcon />,
    content: false,
    blurb:
      "I'll set up or audit your Google Business Profile and automate a daily refresh of your top Google reviews onto your site (Google Places API). Your star rating shows in search too.",
  },
];

const CONTENT_IDS = ADDONS.filter((a) => a.content).map((a) => a.id);

const TIERS: Array<{
  id: Tier;
  name: string;
  monthly: string;
  setup: string;
  note: string;
  comingSoon?: boolean;
}> = [
  {
    id: "founding",
    name: "Founder",
    monthly: `£${FOUNDING_MEMBER_MONTHLY_GBP}/mo`,
    setup: `£${FOUNDING_MEMBER_SETUP_GBP} upfront`,
    note: "First 3 clients · 5-yr lock",
  },
  {
    id: "standard",
    name: "Standard",
    monthly: `from £${BASE_MONTHLY_GBP}/mo`,
    setup: `from £${BASE_SETUP_GBP} upfront`,
    note: "Build your own",
  },
  {
    id: "premium",
    name: "Premium",
    monthly: "£149/mo",
    setup: "+ setup",
    note: "Done-for-you",
    comingSoon: true,
  },
];

// Distinct glow per tier — the preview "feels" more premium as you move up.
const TIER_GLOW: Record<Tier, string> = {
  standard: "bg-navy-400/25 blur-2xl",
  founding: "bg-ember-500/35 blur-3xl",
  premium:
    "bg-[conic-gradient(from_140deg,rgba(249,115,22,0.55),rgba(251,191,36,0.45),rgba(249,115,22,0.5),rgba(251,191,36,0.45),rgba(249,115,22,0.55))] blur-3xl",
};
const TIER_RING: Record<Tier, string> = {
  standard: "ring-1 ring-navy-100",
  founding: "ring-2 ring-ember-300/60",
  premium: "ring-2 ring-amber-300/70",
};

function formatGBP(n: number) {
  const hasPence = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: hasPence ? 2 : 0,
    maximumFractionDigits: hasPence ? 2 : 0,
  });
}

export default function PricingPuzzle() {
  const [tier, setTier] = useState<Tier>("standard");
  const [picked, setPicked] = useState<Record<ModuleId, boolean>>({
    booking: false,
    enquiry: false,
    newsletter: false,
    offers: false,
    gbp: false,
  });
  const [extraLocations, setExtraLocations] = useState(0);
  const [infoId, setInfoId] = useState<ModuleId | null>(null);

  const founding = tier === "founding";
  const premium = tier === "premium";

  const effective: Record<ModuleId, boolean> = {
    booking: picked.booking || founding || premium,
    enquiry: picked.enquiry || founding || premium,
    newsletter: picked.newsletter || founding || premium,
    offers: picked.offers || founding || premium,
    gbp: picked.gbp || premium,
  };

  useEffect(() => {
    if (!infoId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setInfoId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infoId]);

  const fees = calculateFees(
    {
      moduleBooking: effective.booking,
      moduleEnquiry: effective.enquiry,
      moduleNewsletter: effective.newsletter,
      moduleOffers: effective.offers,
      gbpAddon: effective.gbp,
      extraLocations,
    },
    founding,
  );
  const firstYear = fees.setup + fees.monthly * 12;

  const isLocked = (id: ModuleId) =>
    premium || (founding && CONTENT_IDS.includes(id));

  function toggle(id: ModuleId) {
    if (isLocked(id)) return;
    setPicked((p) => ({ ...p, [id]: !p[id] }));
  }

  const ctaLabel = premium ? "Register interest" : "Get started";

  return (
    <div>
      {/* ---- Thin tier bar ---------------------------------------- */}
      <div role="radiogroup" aria-label="Choose a plan" className="grid gap-2.5 sm:grid-cols-3">
        {TIERS.map((t) => {
          const active = tier === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTier(t.id)}
              className={[
                "relative flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-all",
                active
                  ? "border-ember-500 bg-white shadow-card"
                  : "border-navy-100 bg-white/60 hover:border-navy-300",
              ].join(" ")}
            >
              <span>
                <span className="flex items-center gap-2">
                  <span className="font-serif text-[1.05rem] font-semibold text-navy-900">
                    {t.name}
                  </span>
                  {t.comingSoon && (
                    <span className="rounded-full bg-ember-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                      Soon
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-navy-500">{t.note}</span>
              </span>
              <span className="flex-none text-right">
                <span className="block font-serif text-[0.95rem] font-semibold leading-none text-navy-900">
                  {t.monthly}
                </span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-navy-500">
                  {t.setup}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- List (left) + big preview (right) -------------------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-start">
        {/* Add-on list */}
        <div>
          <h2 className="font-serif text-xl font-semibold text-navy-900">
            {premium ? "Everything's included" : founding ? "Your founding kit" : "Add what you need"}
          </h2>
          <p className="mt-1 text-[0.9rem] leading-snug text-navy-600">
            {premium
              ? "Premium is hands-off — I run the lot for you. Launching soon."
              : founding
                ? "All four content modules are included. Reviews and extra locations are optional."
                : "Tap a module — watch it land on your site and the total update."}
          </p>

          <ul className="mt-4 space-y-2.5">
            {/* Base — always included */}
            <li className="flex items-center gap-3 rounded-xl border-2 border-navy-900 bg-navy-900 px-3.5 py-3 text-white">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-white/15 text-white">
                <HomeIcon />
              </span>
              <span className="flex-1">
                <span className="block text-[0.95rem] font-semibold leading-tight">Base website</span>
                <span className="block text-[11px] text-cream-100/70">
                  Mobile-first · hosting · maintenance · support
                </span>
              </span>
              <span className="flex-none rounded-full bg-ember-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                Included
              </span>
            </li>

            {ADDONS.map((a) => {
              const on = effective[a.id];
              const locked = isLocked(a.id);
              const includedFree = founding && a.content;
              return (
                <li key={a.id} className="relative">
                  <div
                    className={[
                      "flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 transition-all",
                      on
                        ? "border-ember-500 bg-white shadow-sm"
                        : "border-dashed border-navy-200 bg-white/60 hover:border-navy-400",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      disabled={locked}
                      aria-pressed={on}
                      className={["flex flex-1 items-center gap-3 text-left", locked ? "cursor-default" : "cursor-pointer"].join(" ")}
                    >
                      <span
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg transition-colors"
                        style={{
                          background: on ? "rgba(249,115,22,0.14)" : "rgba(15,29,48,0.06)",
                          color: on ? EMBER : NAVY,
                        }}
                      >
                        {a.icon}
                      </span>
                      <span className="flex-1">
                        <span className="block text-[0.95rem] font-semibold leading-tight text-navy-900">
                          {a.name}
                        </span>
                        <span className="block text-[11px] text-navy-500">
                          {includedFree ? (
                            <span className="font-semibold text-ember-600">Included</span>
                          ) : (
                            <>+{formatGBP(a.setup)} setup · +{formatGBP(a.monthly)}/mo</>
                          )}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={[
                          "flex h-5 w-5 flex-none items-center justify-center rounded-md border-2 transition-colors",
                          on ? "border-ember-500 bg-ember-500" : "border-navy-300 bg-white",
                        ].join(" ")}
                      >
                        {on && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12 L10 17 L19 7" />
                          </svg>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInfoId((cur) => (cur === a.id ? null : a.id))}
                      aria-label={`More about ${a.name}`}
                      aria-expanded={infoId === a.id}
                      className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-200"
                    >
                      i
                    </button>
                  </div>

                  {/* Info pop-out */}
                  {infoId === a.id && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-xl border border-navy-100 bg-white p-4 shadow-lift">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-serif text-[1rem] font-semibold text-navy-900">{a.name}</h3>
                        <button
                          type="button"
                          onClick={() => setInfoId(null)}
                          aria-label="Close"
                          className="-mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-navy-100 text-navy-700"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="mt-1.5 text-[0.85rem] leading-relaxed text-navy-700">{a.blurb}</p>
                      <p className="mt-2 text-[0.85rem] font-semibold text-navy-900">
                        +{formatGBP(a.setup)} setup · +{formatGBP(a.monthly)}/mo
                      </p>
                    </div>
                  )}
                </li>
              );
            })}

            {/* Multi-location counter */}
            {!premium && (
              <li
                className={[
                  "flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 transition-all",
                  extraLocations > 0 ? "border-ember-500 bg-white shadow-sm" : "border-dashed border-navy-200 bg-white/60",
                ].join(" ")}
              >
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg"
                  style={{
                    background: extraLocations > 0 ? "rgba(249,115,22,0.14)" : "rgba(15,29,48,0.06)",
                    color: extraLocations > 0 ? EMBER : NAVY,
                  }}
                >
                  <PinIcon />
                </span>
                <span className="flex-1">
                  <span className="block text-[0.95rem] font-semibold leading-tight text-navy-900">
                    Multi-location
                  </span>
                  <span className="block text-[11px] text-navy-500">
                    +{formatGBP(MODULE_MULTILOCATION_SETUP_GBP)} each · no monthly
                  </span>
                </span>
                <span className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-navy-200 bg-cream-50 px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => setExtraLocations((n) => Math.max(0, n - 1))}
                    disabled={extraLocations === 0}
                    aria-label="Remove one extra location"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-900 text-white disabled:bg-navy-300"
                  >
                    −
                  </button>
                  <span className="min-w-[1.5rem] text-center font-serif text-base font-semibold text-navy-900" aria-live="polite">
                    {extraLocations}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtraLocations((n) => Math.min(50, n + 1))}
                    aria-label="Add one extra location"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-900 text-white"
                  >
                    +
                  </button>
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Big preview + running total */}
        <div className="lg:sticky lg:top-24">
          <div className="relative">
            <div
              aria-hidden="true"
              className={["pointer-events-none absolute -inset-6 rounded-[2.5rem] transition-all duration-500", TIER_GLOW[tier]].join(" ")}
            />
            <SitePreview active={effective} extraLocations={extraLocations} premium={premium} ring={TIER_RING[tier]} />
          </div>

          {/* Running total — desktop */}
          <div className="mt-4 hidden items-center justify-between gap-4 rounded-2xl bg-navy-950 px-6 py-4 text-white shadow-lift lg:flex">
            {premium ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ember-300">Premium · done-for-you</p>
                <p className="font-serif text-2xl font-semibold">£149<span className="text-sm font-normal text-cream-300/70">/mo</span></p>
              </div>
            ) : (
              <div className="flex items-end gap-6">
                <Total label="Setup" value={formatGBP(fees.setup)} />
                <Total label="Monthly" value={`${formatGBP(fees.monthly)}`} suffix="/mo" />
                <Total label="First year" value={formatGBP(firstYear)} accent />
              </div>
            )}
            <Link href={site.enquiryPath} className="btn-primary flex-none !bg-white !text-navy-900 hover:!bg-ember-400 hover:!text-white">
              {ctaLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* Running total — mobile sticky */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-navy-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <div>
            {premium ? (
              <p className="font-serif text-xl font-semibold text-navy-900">£149<span className="text-sm font-normal text-navy-500">/mo</span></p>
            ) : (
              <>
                <p className="font-serif text-xl font-semibold leading-none text-navy-900">
                  {formatGBP(fees.monthly)}<span className="text-sm font-normal text-navy-500">/mo</span>
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-navy-500">
                  {formatGBP(fees.setup)} setup · {formatGBP(firstYear)} first year
                </p>
              </>
            )}
          </div>
          <Link href={site.enquiryPath} className="btn-primary flex-none">{ctaLabel}</Link>
        </div>
      </div>
    </div>
  );
}

function Total({ label, value, suffix, accent }: { label: string; value: string; suffix?: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-cream-300/60">{label}</p>
      <p className={["font-serif text-2xl font-semibold leading-none", accent ? "text-ember-400" : "text-white"].join(" ")}>
        {value}
        {suffix && <span className="text-sm font-normal text-cream-300/70">{suffix}</span>}
      </p>
    </div>
  );
}

// Large "your site" preview. Optional blocks fly in from the LEFT (toward
// the list) when their module is on, each labelled with icon + name so you
// see where it lands. Reverses out when removed.
function SitePreview({
  active,
  extraLocations,
  premium,
  ring,
}: {
  active: Record<ModuleId, boolean>;
  extraLocations: number;
  premium: boolean;
  ring: string;
}) {
  return (
    <div className={["relative overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card", ring].join(" ")}>
      <div className="flex items-center gap-2 border-b border-navy-100 bg-cream-100 px-4 py-3">
        <span className="h-3 w-3 rounded-full" style={{ background: EMBER }} />
        <span className="h-3 w-3 rounded-full bg-navy-200" />
        <span className="h-3 w-3 rounded-full bg-navy-200" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1.5 text-[12px] text-navy-400">yourbusiness.co.uk</span>
      </div>

      <div className="p-5 md:p-6">
        {/* Offers strip — top of the site */}
        <FlyBlock on={active.offers}>
          <LabeledBlock icon={<TagIcon />} name="Offers" tone="ember">
            <div className="flex items-center justify-between rounded-md bg-ember-500 px-3 py-1.5 text-[11px] font-semibold text-white">
              <span>Spring offer — 10% off</span>
              <span className="rounded bg-white/25 px-2 py-0.5">Claim</span>
            </div>
          </LabeledBlock>
        </FlyBlock>

        {/* Nav + hero (always) */}
        <div className="mt-3 flex items-center justify-between">
          <div className="h-4 w-28 rounded" style={{ background: NAVY }} />
          <div className="flex gap-2">
            <div className="h-3 w-10 rounded bg-navy-200" />
            <div className="h-3 w-10 rounded bg-navy-200" />
            <div className="h-3 w-12 rounded" style={{ background: EMBER }} />
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 p-4">
          <div className="h-5 w-3/4 rounded" style={{ background: NAVY }} />
          <div className="mt-2 h-3 w-full rounded bg-navy-100" />
          <div className="mt-1.5 h-3 w-5/6 rounded bg-navy-100" />
          <div className="mt-3 h-8 w-28 rounded-lg" style={{ background: EMBER }} />
        </div>

        {/* Reviews */}
        <FlyBlock on={active.gbp}>
          <LabeledBlock icon={<StarsIcon />} name="Google reviews" tone="ember">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} />
              ))}
              <span className="ml-1.5 h-3 w-20 rounded bg-navy-200" />
              <span className="ml-auto h-3 w-12 rounded bg-navy-100" />
            </div>
          </LabeledBlock>
        </FlyBlock>

        {/* Booking */}
        <FlyBlock on={active.booking}>
          <LabeledBlock icon={<CalendarIcon />} name="Online Booking" tone="navy">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-navy-200" />
                <div className="h-2.5 w-32 rounded bg-navy-100" />
              </div>
              <div className="h-8 w-24 rounded-md" style={{ background: NAVY }} />
            </div>
          </LabeledBlock>
        </FlyBlock>

        {/* Enquiry */}
        <FlyBlock on={active.enquiry}>
          <LabeledBlock icon={<MailIcon />} name="Enquiry Form" tone="navy">
            <div className="space-y-2">
              <div className="h-6 w-full rounded bg-cream-100" />
              <div className="flex items-center justify-between">
                <div className="h-6 w-2/3 rounded bg-cream-100" />
                <div className="h-7 w-20 rounded-md" style={{ background: EMBER }} />
              </div>
            </div>
          </LabeledBlock>
        </FlyBlock>

        {/* Newsletter */}
        <FlyBlock on={active.newsletter}>
          <LabeledBlock icon={<PlaneIcon />} name="Newsletter" tone="navy">
            <div className="flex items-center gap-2">
              <div className="h-7 flex-1 rounded bg-cream-100" />
              <div className="h-7 w-20 rounded-md" style={{ background: EMBER }} />
            </div>
          </LabeledBlock>
        </FlyBlock>

        {/* Multi-location */}
        <FlyBlock on={extraLocations > 0}>
          <LabeledBlock icon={<PinIcon />} name={`${extraLocations + 1} locations`} tone="ember">
            <div className="flex items-center gap-2">
              <div className="h-3 w-24 rounded bg-navy-200" />
              <span className="ml-auto h-3 w-14 rounded bg-navy-100" />
            </div>
          </LabeledBlock>
        </FlyBlock>

        {/* Footer (always) */}
        <div className="mt-3 flex justify-between">
          <div className="h-2.5 w-24 rounded bg-navy-100" />
          <div className="h-2.5 w-20 rounded bg-navy-100" />
        </div>

        {premium && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold text-ember-700 ring-1 ring-amber-200">
            ✦ Managed for you — hosting, domain &amp; content handled
          </div>
        )}
      </div>
    </div>
  );
}

// A block that animates in from the left (toward the list) when on.
function FlyBlock({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      className={FLY}
      style={{
        maxHeight: on ? 120 : 0,
        opacity: on ? 1 : 0,
        marginTop: on ? 12 : 0,
        transform: on ? "translateX(0) scale(1)" : "translateX(-28px) scale(0.97)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

// A preview block tagged with its module icon + name, so you can see which
// add-on just landed and where.
function LabeledBlock({
  icon,
  name,
  tone,
  children,
}: {
  icon: React.ReactNode;
  name: string;
  tone: "ember" | "navy";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-navy-100 bg-white px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span
          className="flex h-5 w-5 items-center justify-center rounded"
          style={{
            background: tone === "ember" ? "rgba(249,115,22,0.14)" : "rgba(15,29,48,0.07)",
            color: tone === "ember" ? EMBER : NAVY,
          }}
        >
          <span className="scale-[0.7]">{icon}</span>
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-navy-500">{name}</span>
      </div>
      {children}
    </div>
  );
}

function Star() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={EMBER} aria-hidden="true">
      <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
