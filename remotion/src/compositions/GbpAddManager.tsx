import {
  ScreenRecordingTutorial,
  type TutorialConfig,
} from "../components/ScreenRecordingTutorial";
import { staticFile } from "remotion";
import type { CursorTrackData } from "../components/AutoFollowZoom";

const FPS = 30;

let cursorTrack: CursorTrackData | undefined;
try {
  cursorTrack = require("../data/gbp-add-manager.json") as CursorTrackData;
} catch {
  cursorTrack = undefined;
}

const config: TutorialConfig = {
  recording: staticFile("recordings/GBP_Add_Member.mov"),
  title: "Adding a manager to your Google Business Profile",
  subtitle: "So we can respond to reviews on your behalf",
  titleDuration: 75,
  ...(cursorTrack
    ? { cursorTrack, followZoom: 1.4 }
    : { zoom: [{ frame: 0, x: 0, y: 0, scale: 1 }] }),
  captions: [
    {
      enterFrame: 0,
      exitFrame: FPS * 5,
      text: "Open your Google Business Profile dashboard.",
    },
    {
      enterFrame: FPS * 5.5,
      exitFrame: FPS * 10,
      text: 'Click "Business Profile settings" in the left sidebar.',
    },
    {
      enterFrame: FPS * 10.5,
      exitFrame: FPS * 15,
      text: 'Go to "Managers" and click "Add" to invite a new manager.',
    },
    {
      enterFrame: FPS * 15.5,
      exitFrame: FPS * 21,
      text: "Enter the email address we gave you and set the role to Manager.",
    },
    {
      enterFrame: FPS * 21.5,
      exitFrame: FPS * 26,
      text: 'Click "Invite" to send — we\'ll accept from our end.',
    },
    {
      enterFrame: FPS * 26.5,
      exitFrame: FPS * 31,
      text: "That's it! Head back to your Hub and mark this step done.",
    },
  ],
};

export function GbpAddManager() {
  return <ScreenRecordingTutorial config={config} />;
}
