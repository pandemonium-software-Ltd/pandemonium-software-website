"use client";

// Hero opener (Phase M, recommended #1): the headline assembles from
// scattered brand fragments on load — the bold first beat, the first
// thing you see. Each word flies in from a deterministic scattered
// offset and snaps into place with a slight overshoot ("clicking" into
// the puzzle), staggered left-to-right, over the aurora. A gentle
// scroll parallax keeps it alive as you read on.
//
// The full headline text is always in the real <h1> for SEO and screen
// readers — only transforms animate, nothing is hidden from the DOM.
// Reduced-motion → instant, fully assembled, zero motion.
//
// Pure rAF + inline styles, no deps. Above the fold, so a mount-driven
// timeline (not IntersectionObserver) is correct — it's in view on load.

import { Fragment, useEffect, useRef, useState } from "react";

// easeOutBack — overshoots slightly past 1 then settles back, giving
// the tactile "snap into place" feel as each fragment lands.
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Deterministic scatter per word index — alternating sides with varied
// vertical offset and rotation so the assembly reads organic, not
// mechanical. Kept modest so it settles elegantly (and stays within the
// hero's overflow-hidden bounds).
function scatterFor(i: number) {
  const side = i % 2 === 0 ? -1 : 1;
  const dx = side * (32 + ((i * 37) % 56)); // px, horizontal fly-in
  const dy = ((i % 3) - 1) * 30 - 14; // px, varies up/down
  const rot = side * (4 + ((i * 13) % 6)); // deg
  return { dx, dy, rot };
}

export default function HeroOpener({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const words = text.split(" ");
  const n = words.length;

  const [p, setP] = useState(0); // assembly progress 0→1 (mount timeline)
  const [scrollY, setScrollY] = useState(0); // for parallax
  const [reduced, setReduced] = useState(false);
  const doneRef = useRef(false);

  // Mount assembly timeline.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setP(1);
      return;
    }
    let raf = 0;
    const DURATION = 1150; // ms for the whole headline to assemble
    const start = performance.now();
    const tick = (now: number) => {
      const t = clamp01((now - start) / DURATION);
      setP(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else doneRef.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Subtle scroll parallax — the assembled headline drifts up gently as
  // the reader scrolls into the page. rAF-throttled, passive listener.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrollY(window.scrollY);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // The stagger spreads each word's start across this fraction of the
  // timeline; the remainder is each word's own travel window.
  const STAGGER = 0.55;
  const par = -scrollY * 0.04; // px of upward parallax

  const wordStyle = (i: number): React.CSSProperties => {
    if (reduced) return { display: "inline-block" };
    const startT = (i / Math.max(1, n - 1)) * STAGGER;
    const local = easeOutBack(clamp01((p - startT) / (1 - STAGGER)));
    const { dx, dy, rot } = scatterFor(i);
    const inv = 1 - local; // 1 = scattered, 0 = home (briefly negative = overshoot)
    return {
      display: "inline-block",
      opacity: clamp01(local * 1.6),
      transform: `translate3d(${dx * inv}px, ${dy * inv + par}px, 0) rotate(${
        rot * inv
      }deg) scale(${0.82 + 0.18 * Math.min(1, local)})`,
      willChange: "transform, opacity",
    };
  };

  return (
    <h1 className={`heading-1 ${className}`.trim()}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span style={wordStyle(i)}>{w}</span>
          {i < n - 1 ? " " : ""}
        </Fragment>
      ))}
    </h1>
  );
}
