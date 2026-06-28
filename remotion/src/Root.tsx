import { Composition } from "remotion";
import { CloudflareSignup } from "./compositions/CloudflareSignup";
import { GodaddyNameservers } from "./compositions/GodaddyNameservers";
import { GbpShareLink } from "./compositions/GbpShareLink";
import { GbpAddManager } from "./compositions/GbpAddManager";

const FPS = 30;

const tutorials = [
  {
    id: "cloudflare-signup",
    component: CloudflareSignup,
    durationSec: 25,
  },
  {
    id: "godaddy-nameservers",
    component: GodaddyNameservers,
    durationSec: 22,
  },
  {
    id: "gbp-share-link",
    component: GbpShareLink,
    durationSec: 15,
  },
  {
    id: "gbp-add-manager",
    component: GbpAddManager,
    durationSec: 33,
  },
] as const;

export function RemotionRoot() {
  return (
    <>
      {tutorials.map((t) => (
        <Composition
          key={t.id}
          id={t.id}
          component={t.component}
          width={1920}
          height={1080}
          fps={FPS}
          durationInFrames={Math.ceil(t.durationSec * FPS) + 75}
        />
      ))}
    </>
  );
}
