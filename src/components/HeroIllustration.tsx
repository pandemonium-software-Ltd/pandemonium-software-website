export default function HeroIllustration({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 560 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Illustration of a friendly website on a laptop screen, with tools around it"
      className={className}
    >
      <defs>
        <linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4efe3" />
          <stop offset="1" stopColor="#faf7f0" />
        </linearGradient>
        <linearGradient id="heroCard" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#faf7f0" />
        </linearGradient>
      </defs>

      {/* Background card */}
      <rect x="0" y="40" width="560" height="400" rx="24" fill="url(#heroSky)" />

      {/* Laptop */}
      <g transform="translate(80 100)">
        <rect
          x="0"
          y="0"
          width="400"
          height="260"
          rx="14"
          fill="#0f1d30"
        />
        <rect
          x="10"
          y="10"
          width="380"
          height="240"
          rx="8"
          fill="url(#heroCard)"
        />

        {/* Header bar in screen */}
        <rect x="24" y="24" width="90" height="12" rx="4" fill="#0f1d30" />
        <circle cx="348" cy="30" r="6" fill="#f97316" />

        {/* Hero block */}
        <rect x="24" y="58" width="220" height="16" rx="4" fill="#0f1d30" />
        <rect x="24" y="82" width="180" height="10" rx="3" fill="#8ba5c6" />
        <rect x="24" y="98" width="140" height="10" rx="3" fill="#8ba5c6" />
        <rect x="24" y="126" width="110" height="28" rx="14" fill="#f97316" />

        {/* Image placeholder */}
        <rect x="264" y="58" width="112" height="96" rx="8" fill="#dae3ef" />
        <circle cx="294" cy="92" r="10" fill="#f97316" />
        <path
          d="M264 138 L296 110 L330 130 L376 100 L376 154 L264 154 Z"
          fill="#2c4d74"
        />

        {/* Cards row */}
        <rect x="24" y="172" width="108" height="60" rx="8" fill="#f4efe3" />
        <rect x="142" y="172" width="108" height="60" rx="8" fill="#f4efe3" />
        <rect x="260" y="172" width="108" height="60" rx="8" fill="#f4efe3" />

        <rect x="36" y="184" width="60" height="8" rx="2" fill="#2c4d74" />
        <rect x="36" y="200" width="40" height="6" rx="2" fill="#8ba5c6" />
        <rect x="36" y="212" width="50" height="6" rx="2" fill="#8ba5c6" />
        <rect x="154" y="184" width="60" height="8" rx="2" fill="#2c4d74" />
        <rect x="154" y="200" width="40" height="6" rx="2" fill="#8ba5c6" />
        <rect x="154" y="212" width="50" height="6" rx="2" fill="#8ba5c6" />
        <rect x="272" y="184" width="60" height="8" rx="2" fill="#2c4d74" />
        <rect x="272" y="200" width="40" height="6" rx="2" fill="#8ba5c6" />
        <rect x="272" y="212" width="50" height="6" rx="2" fill="#8ba5c6" />
      </g>

      {/* Laptop base */}
      <rect x="60" y="360" width="440" height="12" rx="6" fill="#172a42" />

      {/* Floating tool: spanner */}
      <g transform="translate(440 70) rotate(20)">
        <circle cx="0" cy="0" r="22" fill="#f97316" />
        <path
          d="M-6 -10 L6 -10 L10 -2 L6 6 L-6 6 L-10 -2 Z"
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>

      {/* Floating tool: heart badge */}
      <g transform="translate(70 60)">
        <circle cx="0" cy="0" r="20" fill="#fff" stroke="#0f1d30" strokeWidth="2" />
        <path
          d="M0 6 C -10 -4, -10 -14, 0 -6 C 10 -14, 10 -4, 0 6 Z"
          fill="#f97316"
        />
      </g>

      {/* Floating tool: tick */}
      <g transform="translate(500 340)">
        <circle cx="0" cy="0" r="20" fill="#2c4d74" />
        <path
          d="M-8 0 L-2 6 L8 -6"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
