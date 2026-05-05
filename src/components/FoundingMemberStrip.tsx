import Link from "next/link";
import { site } from "@/lib/site";

// Static for Stage 1. Wire to Notion in Stage 2 when we track real clients.
const SPOTS_REMAINING: number = 3;

export default function FoundingMemberStrip() {
  return (
    <div className="relative overflow-hidden rounded-2xl border-l-[6px] border-ember-500 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-900 p-6 text-white md:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-ember-500/20 blur-3xl"
      />
      <div className="relative grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ember-500 text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2 L14.5 8.5 L21.5 9 L16 13.5 L17.5 20.5 L12 17 L6.5 20.5 L8 13.5 L2.5 9 L9.5 8.5 Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <span className="font-serif text-[0.95rem] font-semibold uppercase tracking-[0.14em] text-ember-300">
            Founding member offer
          </span>
        </div>

        <p className="text-[1rem] leading-relaxed text-cream-100 md:text-[1.05rem]">
          My first three clients get everything included for a special
          founding-member rate:{" "}
          <span className="font-semibold text-white">£99 setup and £15/month, locked in for life</span>
          , in exchange for a testimonial and a short case study.{" "}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-500/15 px-2.5 py-0.5 text-sm font-semibold text-ember-200">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-ember-400"
            />
            {SPOTS_REMAINING} {SPOTS_REMAINING === 1 ? "spot" : "spots"} remaining
          </span>
        </p>

        <Link
          href={site.enquiryPath}
          className="inline-flex flex-none items-center justify-center rounded-full bg-ember-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-ember-400 md:text-base"
        >
          Claim a spot
        </Link>
      </div>
    </div>
  );
}
