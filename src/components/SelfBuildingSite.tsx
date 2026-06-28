"use client";

// Hero animation: a browser frame whose UI blocks assemble themselves on
// load — nav, hero, feature grid, reviews strip, footer click into place
// in sequence, then the whole frame breathes gently. Pure CSS keyframes
// (autoplay on mount, no scroll, no deps). Reduced-motion → final state,
// static. Mirrors what ModuForge does: builds the customer's site for them.

const NAVY = "#0f1d30";
const EMBER = "#f97316";

export default function SelfBuildingSite({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={className}>
      <style>{`
        @keyframes mf-build {
          0%   { opacity: 0; transform: translateY(16px) scale(.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mf-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-8px); }
        }
        .mf-frame { animation: mf-float 7s ease-in-out 2s infinite; }
        .mf-b { opacity: 0; animation: mf-build .6s cubic-bezier(.22,.9,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .mf-frame { animation: none; }
          .mf-b { opacity: 1; animation: none; }
        }
      `}</style>

      <div
        className="mf-frame mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card"
        role="img"
        aria-label="A website building itself piece by piece"
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-navy-100 bg-cream-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: EMBER }} />
          <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
          <span className="mf-b ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-navy-400" style={{ animationDelay: "0.05s" }}>
            yourbusiness.co.uk
          </span>
        </div>

        {/* Page body */}
        <div className="space-y-3 p-4 md:p-5">
          {/* Nav */}
          <div className="mf-b flex items-center justify-between" style={{ animationDelay: "0.15s" }}>
            <div className="h-4 w-24 rounded" style={{ background: NAVY }} />
            <div className="flex gap-2">
              <div className="h-3 w-10 rounded bg-navy-200" />
              <div className="h-3 w-10 rounded bg-navy-200" />
              <div className="h-3 w-12 rounded" style={{ background: EMBER }} />
            </div>
          </div>

          {/* Hero block */}
          <div className="mf-b rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 p-4" style={{ animationDelay: "0.32s" }}>
            <div className="h-5 w-3/4 rounded" style={{ background: NAVY }} />
            <div className="mt-2 h-3 w-full rounded bg-navy-100" />
            <div className="mt-1.5 h-3 w-5/6 rounded bg-navy-100" />
            <div className="mt-3 h-7 w-28 rounded-lg" style={{ background: EMBER }} />
          </div>

          {/* Feature / gallery grid */}
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="mf-b rounded-lg border border-navy-100 bg-cream-50 p-2.5"
                style={{ animationDelay: `${0.5 + i * 0.1}s` }}
              >
                <div className="h-8 w-full rounded bg-navy-100" />
                <div className="mt-2 h-2 w-3/4 rounded bg-navy-200" />
                <div className="mt-1 h-2 w-1/2 rounded bg-navy-100" />
              </div>
            ))}
          </div>

          {/* Reviews / booking strip */}
          <div className="mf-b flex items-center justify-between rounded-lg border border-navy-100 bg-white p-3" style={{ animationDelay: "0.9s" }}>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} color={EMBER} />
              ))}
              <span className="ml-1.5 h-2.5 w-14 rounded bg-navy-200" />
            </div>
            <div className="h-6 w-20 rounded-md" style={{ background: NAVY }} />
          </div>

          {/* Footer */}
          <div className="mf-b flex justify-between pt-1" style={{ animationDelay: "1.05s" }}>
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
