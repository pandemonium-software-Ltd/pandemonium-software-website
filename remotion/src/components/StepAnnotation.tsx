import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";

type Props = {
  enterFrame: number;
  exitFrame?: number;
  x: number;
  y: number;
  label: string;
  description?: string;
  side?: "top" | "bottom" | "left" | "right";
};

export function StepAnnotation({
  enterFrame,
  exitFrame,
  x,
  y,
  label,
  description,
  side = "bottom",
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < enterFrame) return null;
  if (exitFrame !== undefined && frame > exitFrame) return null;

  const localFrame = frame - enterFrame;

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const opacity =
    exitFrame !== undefined
      ? interpolate(frame, [exitFrame - 8, exitFrame], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const offset = side === "top" ? -12 : side === "bottom" ? 12 : 0;
  const offsetX = side === "left" ? -12 : side === "right" ? 12 : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: x + offsetX,
        top: y + offset,
        transform: `scale(${scale}) translate(-50%, ${side === "top" ? "-100%" : "0"})`,
        transformOrigin: side === "top" ? "bottom center" : "top center",
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "#0f1d3c",
          color: "white",
          padding: "8px 16px",
          borderRadius: 10,
          fontSize: 18,
          fontFamily: "'DM Serif Display', Georgia, serif",
          fontWeight: 600,
          whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        {label}
      </div>
      {description && (
        <div
          style={{
            background: "rgba(255,255,255,0.95)",
            color: "#0f1d3c",
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            maxWidth: 280,
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
}
