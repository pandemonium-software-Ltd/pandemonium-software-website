import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export type CursorKeyframe = {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
};

type Props = {
  keyframes: CursorKeyframe[];
  color?: string;
  size?: number;
};

export function CursorSpotlight({
  keyframes,
  color = "#0f1d3c",
  size = 24,
}: Props) {
  const frame = useCurrentFrame();

  if (keyframes.length < 2) return null;

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  const frames = sorted.map((k) => k.frame);
  const xs = sorted.map((k) => k.x);
  const ys = sorted.map((k) => k.y);

  if (frame < frames[0] || frame > frames[frames.length - 1]) return null;

  const x = interpolate(frame, frames, xs, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, frames, ys, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const currentKf = sorted.findLast((k) => k.frame <= frame);
  const isClicking = currentKf?.click && frame - currentKf.frame < 8;

  const clickScale = isClicking
    ? interpolate(frame - currentKf!.frame, [0, 4, 8], [1, 0.8, 1], {
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        style={{
          position: "absolute",
          left: x - size / 2,
          top: y - size / 2,
          width: size * 2,
          height: size * 2,
          transform: `scale(${clickScale})`,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
        }}
        viewBox="0 0 24 24"
      >
        <path
          d="M5 3l14 9-7 2-4 7z"
          fill="white"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
      {isClicking && (
        <div
          style={{
            position: "absolute",
            left: x - 20,
            top: y - 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: `3px solid ${color}`,
            opacity: interpolate(
              frame - currentKf!.frame,
              [0, 8],
              [0.6, 0],
              { extrapolateRight: "clamp" }
            ),
            transform: `scale(${interpolate(
              frame - currentKf!.frame,
              [0, 8],
              [0.5, 1.5],
              { extrapolateRight: "clamp" }
            )})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
}
