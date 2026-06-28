"use client";

// Ambient hero background: soft brand-coloured blobs that drift slowly
// behind the headline. Pure CSS, decorative (aria-hidden), pointer-events
// off. Reduced-motion → static blobs. Must sit inside an
// `overflow-hidden` + `relative` parent; render it as the first child and
// keep content above it.

export default function AuroraBackground({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}>
      <style>{`
        @keyframes mf-aurora-a {
          0%,100% { transform: translate(-8%, -6%) scale(1); }
          50%     { transform: translate(10%, 8%) scale(1.15); }
        }
        @keyframes mf-aurora-b {
          0%,100% { transform: translate(6%, 4%) scale(1.1); }
          50%     { transform: translate(-10%, -8%) scale(1); }
        }
        @keyframes mf-aurora-c {
          0%,100% { transform: translate(0%, 6%) scale(1); }
          50%     { transform: translate(-6%, -6%) scale(1.2); }
        }
        .mf-aurora {
          position: absolute; border-radius: 9999px;
          filter: blur(48px); opacity: .38;
          /* scale with viewport so blobs never overwhelm small screens */
          height: clamp(12rem, 45vw, 30rem);
          width: clamp(12rem, 45vw, 30rem);
        }
        @media (min-width: 768px) { .mf-aurora { filter: blur(70px); opacity: .5; } }
        .mf-a { animation: mf-aurora-a 18s ease-in-out infinite; }
        .mf-b2 { animation: mf-aurora-b 22s ease-in-out infinite; }
        .mf-c { animation: mf-aurora-c 26s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .mf-a, .mf-b2, .mf-c { animation: none; }
        }
      `}</style>
      {/* ember */}
      <div className="mf-aurora mf-a" style={{ top: "-4rem", left: "-3rem", background: "radial-gradient(circle at center, rgba(249,115,22,0.30), transparent 70%)" }} />
      {/* navy */}
      <div className="mf-aurora mf-b2" style={{ top: "2rem", right: "-4rem", background: "radial-gradient(circle at center, rgba(15,29,48,0.18), transparent 70%)" }} />
      {/* warm cream highlight */}
      <div className="mf-aurora mf-c" style={{ bottom: "-5rem", left: "35%", background: "radial-gradient(circle at center, rgba(244,159,82,0.22), transparent 70%)" }} />
    </div>
  );
}
