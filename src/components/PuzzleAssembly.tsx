"use client";

// Scroll-driven jigsaw that assembles as the user scrolls down and
// dis-assembles on scroll up. Pieces are outlined in brand colours and
// float in from a radial scatter. No animation library — a throttled
// scroll listener maps the section's scroll position to a 0→1 progress
// and each piece interpolates from scattered → assembled.
//
// The jigsaw interlocks by construction: each piece has a tab on its
// right/bottom and a blank on its left/top, using one shared knob curve,
// so adjacent edges always coincide. Reduced-motion users get the
// completed puzzle, static.

import { useEffect, useRef, useState } from "react";

const COLS = 3;
const ROWS = 3;
const S = 120; // piece edge length (SVG units)
const PAD = 30; // border padding around the puzzle
const SCATTER = 200; // how far pieces fly out when un-assembled
const PUZZLE = 2 * PAD + COLS * S; // 420
const CENTER = PAD + (ROWS * S) / 2; // 210

const NAVY = "#0f1d30";
const EMBER = "#f97316";

// One edge of a piece, drawn relative, going along unit vector (ux,uy).
// k: 0 flat · +1 tab · −1 blank. Tab/blank share geometry so neighbours
// interlock; the sweep flag flips with k so a tab and the matching blank
// (drawn in opposite directions) trace the same world curve.
function edge(k: number, ux: number, uy: number): string {
  if (k === 0) return `l ${ux * S} ${uy * S}`;
  const lead = S * 0.4;
  const mid = S * 0.2;
  const r = S * 0.13;
  const sweep = k > 0 ? 1 : 0;
  return (
    `l ${ux * lead} ${uy * lead} ` +
    `a ${r} ${r} 0 1 ${sweep} ${ux * mid} ${uy * mid} ` +
    `l ${ux * lead} ${uy * lead}`
  );
}

function piecePath(r: number, c: number): string {
  const x0 = PAD + c * S;
  const y0 = PAD + r * S;
  const top = r === 0 ? 0 : -1;
  const right = c === COLS - 1 ? 0 : 1;
  const bottom = r === ROWS - 1 ? 0 : 1;
  const left = c === 0 ? 0 : -1;
  return [
    `M ${x0} ${y0}`,
    edge(top, 1, 0),
    edge(right, 0, 1),
    edge(bottom, -1, 0),
    edge(left, 0, -1),
    "Z",
  ].join(" ");
}

type Piece = {
  d: string;
  cx: number;
  cy: number;
  dx: number; // scatter direction x
  dy: number; // scatter direction y
  rot: number; // scatter rotation (deg)
  start: number; // stagger window start in [0,1]
  color: string;
};

const PIECES: Piece[] = (() => {
  const out: Piece[] = [];
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = PAD + c * S + S / 2;
      const cy = PAD + r * S + S / 2;
      let vx = cx - CENTER;
      let vy = cy - CENTER;
      const len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;
      out.push({
        d: piecePath(r, c),
        cx,
        cy,
        dx: vx * SCATTER,
        dy: vy * SCATTER,
        rot: (i % 2 === 0 ? 1 : -1) * (18 + (i % 3) * 8),
        start: (i / (ROWS * COLS)) * 0.55,
        color: i % 4 === 0 ? EMBER : NAVY,
      });
      i++;
    }
  }
  return out;
})();

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default function PuzzleAssembly() {
  const outerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      setProgress(1);
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const el = outerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the section's top hits the viewport top, 1 when its
      // bottom is one viewport-height above — i.e. progress through the
      // tall section while the inner sticky panel is pinned.
      const total = rect.height - vh;
      const scrolled = -rect.top;
      setProgress(clamp01(total > 0 ? scrolled / total : 0));
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

  // Headline fades/rises in as the puzzle nears completion.
  const headT = easeOut(clamp01((progress - 0.45) / 0.4));

  return (
    <section
      ref={outerRef}
      aria-label="How ModuForge fits together"
      className="relative bg-cream-50"
      style={{ height: reduced ? "auto" : "240vh" }}
    >
      <div
        className={
          reduced
            ? "flex flex-col items-center px-6 py-20"
            : "sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-6"
        }
      >
        <svg
          viewBox={`${-SCATTER} ${-SCATTER} ${PUZZLE + 2 * SCATTER} ${PUZZLE + 2 * SCATTER}`}
          className="h-auto w-full max-w-[560px]"
          role="img"
          aria-label="Puzzle pieces assembling into a complete picture"
        >
          {PIECES.map((p, idx) => {
            const local = reduced
              ? 1
              : easeOut(clamp01((progress - p.start) / 0.45));
            const tx = p.dx * (1 - local);
            const ty = p.dy * (1 - local);
            const rot = p.rot * (1 - local);
            const sc = 0.84 + 0.16 * local;
            return (
              <path
                key={idx}
                d={p.d}
                fill="#ffffff"
                fillOpacity={0.35 + 0.65 * local}
                stroke={p.color}
                strokeWidth={4}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.15 + 0.85 * local}
                transform={
                  `translate(${tx} ${ty}) ` +
                  `rotate(${rot} ${p.cx} ${p.cy}) ` +
                  `translate(${p.cx} ${p.cy}) scale(${sc}) translate(${-p.cx} ${-p.cy})`
                }
                style={{ transition: reduced ? undefined : "none" }}
              />
            );
          })}
        </svg>

        <div
          className="mt-8 max-w-xl text-center"
          style={{
            opacity: headT,
            transform: `translateY(${(1 - headT) * 16}px)`,
          }}
        >
          <h2 className="font-serif text-2xl font-semibold text-navy-900 md:text-3xl">
            Every piece, in its place.
          </h2>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-navy-700">
            Site, hosting, bookings, enquiries, reviews — modular pieces that
            click together into one complete web presence. You pick the pieces;
            we assemble the picture.
          </p>
        </div>
      </div>
    </section>
  );
}
