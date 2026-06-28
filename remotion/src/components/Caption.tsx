import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";

export type CaptionDef = {
  enterFrame: number;
  exitFrame: number;
  text: string;
  position?: "top" | "bottom";
};

type Props = CaptionDef;

const NAVY_900 = "#0f1d30";
const CREAM_50 = "#fdfcf9";
const EMBER_500 = "#f97316";

export function Caption({
  enterFrame,
  exitFrame,
  text,
  position = "bottom",
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < enterFrame || frame > exitFrame) return null;

  const localFrame = frame - enterFrame;

  const slideIn = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 160 },
  });

  const fadeOut = interpolate(
    frame,
    [exitFrame - 10, exitFrame],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const yOffset = position === "bottom" ? 40 : 40;
  const positionStyle =
    position === "bottom"
      ? { bottom: yOffset }
      : { top: yOffset };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        ...positionStyle,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 200,
      }}
    >
      <div
        style={{
          background: `${NAVY_900}ee`,
          backdropFilter: "blur(8px)",
          borderRadius: 14,
          padding: "14px 28px",
          maxWidth: "80%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          transform: `translateY(${interpolate(slideIn, [0, 1], [20, 0])}px)`,
          opacity: fadeOut * slideIn,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          borderLeft: `3px solid ${EMBER_500}`,
        }}
      >
        <span
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 20,
            color: CREAM_50,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
