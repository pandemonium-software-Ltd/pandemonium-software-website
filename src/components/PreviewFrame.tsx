"use client";

// Reusable preview-iframe component used by:
//   - Hub Step 5/6 Review (pre-commit preview during onboarding)
//   - /account/[token]/preview/[crId] (post-commit change-request
//     preview wrapper)
//
// Behaviour:
//   - Renders an iframe with the given src
//   - "Full screen" button uses the Fullscreen API to expand the
//     iframe (or its container) to fill the screen
//   - Right-click suppressed on the iframe element (defence in
//     depth alongside the customer-site layout's own injection)
//   - The iframe src is NOT rendered as text anywhere — only inside
//     the iframe element itself, so the workers.dev URL doesn't
//     leak via casual inspection / copy
//
// Note: a determined viewer with DevTools can still inspect the
// iframe src. Removing that requires a server-side proxy (logged
// as future C5.7 hardening).

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Full URL to embed (already includes ?pa=<token> if needed). */
  src: string;
  /** Min height when not full-screen. CSS units. Defaults to 600px. */
  height?: string;
  /** Optional caption shown above the frame. e.g. "Site preview" */
  caption?: string;
};

export default function PreviewFrame({
  src,
  height = "600px",
  caption,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Browser refused (some block fullscreen unless gesture-
      // initiated; we are gesture-initiated so this is rare).
    }
  }

  return (
    <div
      ref={containerRef}
      className={[
        "relative overflow-hidden rounded-xl border-2 border-navy-100 bg-cream-50",
        // When fullscreen, the container itself fills the screen
        // and we override the height. The iframe inside picks up
        // 100% to fill.
        isFullscreen ? "fixed inset-0 z-[9999] rounded-none border-0" : "",
      ].join(" ")}
      style={isFullscreen ? undefined : { height }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {caption && !isFullscreen && (
        <div className="absolute left-3 top-3 z-10 rounded-full bg-navy-900/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
          {caption}
        </div>
      )}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-navy-900/85 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-all hover:bg-navy-900"
        aria-label={isFullscreen ? "Exit full screen" : "Open in full screen"}
      >
        {isFullscreen ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 3H5v4M15 3h4v4M9 21H5v-4M15 21h4v-4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            Exit full screen
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            Full screen
          </>
        )}
      </button>
      <iframe
        src={src}
        title="Site preview"
        // Sandbox is intentionally OMITTED — the customer needs full
        // interactivity inside their own site. The trust boundary is
        // the auth-gated parent + frame-ancestors on the child.
        className="block h-full w-full border-0 bg-white"
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
