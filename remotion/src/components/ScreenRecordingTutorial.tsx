import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useVideoConfig,
} from "remotion";
import { ZoomPan, type ZoomKeyframe } from "./ZoomPan";
import { AutoFollowZoom, type CursorTrackData } from "./AutoFollowZoom";
import { CursorSpotlight, type CursorKeyframe } from "./CursorSpotlight";
import { StepAnnotation } from "./StepAnnotation";
import { Highlight } from "./Highlight";
import { TitleCard } from "./TitleCard";
import { Caption, type CaptionDef } from "./Caption";

export type AnnotationDef = {
  enterFrame: number;
  exitFrame?: number;
  x: number;
  y: number;
  label: string;
  description?: string;
  side?: "top" | "bottom" | "left" | "right";
};

export type HighlightDef = {
  enterFrame: number;
  exitFrame?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
};

export type TutorialConfig = {
  recording: string;
  title: string;
  subtitle?: string;
  titleDuration?: number;
  /** Manual zoom keyframes — ignored when cursorTrack is set. */
  zoom?: ZoomKeyframe[];
  /** Auto-follow: supply cursor tracking data and the camera follows. */
  cursorTrack?: CursorTrackData;
  /** Zoom level for auto-follow mode (default 1.8). */
  followZoom?: number;
  cursor?: CursorKeyframe[];
  annotations?: AnnotationDef[];
  highlights?: HighlightDef[];
  captions?: CaptionDef[];
};

type Props = {
  config: TutorialConfig;
};

export function ScreenRecordingTutorial({ config }: Props) {
  const { fps } = useVideoConfig();
  const titleDuration = config.titleDuration ?? Math.round(fps * 2.5);

  const videoContent = (
    <>
      <OffthreadVideo
        src={config.recording}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      {config.highlights?.map((h, i) => (
        <Highlight key={i} {...h} />
      ))}
    </>
  );

  return (
    <AbsoluteFill style={{ background: "#0f1d3c" }}>
      <Sequence durationInFrames={titleDuration}>
        <TitleCard
          title={config.title}
          subtitle={config.subtitle}
          durationFrames={titleDuration}
        />
      </Sequence>

      <Sequence from={titleDuration}>
        <AbsoluteFill>
          {config.cursorTrack ? (
            <AutoFollowZoom
              trackData={config.cursorTrack}
              zoomLevel={config.followZoom ?? 1.4}
            >
              {videoContent}
            </AutoFollowZoom>
          ) : (
            <ZoomPan keyframes={config.zoom ?? [{ frame: 0, x: 0, y: 0, scale: 1 }]}>
              {videoContent}
            </ZoomPan>
          )}

          {config.cursor && <CursorSpotlight keyframes={config.cursor} />}

          {config.annotations?.map((a, i) => (
            <StepAnnotation key={i} {...a} />
          ))}

          {config.captions?.map((c, i) => (
            <Caption key={i} {...c} />
          ))}
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}
