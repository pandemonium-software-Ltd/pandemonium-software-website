import {
  ScreenRecordingTutorial,
  type TutorialConfig,
} from "../components/ScreenRecordingTutorial";
import { staticFile } from "remotion";
import type { CursorTrackData } from "../components/AutoFollowZoom";

const FPS = 30;

let cursorTrack: CursorTrackData | undefined;
try {
  cursorTrack = require("../data/cloudflare-signup.json") as CursorTrackData;
} catch {
  cursorTrack = undefined;
}

const config: TutorialConfig = {
  recording: staticFile("recordings/Cloudflare_Registrar.mov"),
  title: "Setting up your Cloudflare account",
  subtitle: "Free hosting that's yours from day one",
  titleDuration: 75,
  ...(cursorTrack
    ? { cursorTrack, followZoom: 1.4 }
    : { zoom: [{ frame: 0, x: 0, y: 0, scale: 1 }] }),
  captions: [
    {
      enterFrame: 0,
      exitFrame: FPS * 4,
      text: "Head to cloudflare.com/sign-up and create a free account.",
    },
    {
      enterFrame: FPS * 4.5,
      exitFrame: FPS * 9,
      text: "Check your inbox and verify your email address.",
    },
    {
      enterFrame: FPS * 9.5,
      exitFrame: FPS * 13,
      text: 'Click "Skip" on every setup screen until you reach the dashboard.',
    },
    {
      enterFrame: FPS * 13.5,
      exitFrame: FPS * 17,
      text: "Go to Manage Account → Members → Invite Members.",
    },
    {
      enterFrame: FPS * 17.5,
      exitFrame: FPS * 20.5,
      text: "Paste the email we gave you and choose the Administrator role.",
    },
    {
      enterFrame: FPS * 21,
      exitFrame: FPS * 24,
      text: 'Click "Invite Members" to send — then come back to your Hub.',
    },
  ],
};

export function CloudflareSignup() {
  return <ScreenRecordingTutorial config={config} />;
}
