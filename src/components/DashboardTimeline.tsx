"use client";

// Vertical timeline navigation for /account/[token].
//
// Two surfaces, same content:
//   - Desktop: sticky rail on the left margin. Vertical line +
//     dots, on-brand navy/ember/cream palette, the active
//     section's dot fills in ember-500 and its label goes navy-900.
//   - Mobile: hidden rail; a small floating button bottom-right
//     opens a slide-up drawer with the same items.
//
// Behaviour (per product decisions):
//   - Click an item → smooth-scroll to that section's anchor.
//     Does NOT auto-expand the section if collapsed — the customer
//     scrolls to the header and decides whether to open it.
//   - "Active" highlighting tracks scroll via IntersectionObserver
//     — when a section is in the viewport (top 35% of screen) its
//     entry lights up.
//
// Sections are passed in by AccountDashboard so the rail's items
// always match what the page actually rendered (e.g. ChangeRequests
// only mounts for live customers, so it's only in the rail then).

import { useEffect, useState } from "react";

export type TimelineSection = {
  /** DOM id of the target element. Must match the id we render on
   *  the section's outer wrapper. */
  id: string;
  /** Label shown in the rail + the drawer. Keep short — single
   *  word or two-word noun like "Visitors", "Get in touch". */
  label: string;
};

type Props = {
  /** Sections to render. Caller is responsible for only including
   *  sections that actually mounted on the page — items pointing
   *  to non-existent ids won't break anything but the active state
   *  will never light up. */
  sections: TimelineSection[];
};

export default function DashboardTimeline({ sections }: Props) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Track which section is currently in view via IntersectionObserver.
  // rootMargin biases the "active" trigger zone to the upper portion
  // of the viewport, so as the customer scrolls down each section
  // lights up just before it becomes the dominant on-screen card.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the entry closest to the top of the viewport among
        // those currently intersecting. Avoids flicker when two
        // sections are both partially visible.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-15% 0px -55% 0px",
        threshold: 0,
      },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  // Smooth-scroll + expand handler. If the target is a <details>
  // element (the dashboard's collapsible cards all are), force it
  // open before scrolling so the customer lands inside the content,
  // not on a still-collapsed header. The section stays open after
  // this — the native <details> only closes again when the customer
  // clicks the chevron themselves. Closes the mobile drawer after
  // navigation.
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS") {
      (el as HTMLDetailsElement).open = true;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    setDrawerOpen(false);
  }

  return (
    <>
      {/* ---------- Desktop rail ----------
        * Sticky vertical timeline. The rail STRETCHES — each item
        * grows or shrinks based on proximity to the active section,
        * giving a soft fisheye effect:
        *   active item       → tall (py-5), label one-size-up
        *   immediate neighbour → medium (py-3)
        *   anything further  → compact (py-1.5)
        * The connecting line + dots inherit the spacing so the
        * whole rail breathes around the current section. Minimum
        * height of 70vh keeps the rail visually present even
        * with few sections. */}
      <nav
        aria-label="Dashboard sections"
        className="hidden lg:sticky lg:top-24 lg:block lg:w-48 lg:flex-none lg:self-start"
      >
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-navy-500">
          On this page
        </p>
        <ol className="relative flex min-h-[70vh] flex-col">
          {/* Vertical connecting line — sits behind the dots and
            * spans the full list height. Pulled in 6px so it
            * centres under the 12px dots. */}
          <span
            aria-hidden="true"
            className="absolute left-[5px] top-2 bottom-2 w-px bg-navy-200"
          />
          {sections.map((s, idx) => {
            const active = s.id === activeId;
            const activeIdx = sections.findIndex((x) => x.id === activeId);
            const distance =
              activeIdx >= 0 ? Math.abs(idx - activeIdx) : 99;
            // Fisheye sizing: active = tall, immediate neighbours
            // = medium, rest = roomy compact. Bumped a tier each
            // so every point has more breathing room around it
            // and the rail feels more like a deliberate timeline
            // than a tight nav list.
            const sizeClass =
              distance === 0
                ? "py-8"
                : distance === 1
                  ? "py-5"
                  : "py-3";
            return (
              <li
                key={s.id}
                className={[
                  "relative flex-none transition-[padding] duration-300 ease-out",
                  sizeClass,
                ].join(" ")}
              >
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollTo(s.id);
                  }}
                  className={[
                    "group flex items-center gap-3 transition-colors",
                    active
                      ? "text-base font-semibold text-navy-900"
                      : distance === 1
                        ? "text-sm text-navy-700 hover:text-navy-900"
                        : "text-[13px] text-navy-500 hover:text-navy-800",
                  ].join(" ")}
                  aria-current={active ? "true" : undefined}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "relative z-10 inline-block flex-none rounded-full border-2 transition-all duration-300",
                      active
                        ? "h-3.5 w-3.5 border-ember-500 bg-ember-500 shadow-[0_0_0_4px_rgba(252,165,90,0.22)]"
                        : distance === 1
                          ? "h-2.5 w-2.5 border-navy-400 bg-cream-50 group-hover:border-navy-600"
                          : "h-2 w-2 border-navy-300 bg-cream-50 group-hover:border-navy-500",
                    ].join(" ")}
                  />
                  <span className="truncate">{s.label}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ---------- Mobile FAB + drawer ---------- */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-3 text-sm font-semibold text-white shadow-lift hover:bg-navy-700 lg:hidden"
        aria-label="Jump to section"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 4h10M3 8h10M3 12h10"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        Jump to
      </button>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-navy-900/50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard sections"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-white p-5 pb-7 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <p className="font-serif text-base font-semibold text-navy-900">
                Jump to section
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-xs text-navy-500 underline hover:text-navy-900"
              >
                Close
              </button>
            </div>
            <ul className="space-y-1">
              {sections.map((s) => {
                const active = s.id === activeId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "bg-cream-100 font-semibold text-navy-900"
                          : "text-navy-700 hover:bg-cream-50",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "inline-block h-2.5 w-2.5 flex-none rounded-full border-2",
                          active
                            ? "border-ember-500 bg-ember-500"
                            : "border-navy-300 bg-cream-50",
                        ].join(" ")}
                      />
                      <span>{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
