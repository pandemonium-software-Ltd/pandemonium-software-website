"use client";

// HeroForge (Phase M) — the homepage centrepiece. Combines the "live
// forge" (modules snap into a site frame) with the abstract constellation
// (they start as faint tiles drifting in the aurora), a glow pulse on
// completion, and a gentle breathe once settled. Each module is a
// labelled tile with a meaningful icon so the modular nature reads at a
// glance — no copy needed.
//
// Looping timeline (per ~10s cycle): scattered drift → converge + snap
// (staggered, overshoot) → ember glow → breathe (hold) → disperse → loop.
//
// Driven imperatively in a single rAF loop (writes styles on refs, no
// per-frame React re-render) so it stays smooth. Reduced-motion → a
// static, fully-assembled frame with a soft glow and no motion.

import { useEffect, useRef } from "react";
import {
  CalendarIcon,
  StarsIcon,
  MailIcon,
  TagIcon,
  PlaneIcon,
  ImageIcon,
} from "@/components/module-icons";

const NAVY = "#0f1d30";
const EMBER = "#f97316";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeIn = (x: number) => x * x;
// easeOutBack — slight overshoot for the tactile "snap into place".
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

type Tone = "navy" | "ember";
type Mod = { id: string; label: string; sub: string; tone: Tone; icon: React.ReactNode };

const MODULES: Mod[] = [
  { id: "booking", label: "Booking", sub: "Take bookings", tone: "navy", icon: <CalendarIcon /> },
  { id: "reviews", label: "Reviews", sub: "Google stars", tone: "ember", icon: <StarsIcon /> },
  { id: "enquiry", label: "Enquiry", sub: "Leads to inbox", tone: "navy", icon: <MailIcon /> },
  { id: "offers", label: "Offers", sub: "Promote a deal", tone: "ember", icon: <TagIcon /> },
  { id: "newsletter", label: "Newsletter", sub: "Stay in touch", tone: "navy", icon: <PlaneIcon /> },
  { id: "gallery", label: "Gallery", sub: "Show your work", tone: "ember", icon: <ImageIcon /> },
];

export default function HeroForge({ className = "" }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const n = MODULES.length;

    // Radial scatter direction per tile (constellation spread) + a lean.
    const dirs = MODULES.map((_, i) => {
      const a = (i / n) * Math.PI * 2 + 0.5;
      return { ux: Math.cos(a), uy: Math.sin(a) * 0.8, rot: (i % 2 ? 1 : -1) * (9 + ((i * 7) % 12)) };
    });

    // Scatter radius scales with the stage so tiles drift nicely on any width.
    let radius = 220;
    const measure = () => {
      const w = stageRef.current?.offsetWidth ?? 600;
      radius = Math.max(110, Math.min(300, w * 0.46));
    };
    measure();

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      if (frameRef.current) frameRef.current.style.transform = "scale(1)";
      if (glowRef.current) glowRef.current.style.opacity = "0.35";
      if (heroRef.current) heroRef.current.style.opacity = "1";
      chipRefs.current.forEach((el) => {
        if (!el) return;
        el.style.transform = "translate3d(0,0,0) scale(1)";
        el.style.opacity = "1";
      });
      return;
    }

    const CYCLE = 10000;
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = now - start;
      const cycle = (t % CYCLE) / CYCLE;

      // How "seated" the whole composition is — gates breathe + glow.
      const seated =
        clamp01((cycle - 0.12) / 0.33) * (1 - clamp01((cycle - 0.8) / 0.15));
      // Glow pulse peaks just as assembly completes.
      const glow = Math.max(0, 1 - Math.abs(cycle - 0.5) / 0.12);
      const breathe = 1 + 0.014 * Math.sin(t / 760) * seated;

      if (frameRef.current) frameRef.current.style.transform = `scale(${breathe})`;
      if (glowRef.current) glowRef.current.style.opacity = String(0.15 + glow * 0.7);
      if (heroRef.current) {
        const a =
          clamp01((cycle - 0.1) / 0.14) * (1 - clamp01((cycle - 0.84) / 0.12));
        heroRef.current.style.opacity = String(a);
        heroRef.current.style.transform = `translateY(${(1 - a) * 12}px)`;
      }

      for (let i = 0; i < n; i++) {
        const el = chipRefs.current[i];
        if (!el) continue;
        const st = i / n;
        const ai = easeOutBack(clamp01((cycle - (0.12 + st * 0.1)) / 0.18));
        const ao = easeIn(clamp01((cycle - (0.8 + st * 0.05)) / 0.13));
        const a = ai * (1 - ao); // unclamped → keeps the overshoot bounce
        const inv = 1 - a;
        const driftX = Math.sin(t / 900 + i * 1.7) * 7;
        const driftY = Math.cos(t / 1100 + i * 1.3) * 7;
        const tx = dirs[i].ux * radius * inv + driftX * (0.35 + inv * 0.9);
        const ty = dirs[i].uy * radius * inv + driftY * (0.35 + inv * 0.9);
        const rot = dirs[i].rot * inv + Math.sin(t / 1000 + i) * 1.5 * seated;
        const sc = 0.66 + 0.34 * Math.min(1, a) + 0.02 * Math.sin(t / 760) * seated;
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg) scale(${sc})`;
        el.style.opacity = String(clamp01(0.3 + 0.95 * a));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className={`relative mx-auto w-full max-w-[640px] ${className}`.trim()}
      role="img"
      aria-label="A website assembling itself from modular feature blocks — booking, reviews, enquiries, offers, newsletter and a gallery"
    >
      {/* Completion glow — ember halo behind the frame. */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute -inset-5 rounded-[2.5rem] bg-ember-500/40 blur-3xl"
        style={{ opacity: 0 }}
      />

      {/* The site canvas (breathes once assembled). */}
      <div
        ref={frameRef}
        className="relative overflow-visible rounded-2xl border border-navy-100 bg-white/95 shadow-card backdrop-blur"
        style={{ transformOrigin: "center" }}
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 rounded-t-2xl border-b border-navy-100 bg-cream-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: EMBER }} />
          <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
          <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-navy-400">
            yourbusiness.co.uk
          </span>
        </div>

        <div className="p-4 md:p-5">
          {/* Hero strip — the always-present top of the site. */}
          <div ref={heroRef} style={{ opacity: 0 }}>
            <div className="rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 p-4">
              <div className="h-4 w-2/3 rounded" style={{ background: NAVY }} />
              <div className="mt-2 h-2.5 w-full rounded bg-navy-100" />
              <div className="mt-1.5 h-2.5 w-4/5 rounded bg-navy-100" />
              <div className="mt-3 h-6 w-24 rounded-lg" style={{ background: EMBER }} />
            </div>
          </div>

          {/* Module tiles — fly in from the constellation and snap in. */}
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {MODULES.map((m, i) => (
              <div
                key={m.id}
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                style={{ opacity: 0, willChange: "transform, opacity" }}
                className="flex flex-col items-start gap-1.5 rounded-xl border border-navy-100 bg-white p-2.5 shadow-sm"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    background: m.tone === "ember" ? "rgba(249,115,22,0.12)" : "rgba(15,29,48,0.08)",
                    color: m.tone === "ember" ? EMBER : NAVY,
                  }}
                >
                  {m.icon}
                </span>
                <span className="text-[12px] font-semibold leading-none text-navy-900">
                  {m.label}
                </span>
                <span className="hidden text-[10px] leading-none text-navy-500 sm:block">
                  {m.sub}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
