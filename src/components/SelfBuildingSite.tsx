"use client";

// Hero animation: a browser frame whose UI blocks assemble themselves as
// the user scrolls DOWN and dis-assemble on scroll UP — scroll-progress
// driven (not a one-shot), so it "comes together" and reverses with the
// scroll. The empty frame is the at-rest first impression; pieces click in
// as you scroll. Pure JS scroll progress + inline styles, no deps.
// Reduced-motion → fully assembled, static.

import { useEffect, useRef, useState } from "react";

const NAVY = "#0f1d30";
const EMBER = "#f97316";

const ease = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default function SelfBuildingSite({
  className = "",
}: {
  className?: string;
}) {
  const [p, setP] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setP(1);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      // Assemble over the first ~0.75 viewport of scroll from the top.
      const range = window.innerHeight * 0.75;
      setP(clamp01(window.scrollY / range));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Per-block style: each block has a start threshold; it eases in over a
  // short window as progress passes it, and reverses as progress drops.
  const bs = (start: number): React.CSSProperties => {
    if (reduced) return { opacity: 1 };
    const local = ease(clamp01((p - start) / 0.16));
    return {
      opacity: local,
      transform: `translateY(${(1 - local) * 16}px) scale(${0.95 + 0.05 * local})`,
    };
  };

  return (
    <div className={className}>
      <div
        className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card"
        role="img"
        aria-label="A website assembling itself as you scroll"
      >
        {/* Browser chrome (always present — the frame you build into) */}
        <div className="flex items-center gap-2 border-b border-navy-100 bg-cream-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: EMBER }} />
          <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
          <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-navy-400" style={bs(0)}>
            yourbusiness.co.uk
          </span>
        </div>

        <div className="space-y-3 p-4 md:p-5">
          {/* Nav */}
          <div className="flex items-center justify-between" style={bs(0.06)}>
            <div className="h-4 w-24 rounded" style={{ background: NAVY }} />
            <div className="flex gap-2">
              <div className="h-3 w-10 rounded bg-navy-200" />
              <div className="h-3 w-10 rounded bg-navy-200" />
              <div className="h-3 w-12 rounded" style={{ background: EMBER }} />
            </div>
          </div>

          {/* Hero block */}
          <div className="rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 p-4" style={bs(0.16)}>
            <div className="h-5 w-3/4 rounded" style={{ background: NAVY }} />
            <div className="mt-2 h-3 w-full rounded bg-navy-100" />
            <div className="mt-1.5 h-3 w-5/6 rounded bg-navy-100" />
            <div className="mt-3 h-7 w-28 rounded-lg" style={{ background: EMBER }} />
          </div>

          {/* Feature / gallery grid */}
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-navy-100 bg-cream-50 p-2.5" style={bs(0.3 + i * 0.07)}>
                <div className="h-8 w-full rounded bg-navy-100" />
                <div className="mt-2 h-2 w-3/4 rounded bg-navy-200" />
                <div className="mt-1 h-2 w-1/2 rounded bg-navy-100" />
              </div>
            ))}
          </div>

          {/* Reviews / booking strip */}
          <div className="flex items-center justify-between rounded-lg border border-navy-100 bg-white p-3" style={bs(0.56)}>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} color={EMBER} />
              ))}
              <span className="ml-1.5 h-2.5 w-14 rounded bg-navy-200" />
            </div>
            <div className="h-6 w-20 rounded-md" style={{ background: NAVY }} />
          </div>

          {/* Footer */}
          <div className="flex justify-between pt-1" style={bs(0.66)}>
            <div className="h-2 w-20 rounded bg-navy-100" />
            <div className="h-2 w-16 rounded bg-navy-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Star({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" />
    </svg>
  );
}
