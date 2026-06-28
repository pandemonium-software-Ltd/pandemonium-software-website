import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  spring,
  useVideoConfig,
  staticFile,
} from "remotion";

type Props = {
  title: string;
  subtitle?: string;
  durationFrames: number;
};

const NAVY_900 = "#0f1d30";
const NAVY_950 = "#0a1422";
const EMBER_500 = "#f97316";
const CREAM_50 = "#fdfcf9";

export function TitleCard({ title, subtitle, durationFrames }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  const titleY = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const subtitleY = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const dividerWidth = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 12, stiffness: 140 },
  });

  const fadeOut = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${NAVY_950} 0%, ${NAVY_900} 40%, #172a42 100%)`,
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(ellipse at 30% 40%, rgba(249,115,22,0.06) 0%, transparent 60%)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          zIndex: 1,
        }}
      >
        <Img
          src={staticFile("brand/moduforge-logo-light.svg")}
          style={{
            height: 48,
            opacity: logoScale,
            transform: `scale(${interpolate(logoScale, [0, 1], [0.8, 1])})`,
          }}
        />

        <div
          style={{
            width: interpolate(dividerWidth, [0, 1], [0, 80]),
            height: 3,
            background: EMBER_500,
            borderRadius: 2,
          }}
        />

        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 54,
            color: CREAM_50,
            fontWeight: 700,
            textAlign: "center",
            maxWidth: "75%",
            lineHeight: 1.2,
            transform: `translateY(${interpolate(titleY, [0, 1], [30, 0])}px)`,
            opacity: titleY,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>

        {subtitle && (
          <p
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 22,
              color: EMBER_500,
              fontWeight: 500,
              textAlign: "center",
              maxWidth: "60%",
              lineHeight: 1.5,
              transform: `translateY(${interpolate(subtitleY, [0, 1], [20, 0])}px)`,
              opacity: subtitleY,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 40,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 14,
          color: "rgba(253,252,249,0.4)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: subtitleY,
        }}
      >
        ModuForge Tutorial
      </div>
    </AbsoluteFill>
  );
}
