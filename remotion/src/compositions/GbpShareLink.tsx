import {
  ScreenRecordingTutorial,
  type TutorialConfig,
} from "../components/ScreenRecordingTutorial";
import { staticFile } from "remotion";
import type { CursorTrackData } from "../components/AutoFollowZoom";

const FPS = 30;

let cursorTrack: CursorTrackData | undefined;
try {
  cursorTrack = require("../data/gbp-share-link.json") as CursorTrackData;
} catch {
  cursorTrack = undefined;
}

const config: TutorialConfig = {
  recording: staticFile("recordings/GBP_Link.mov"),
  title: "Getting your Google Business Profile link",
  subtitle: "So we can connect your reviews to your website",
  titleDuration: 75,
  ...(cursorTrack
    ? { cursorTrack, followZoom: 1.4 }
    : { zoom: [{ frame: 0, x: 0, y: 0, scale: 1 }] }),
  captions: [
    {
      enterFrame: 0,
      exitFrame: FPS * 3.5,
      text: "Search for your business name on Google Maps.",
    },
    {
      enterFrame: FPS * 4,
      exitFrame: FPS * 7,
      text: "Click on your business listing when it appears.",
    },
    {
      enterFrame: FPS * 7.5,
      exitFrame: FPS * 10,
      text: 'Click the "Share" button on your profile.',
    },
    {
      enterFrame: FPS * 10.5,
      exitFrame: FPS * 13.5,
      text: "Copy the link and paste it back into your Onboarding Hub.",
    },
  ],
};

export function GbpShareLink() {
  return <ScreenRecordingTutorial config={config} />;
}
