"use client";

// Template gallery: a single, full-width card on mobile (no clipping) and
// a 3D coverflow on desktop (active centred, neighbours rotated back).
// Prev/next + dots + side-card click; gentle autoplay paused on
// hover/focus/reduced-motion. Pure CSS, no deps. Takes the existing
// preview cards as `items` so it stays presentation-only.

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  items: ReactNode[];
  labels?: string[];
  intervalMs?: number;
};

export default function TemplateCarousel({
  items,
  labels,
  intervalMs = 4500,
}: Props) {
  const n = items.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stageH, setStageH] = useState(540);
  const reduced = useRef(false);
  const activeCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!intervalMs || paused || reduced.current || n <= 1) return;
    const id = setInterval(() => setActive((a) => (a + 1) % n), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, paused, n]);

  // Size the desktop coverflow stage to the active card so it never clips.
  useEffect(() => {
    const measure = () => {
      const h = activeCardRef.current?.offsetHeight;
      if (h && h > 0) setStageH(h);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  const go = (d: number) => setActive((a) => (a + d + n) % n);
  const offsetOf = (i: number) => {
    let o = i - active;
    if (o > n / 2) o -= n;
    if (o < -n / 2) o += n;
    return o;
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <style>{`@keyframes mf-slide-in {0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}`}</style>

      {/* Mobile: single full-width card, no clipping */}
      <div className="md:hidden">
        <div key={active} style={{ animation: reduced.current ? undefined : "mf-slide-in .4s ease both" }}>
          {items[active]}
        </div>
      </div>

      {/* Desktop: 3D coverflow */}
      <div
        className="relative mx-auto hidden w-full overflow-hidden md:block"
        style={{ perspective: "1600px", height: stageH }}
        aria-roledescription="carousel"
      >
        {items.map((item, i) => {
          const o = offsetOf(i);
          const abs = Math.abs(o);
          const hidden = abs >= 2;
          const transform =
            `translateX(calc(-50% + ${o * 52}%)) ` +
            `translateZ(${o === 0 ? 0 : -260}px) ` +
            `rotateY(${o === 0 ? 0 : o > 0 ? -34 : 34}deg) ` +
            `scale(${o === 0 ? 1 : 0.82})`;
          return (
            <div
              key={i}
              ref={o === 0 ? activeCardRef : undefined}
              aria-hidden={o !== 0}
              onClick={() => o !== 0 && setActive(i)}
              className={[
                "absolute left-1/2 top-0 w-full max-w-[440px] transition-all duration-500 ease-out",
                o !== 0 ? "cursor-pointer" : "",
              ].join(" ")}
              style={{
                transform,
                opacity: hidden ? 0 : o === 0 ? 1 : 0.6,
                zIndex: 10 - abs,
                pointerEvents: hidden ? "none" : "auto",
                filter: o === 0 ? "none" : "saturate(0.85)",
              }}
            >
              {item}
            </div>
          );
        })}
      </div>

      {/* Controls (shared) */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous template"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-navy-200 bg-white text-navy-900 transition-colors hover:border-navy-900"
        >
          <Chevron dir="left" />
        </button>
        <div className="flex items-center gap-2">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${labels?.[i] ?? `template ${i + 1}`}`}
              aria-current={i === active}
              className={[
                "h-2.5 rounded-full transition-all",
                i === active ? "w-7 bg-ember-500" : "w-2.5 bg-navy-200 hover:bg-navy-400",
              ].join(" ")}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next template"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-navy-200 bg-white text-navy-900 transition-colors hover:border-navy-900"
        >
          <Chevron dir="right" />
        </button>
      </div>

      {labels?.[active] && (
        <p className="mt-3 text-center text-sm font-semibold capitalize text-navy-700">
          {labels[active]}
        </p>
      )}
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
