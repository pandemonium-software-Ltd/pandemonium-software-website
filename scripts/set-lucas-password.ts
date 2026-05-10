// One-off: generate a password for Lucas, hash it, persist to
// Notion, print the plain text so we can test the login flow.
//
// Lucas already exists at status "Onboarding Started" — he was
// accepted before the C5.7+ auth system shipped, so he has no
// password. This backfill closes the gap. After this, accessing
// /account/[token] /onboarding/[token] /intake/[token] will
// require the printed password.
//
// Run with: npx tsx --env-file=.dev.vars scripts/set-lucas-password.ts

import { getProspectByToken, setProspectPassword } from "../src/lib/notion-prospects";
import { generatePassword, hashPassword } from "../src/lib/auth/password";

const LUCAS_TOKEN = "4935d93e-a173-4c3d-bfb2-7950f2d0f9e9";

async function main() {
  console.log(`Fetching Lucas (${LUCAS_TOKEN.slice(0, 8)})...`);
  const lucas = await getProspectByToken(LUCAS_TOKEN);
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  console.log(`Found: pageId=${lucas.pageId}`);
  console.log(
    `Current passwordHash: ${lucas.passwordHash ? "(set)" : "(none)"}`,
  );

  const plain = generatePassword();
  const hash = await hashPassword(plain);
  await setProspectPassword(lucas.pageId, hash);

  console.log("");
  console.log("✓ Password set + persisted.");
  console.log("");
  console.log(`  Login URL: https://modu-forge.co.uk/login/${LUCAS_TOKEN}`);
  console.log(`  Password:  ${plain}`);
  console.log("");
  console.log(
    "Save this password somewhere — it's not stored in plain text on the server.",
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
