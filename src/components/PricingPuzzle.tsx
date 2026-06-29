"use client";

// Pricing puzzle (Phase M): the pricing page as a puzzle board.
//
//  1. Pick a TIER FRAME — Founding / Standard / Premium. The frame sets
//     the base price and what's already included.
//  2. Tap MODULE PIECES — each snaps into the board (overshoot spring)
//     and a matching block pops into a mini "your site" preview.
//  3. LIVE TOTALS — setup / monthly / first-year, computed by
//     calculateFees() so the figures always match what's actually
//     charged at checkout (fees.ts is the single source of truth).
//
// Mobile: pieces show name + price + an (i) info icon → bottom-sheet
// explanation; a sticky bottom bar carries the running total + CTA.
// Reduced-motion users still get every state — only the spring eases out.

import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/lib/site";
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

// Spring-snap timing — overshoots slightly then settles. Used for both
// the piece "click in" and the preview block pop.
const SNAP = "[transition-timing-function:cubic-bezier(0.34,1.4,0.5,1)]";

type ModuleId =
  | "booking"
  | "enquiry"
  | "newsletter"
  | "offers"
  | "gbp";

type Tier = "founding" | "standard" | "premium";

type ModuleDef = {
  id: ModuleId;
  name: string;
  setup: number;
  monthly: number;
  short: string; // one line, shown on the piece
  blurb: string; // full text, shown in the info sheet
};

// The four "content" modules are bundled into the Founding tier (the
// founding deal includes them); GBP stays an optional add-on for every
// tier because its monthly covers a real per-customer API cost.
const CONTENT_MODULES: ModuleId[] = ["booking", "enquiry", "newsletter", "offers"];

