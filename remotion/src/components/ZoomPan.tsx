import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { ReactNode } from "react";

export type ZoomKeyframe = {
  frame: number;
  x: number;
  y: number;
  scale: number;
};

type Props = {
  keyframes: ZoomKeyframe[];
  children: ReactNode;
};

export function ZoomPan({ keyframes, children }: Props) {
  const frame = useCurrentFrame();

  if (keyframes.length === 0) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  if (keyframes.length === 1) {
    const k = keyframes[0];
    return (
      <AbsoluteFill
        style={{
          transform: `scale(${k.scale}) translate(${-k.x}px, ${-k.y}px)`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  const frames = sorted.map((k) => k.frame);
  const xs = sorted.map((k) => k.x);
  const ys = sorted.map((k) => k.y);
  const scales = sorted.map((k) => k.scale);

  const x = interpolate(frame, frames, xs, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, frames, ys, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, frames, scales, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale}) translate(${-x}px, ${-y}px)`,
        transformOrigin: "0 0",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
