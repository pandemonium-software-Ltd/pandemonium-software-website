import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";

type Props = {
  enterFrame: number;
  exitFrame?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  borderRadius?: number;
  pulse?: boolean;
};

export function Highlight({
  enterFrame,
  exitFrame,
  x,
  y,
  width,
  height,
  color = "#e85d2a",
  borderRadius = 8,
  pulse = true,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < enterFrame) return null;
  if (exitFrame !== undefined && frame > exitFrame) return null;

  const localFrame = frame - enterFrame;

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 180 },
  });

  const opacity =
    exitFrame !== undefined
      ? interpolate(frame, [exitFrame - 8, exitFrame], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const pulseOpacity = pulse
    ? interpolate(Math.sin(localFrame * 0.15), [-1, 1], [0.4, 0.7])
    : 0.5;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        borderRadius,
        border: `3px solid ${color}`,
        background: `${color}${Math.round(pulseOpacity * 40)
          .toString(16)
          .padStart(2, "0")}`,
        transform: `scale(${scale})`,
        transformOrigin: "center",
        opacity,
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
}