const MODULES: ModuleDef[] = [
  {
    id: "booking",
    name: "Online Booking",
    setup: MODULE_BOOKING_SETUP_GBP,
    monthly: MODULE_BOOKING_MONTHLY_GBP,
    short: "Take bookings from your site",
    blurb:
      "Let customers book jobs directly from your website. Syncs with your calendar, sends automatic confirmations and reminders, and cuts the phone tag.",
  },
  {
    id: "enquiry",
    name: "Enquiry Form",
    setup: MODULE_ENQUIRY_SETUP_GBP,
    monthly: MODULE_ENQUIRY_MONTHLY_GBP,
    short: "Leads straight to your inbox",
    blurb:
      "A branded contact form with spam protection. Enquiries land straight in your inbox without exposing your email address — never miss a lead.",
  },
  {
    id: "newsletter",
    name: "Newsletter",
    setup: MODULE_NEWSLETTER_SETUP_GBP,
    monthly: MODULE_NEWSLETTER_MONTHLY_GBP,
    short: "Stay in touch with customers",
    blurb:
      "Collect customer emails and send a monthly newsletter from name@yourdomain. Each campaign is auto-drafted in your voice (reviewed by me first) — no writer's block, just check and send.",
  },
  {
    id: "offers",
    name: "Offers",
    setup: MODULE_OFFERS_SETUP_GBP,
    monthly: MODULE_OFFERS_MONTHLY_GBP,
    short: "Promote a deal on your homepage",
    blurb:
      "A promotional strip on your homepage — headline, dates and a call to action — that you control from your dashboard. Cowork moderates each offer before it goes live to keep claims honest.",
  },
  {
    id: "gbp",
    name: "Google reviews",
    setup: GBP_ADDON_ONE_OFF_GBP,
    monthly: GBP_ADDON_MONTHLY_GBP,
    short: "Google Business Profile + live reviews",
    blurb:
      "I'll set up or audit your Google Business Profile and automate a daily refresh of your top Google reviews onto your site (powered by Google's own Places API). Your star rating shows up in search results too.",
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

const TIERS: Array<{
  id: Tier;
  name: string;
  tagline: string;
  setup: string;
  monthly: string;
  comingSoon?: boolean;
}> = [
  {
    id: "founding",
    name: "Founding",
    tagline: "First 3 clients · locked 5 years",
    setup: `${formatGBP(FOUNDING_MEMBER_SETUP_GBP)} setup`,
    monthly: `${formatGBP(FOUNDING_MEMBER_MONTHLY_GBP)}/mo`,
  },
  {
    id: "standard",
    name: "Standard",
    tagline: "Build your own — pick your modules",
    setup: `from ${formatGBP(BASE_SETUP_GBP)} setup`,
    monthly: `from ${formatGBP(BASE_MONTHLY_GBP)}/mo`,
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Done-for-you · I run the lot",
    setup: "+ setup",
    monthly: "£149/mo",
    comingSoon: true,
  },
];

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
  const [infoModule, setInfoModule] = useState<ModuleDef | null>(null);

  // Founding bundles the four content modules; Premium shows everything
  // assembled. "effective" is what's actually seated in the board.
  const founding = tier === "founding";
  const premium = tier === "premium";
  const effective: Record<ModuleId, boolean> = {
    booking: picked.booking || founding || premium,
    enquiry: picked.enquiry || founding || premium,
    newsletter: picked.newsletter || founding || premium,
    offers: picked.offers || founding || premium,
    gbp: picked.gbp || premium,
  };

  // Close the info sheet on Escape.
  useEffect(() => {
    if (!infoModule) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoModule(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infoModule]);

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

  function toggle(id: ModuleId) {
    // In Founding, the four content modules are already included and
    // locked; GBP stays toggleable. In Premium nothing is buyable here.
    if (premium) return;
    if (founding && CONTENT_MODULES.includes(id)) return;
    setPicked((p) => ({ ...p, [id]: !p[id] }));
  }

  function isLocked(id: ModuleId) {
    return premium || (founding && CONTENT_MODULES.includes(id));
  }

  const ctaHref = site.enquiryPath;
  const ctaLabel = premium ? "Register interest" : "Get started";

  return (
    <div>
      {/* ---- Tier frames ------------------------------------------- */}
      <div role="radiogroup" aria-label="Choose a plan" className="grid gap-4 sm:grid-cols-3">
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
                "group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all duration-300",
                SNAP,
                active
                  ? "border-ember-500 bg-white shadow-lift"
                  : "border-navy-100 bg-white/70 hover:border-navy-300 hover:bg-white",
              ].join(" ")}
            >
              {t.comingSoon && (
                <span className="absolute right-3 top-3 rounded-full bg-ember-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Coming soon
                </span>
              )}
              <span
                aria-hidden="true"
                className={[
                  "absolute left-0 top-0 h-full w-1.5 transition-colors",
                  active ? "bg-ember-500" : "bg-transparent group-hover:bg-navy-200",
                ].join(" ")}
              />
              <h3 className="font-serif text-xl font-semibold text-navy-900">
                {t.name}
              </h3>
              <p className="mt-1 text-[0.85rem] leading-snug text-navy-600">
                {t.tagline}
              </p>
              <p className="mt-3 font-serif text-lg font-semibold text-navy-900">
                {t.monthly}
              </p>
              <p className="text-xs uppercase tracking-wider text-navy-500">
                {t.setup}
              </p>
            </button>
          );
        })}
      </div>

      {/* ---- Board + pieces ---------------------------------------- */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        {/* Pieces tray */}
        <div>
          <h2 className="font-serif text-2xl font-semibold text-navy-900">
            {premium
              ? "Everything's included"
              : founding
                ? "Your founding kit"
                : "Click your pieces into place"}
          </h2>
          <p className="mt-2 text-[1.02rem] leading-relaxed text-navy-700">
            {premium
              ? "Premium is hands-off — I run hosting, your domain, the newsletter, monthly review campaigns and priority changes for you. Launching soon."
              : founding
                ? "Founding members get the base site and all four content modules included. Google reviews and extra locations are optional add-ons."
                : "Every site starts with the base. Tap a module to snap it into your site — watch the preview and your total update."}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {/* Base piece — always seated */}
            <div className="relative rounded-2xl border-2 border-navy-900 bg-navy-900 p-4 text-white">
              <span className="rounded-full bg-ember-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                Always included
              </span>
              <h3 className="mt-2 font-serif text-lg font-semibold">Base website</h3>
              <p className="mt-1 text-[0.85rem] leading-snug text-cream-100/80">
                Mobile-first site, hosting on your own account, maintenance, 3
                monthly changes, support.
              </p>
            </div>

            {MODULES.map((m) => {
              const on = effective[m.id];
              const locked = isLocked(m.id);
              const includedFree = founding && CONTENT_MODULES.includes(m.id);
              return (
                <PieceButton
                  key={m.id}
                  module={m}
                  on={on}
                  locked={locked}
                  includedFree={includedFree}
                  onToggle={() => toggle(m.id)}
                  onInfo={() => setInfoModule(m)}
                />
              );
            })}
          </div>

          {/* Multi-location — a counter piece */}
          {!premium && (
            <div
              className={[
                "mt-3 rounded-2xl border-2 p-4 transition-all duration-300",
                SNAP,
                extraLocations > 0
                  ? "border-ember-500 bg-white shadow-card"
                  : "border-dashed border-navy-200 bg-white/60",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-navy-900">
                    Multi-location
                  </h3>
                  <p className="mt-0.5 text-[0.85rem] text-navy-600">
                    Extra contact / map / hours block ·{" "}
                    {formatGBP(MODULE_MULTILOCATION_SETUP_GBP)} setup each, no
                    monthly
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-navy-200 bg-cream-50 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setExtraLocations((n) => Math.max(0, n - 1))}
                    disabled={extraLocations === 0}
                    aria-label="Remove one extra location"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-navy-900 text-white disabled:bg-navy-300"
                  >
                    −
                  </button>
                  <span
                    className="min-w-[2rem] text-center font-serif text-lg font-semibold text-navy-900"
                    aria-live="polite"
                  >
                    {extraLocations}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtraLocations((n) => Math.min(50, n + 1))}
                    aria-label="Add one extra location"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-navy-900 text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Board preview + totals (sticky on desktop) */}
        <div className="lg:sticky lg:top-28">
          <SitePreview active={effective} extraLocations={extraLocations} premium={premium} />

          <div className="mt-5 rounded-3xl bg-navy-950 p-7 text-white shadow-lift">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-300">
              {premium ? "Premium — done-for-you" : "Your total"}
            </p>

            {premium ? (
              <div className="mt-5">
                <p className="font-serif text-4xl font-semibold">
                  £149
                  <span className="text-lg font-normal text-cream-300/70">/mo</span>
                </p>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-cream-100/85">
                  Managed hosting and domain on your behalf, premium designs,
                  your newsletter written and sent, monthly review campaigns, a
                  higher change allowance and priority turnaround.
                </p>
                <p className="mt-3 text-[13px] text-cream-300/70">
                  Launching soon — register your interest and you&apos;ll be
                  first to know.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                <Row label="Setup fee" sub="One-off · paid today" value={formatGBP(fees.setup)} />
                <Row
                  label="Monthly fee"
                  sub="Billed monthly · cancel any time"
                  value={
                    <>
                      {formatGBP(fees.monthly)}
                      <span className="text-base font-normal text-cream-300/70"> / mo</span>
                    </>
                  }
                />
                <div className="rounded-2xl bg-ember-500 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ember-100">
                    Total first-year cost
                  </p>
                  <p className="mt-1 font-serif text-3xl font-semibold">
                    {formatGBP(firstYear)}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-ember-50">
                    Setup plus twelve monthly payments. No hidden extras.
                  </p>
                </div>
              </div>
            )}

            <Link
              href={ctaHref}
              className="btn-primary mt-6 hidden w-full !bg-white !text-navy-900 hover:!bg-ember-400 hover:!text-white lg:inline-flex"
            >
              {ctaLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* ---- Mobile sticky total bar ------------------------------- */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-navy-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <div>
            {premium ? (
              <p className="font-serif text-xl font-semibold text-navy-900">
                £149<span className="text-sm font-normal text-navy-500">/mo</span>
              </p>
            ) : (
              <>
                <p className="font-serif text-xl font-semibold leading-none text-navy-900">
                  {formatGBP(fees.monthly)}
                  <span className="text-sm font-normal text-navy-500">/mo</span>
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-navy-500">
                  {formatGBP(fees.setup)} setup · {formatGBP(firstYear)} first year
                </p>
              </>
            )}
          </div>
          <Link href={ctaHref} className="btn-primary flex-none">
            {ctaLabel}
          </Link>
        </div>
      </div>

      {/* ---- Mobile info bottom-sheet ------------------------------ */}
      {infoModule && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`${infoModule.name} details`}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setInfoModule(null)}
            className="absolute inset-0 bg-navy-950/50"
          />
          <div className="relative w-full rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lift animate-[slideUp_0.25s_ease-out]">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-navy-200" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-xl font-semibold text-navy-900">
                {infoModule.name}
              </h3>
              <button
                type="button"
                onClick={() => setInfoModule(null)}
                aria-label="Close"
                className="-mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-navy-100 text-navy-700"
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-[1rem] leading-relaxed text-navy-700">
              {infoModule.blurb}
            </p>
            <p className="mt-4 font-serif text-lg font-semibold text-navy-900">
              +{formatGBP(infoModule.setup)} setup · +{formatGBP(infoModule.monthly)}/mo
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

function PieceButton({
  module: m,
  on,
  locked,
  includedFree,
  onToggle,
  onInfo,
}: {
  module: ModuleDef;
  on: boolean;
  locked: boolean;
  includedFree: boolean;
  onToggle: () => void;
  onInfo: () => void;
}) {
  return (
    <div
      className={[
        "relative rounded-2xl border-2 p-4 transition-all duration-300",
        SNAP,
        on
          ? "border-ember-500 bg-white shadow-card"
          : "border-dashed border-navy-200 bg-white/60 hover:border-navy-400",
        on ? "scale-100" : "scale-[0.99]",
      ].join(" ")}
    >
      {/* Puzzle "tab" nub on the right edge — decorative. */}
      <span
        aria-hidden="true"
        className={[
          "absolute -right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 transition-colors",
          on ? "border-ember-500 bg-ember-500" : "border-navy-200 bg-cream-50",
        ].join(" ")}
      />
      <button
        type="button"
        onClick={onToggle}
        disabled={locked}
        aria-pressed={on}
        className={["w-full text-left", locked ? "cursor-default" : "cursor-pointer"].join(" ")}
      >
        <div className="flex items-center gap-2">
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
          <h3 className="font-serif text-[1.05rem] font-semibold text-navy-900">
            {m.name}
          </h3>
        </div>
        <p className="mt-1.5 pr-6 text-[0.85rem] leading-snug text-navy-600">
          {m.short}
        </p>
        <p className="mt-2 text-[0.85rem] font-semibold text-navy-900">
          {includedFree ? (
            <span className="text-ember-600">Included</span>
          ) : (
            <>
              +{formatGBP(m.setup)} setup · +{formatGBP(m.monthly)}/mo
            </>
          )}
        </p>
      </button>

      {/* Info (i) — opens the mobile bottom-sheet; useful on desktop too. */}
      <button
        type="button"
        onClick={onInfo}
        aria-label={`More about ${m.name}`}
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-200"
      >
        i
      </button>
    </div>
  );
}

function Row({
  label,
  sub,
  value,
}: {
  label: string;
  sub: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/10 pb-4">
      <div>
        <p className="text-sm text-cream-200/70">{label}</p>
        <p className="text-[11px] uppercase tracking-wider text-cream-300/60">{sub}</p>
      </div>
      <p className="font-serif text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

// Mini "your site" preview — a browser frame whose blocks pop in as the
// matching module is selected (spring overshoot), reverse out when
// removed. Mirrors the SelfBuildingSite aesthetic on the homepage.
function SitePreview({
  active,
  extraLocations,
  premium,
}: {
  active: Record<ModuleId, boolean>;
  extraLocations: number;
  premium: boolean;
}) {
  const block = (on: boolean): React.CSSProperties => ({
    maxHeight: on ? 80 : 0,
    opacity: on ? 1 : 0,
    transform: on ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.97)",
    marginTop: on ? 10 : 0,
    overflow: "hidden",
    transition:
      "max-height 0.45s cubic-bezier(0.34,1.4,0.5,1), opacity 0.3s ease, transform 0.45s cubic-bezier(0.34,1.4,0.5,1), margin-top 0.45s ease",
  });

  return (
    <div
      className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card"
      role="img"
      aria-label="A preview of your site updating as you choose modules"
    >
      <div className="flex items-center gap-2 border-b border-navy-100 bg-cream-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: EMBER }} />
        <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-navy-400">
          yourbusiness.co.uk
        </span>
      </div>

      <div className="p-4">
        {/* Offers strip pops in above the nav */}
        <div style={block(active.offers)}>
          <div className="flex items-center justify-between rounded-lg bg-ember-500 px-3 py-2 text-[11px] font-semibold text-white">
            <span>Spring offer — 10% off</span>
            <span className="rounded bg-white/25 px-2 py-0.5">Book now</span>
          </div>
        </div>

        {/* Nav (always) */}
        <div className="mt-2.5 flex items-center justify-between">
          <div className="h-4 w-24 rounded" style={{ background: NAVY }} />
          <div className="flex gap-2">
            <div className="h-3 w-9 rounded bg-navy-200" />
            <div className="h-3 w-9 rounded bg-navy-200" />
            <div className="h-3 w-11 rounded" style={{ background: EMBER }} />
          </div>
        </div>

        {/* Hero (always) */}
        <div className="mt-3 rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 p-3.5">
          <div className="h-4 w-3/4 rounded" style={{ background: NAVY }} />
          <div className="mt-2 h-2.5 w-full rounded bg-navy-100" />
          <div className="mt-1.5 h-2.5 w-5/6 rounded bg-navy-100" />
          <div className="mt-3 h-6 w-24 rounded-lg" style={{ background: EMBER }} />
        </div>

        {/* GBP reviews row */}
        <div style={block(active.gbp)}>
          <div className="flex items-center gap-1.5 rounded-lg border border-navy-100 bg-white px-3 py-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} />
            ))}
            <span className="ml-1.5 h-2.5 w-16 rounded bg-navy-200" />
            <span className="ml-auto h-2.5 w-10 rounded bg-navy-100" />
          </div>
        </div>

        {/* Booking block */}
        <div style={block(active.booking)}>
          <div className="flex items-center justify-between rounded-lg border border-navy-100 bg-cream-50 px-3 py-3">
            <div className="space-y-1.5">
              <div className="h-2.5 w-20 rounded bg-navy-200" />
              <div className="h-2 w-28 rounded bg-navy-100" />
            </div>
            <div className="h-7 w-20 rounded-md" style={{ background: NAVY }} />
          </div>
        </div>

        {/* Enquiry form block */}
        <div style={block(active.enquiry)}>
          <div className="space-y-2 rounded-lg border border-navy-100 bg-white px-3 py-3">
            <div className="h-5 w-full rounded bg-cream-100" />
            <div className="h-5 w-full rounded bg-cream-100" />
            <div className="h-6 w-24 rounded-md" style={{ background: EMBER }} />
          </div>
        </div>

        {/* Newsletter block */}
        <div style={block(active.newsletter)}>
          <div className="flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-3">
            <div className="h-6 flex-1 rounded bg-white/15" />
            <div className="h-6 w-16 rounded-md" style={{ background: EMBER }} />
          </div>
        </div>

        {/* Multi-location row */}
        <div style={block(extraLocations > 0)}>
          <div className="flex items-center gap-2 rounded-lg border border-navy-100 bg-cream-50 px-3 py-2.5">
            <PinIcon />
            <span className="text-[11px] font-semibold text-navy-700">
              {extraLocations + 1} locations
            </span>
            <span className="ml-auto h-2.5 w-12 rounded bg-navy-100" />
          </div>
        </div>

        {/* Footer (always) */}
        <div className="mt-3 flex justify-between">
          <div className="h-2 w-20 rounded bg-navy-100" />
          <div className="h-2 w-16 rounded bg-navy-100" />
        </div>

        {premium && (
          <div className="mt-3 rounded-lg bg-ember-50 px-3 py-2 text-center text-[11px] font-semibold text-ember-700">
            Managed for you — hosting, domain & content handled
          </div>
        )}
      </div>
    </div>
  );
}

function Star() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={EMBER} aria-hidden="true">
      <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"
        stroke={NAVY}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9" r="2.2" fill={EMBER} />
    </svg>
  );
}
