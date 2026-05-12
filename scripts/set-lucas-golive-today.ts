// One-off: set Lucas's Go Live Date to TODAY (UK calendar) so the
// step7-go-live cron picks him up on the next tick (≤5 min) and
// dispatches the launch-day build.
//
// Run with: npx tsx --env-file=.dev.vars scripts/set-lucas-golive-today.ts

import { updateProspectOnboarding } from "../src/lib/notion-prospects";
import { getProspectByToken } from "../src/lib/notion-prospects";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  // Today in Europe/London — matches the step7 isLaunchDayReached
  // comparison exactly so we don't end up off-by-one if the cron
  // ticks just after midnight UTC.
  const todayLondon = new Date().toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [d, m, y] = todayLondon.split("/");
  const today = `${y}-${m}-${d}`;

  console.log(`Was: goLiveDate=${lucas.goLiveDate ?? "(none)"}`);
  console.log(`Now: goLiveDate=${today}`);

  await updateProspectOnboarding(lucas.pageId, { goLiveDate: today });
  console.log(
    "\n✓ Done. step7-go-live will fire on the next cron tick (within 5 min)\n" +
      "  → dispatches customer-site-build mode=live finalLaunch=true\n" +
      "  → build callback flips status to 'Live' + emails 'You're live 🎉'",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
