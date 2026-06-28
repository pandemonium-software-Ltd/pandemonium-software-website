import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { useMemo } from "react";
import type { ReactNode } from "react";

export type CursorPosition = {
  frame: number;
  x: number;
  y: number;
};

export type CursorTrackData = {
  sourceWidth: number;
  sourceHeight: number;
  fps: number;
  totalFrames: number;
  positions: CursorPosition[];
};

type Props = {
  trackData: CursorTrackData;
  zoomLevel?: number;
  children: ReactNode;
};

function subsample(positions: CursorPosition[], interval: number): CursorPosition[] {
  if (positions.length === 0) return [];
  const result: CursorPosition[] = [positions[0]];
  for (let i = interval; i < positions.length; i += interval) {
    result.push(positions[i]);
  }
  if (result[result.length - 1].frame !== positions[positions.length - 1].frame) {
    result.push(positions[positions.length - 1]);
  }
  return result;
}

export function AutoFollowZoom({
  trackData,
  zoomLevel = 1.4,
  children,
}: Props) {
  const frame = useCurrentFrame();
  const { width: outputW, height: outputH } = useVideoConfig();

  const { positions, sourceWidth, sourceHeight } = trackData;

  const keyframes = useMemo(
    () => subsample(positions, 6),
    [positions],
  );

  if (keyframes.length < 2) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const frames = keyframes.map((p) => p.frame);
  const xs = keyframes.map((p) => p.x);
  const ys = keyframes.map((p) => p.y);

  const cursorX = interpolate(frame, frames, xs, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const cursorY = interpolate(frame, frames, ys, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

  const normalizedX = cursorX / sourceWidth;
  const normalizedY = cursorY / sourceHeight;

  const translateX = normalizedX * outputW - outputW / 2;
  const translateY = normalizedY * outputH - outputH / 2;

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${zoomLevel}) translate(${-translateX}px, ${-translateY}px)`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
