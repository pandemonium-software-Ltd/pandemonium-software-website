import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const compositions = [
  "cloudflare-signup",
  "godaddy-nameservers",
  "gbp-share-link",
  "gbp-add-manager",
];

mkdirSync("out", { recursive: true });

for (const id of compositions) {
  console.log(`\n🎬 Rendering ${id}...`);
  execSync(
    `npx remotion render src/index.ts ${id} out/${id}.mp4 --codec h264`,
    { stdio: "inherit" }
  );
  console.log(`✅ ${id} → out/${id}.mp4`);
}

console.log("\n🎉 All renders complete.");
console.log("\nUpload to R2:");
console.log(
  'for f in out/*.mp4; do npx wrangler r2 object put moduforge-customer-assets/tutorials/$(basename "$f") --file "$f" --content-type video/mp4 --remote; done'
);
