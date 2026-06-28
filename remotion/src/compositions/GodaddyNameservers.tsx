import {
  ScreenRecordingTutorial,
  type TutorialConfig,
} from "../components/ScreenRecordingTutorial";
import { staticFile } from "remotion";
import type { CursorTrackData } from "../components/AutoFollowZoom";

const FPS = 30;

let cursorTrack: CursorTrackData | undefined;
try {
  cursorTrack = require("../data/godaddy-nameservers.json") as CursorTrackData;
} catch {
  cursorTrack = undefined;
}

const config: TutorialConfig = {
  recording: staticFile("recordings/Godaddy.mov"),
  title: "Changing nameservers on GoDaddy",
  subtitle: "Point your domain to Cloudflare in under a minute",
  titleDuration: 75,
  ...(cursorTrack
    ? { cursorTrack, followZoom: 1.4 }
    : { zoom: [{ frame: 0, x: 0, y: 0, scale: 1 }] }),
  captions: [
    {
      enterFrame: 0,
      exitFrame: FPS * 4,
      text: "Log in to your GoDaddy account and go to My Products.",
    },
    {
      enterFrame: FPS * 4.5,
      exitFrame: FPS * 8,
      text: "Find your domain and click DNS or Manage DNS.",
    },
    {
      enterFrame: FPS * 8.5,
      exitFrame: FPS * 12,
      text: 'Scroll down to Nameservers and click "Change".',
    },
    {
      enterFrame: FPS * 12.5,
      exitFrame: FPS * 16,
      text: 'Choose "Enter my own nameservers (advanced)".',
    },
    {
      enterFrame: FPS * 16.5,
      exitFrame: FPS * 20,
      text: "Paste the two Cloudflare nameservers we provided and save.",
    },
  ],
};

export function GodaddyNameservers() {
  return <ScreenRecordingTutorial config={config} />;
}
