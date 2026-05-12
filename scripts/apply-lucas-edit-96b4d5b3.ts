// One-off: apply the multi-field patch from Lucas's edit 96b4d5b3
// to Notion. Cowork escalated this without applying because of the
// multi-field rule, so the live deploy reflected unchanged data.
// This script makes the change manually so the next live build
// picks it up.
//
// Edit 96b4d5b3 message: 'Change phone number to "07824369011" and
// email to testemail@hotmail.co.uk'
//
// Run with: npx tsx --env-file=.dev.vars scripts/apply-lucas-edit-96b4d5b3.ts

import {
  getProspectByToken,
  updateProspectOnboarding,
} from "../src/lib/notion-prospects";

async function main() {
  const lucas = await getProspectByToken("4935d93e-a173-4c3d-bfb2-7950f2d0f9e9");
  if (!lucas) {
    console.error("Lucas not found");
    process.exit(1);
  }
  const ob = (lucas.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as Record<string, unknown>;
  const business = (content.business ?? {}) as Record<string, unknown>;

  const before = {
    phoneDisplay: business.phoneDisplay,
    phoneTel: business.phoneTel,
    publicEmail: business.publicEmail,
  };

  business.phoneDisplay = "07824 369011";
  business.phoneTel = "07824369011";
  business.publicEmail = "testemail@hotmail.co.uk";

  content.business = business;
  ob.content = content;

  console.log("Before:", before);
  console.log("After: ", {
    phoneDisplay: business.phoneDisplay,
    phoneTel: business.phoneTel,
    publicEmail: business.publicEmail,
  });

  await updateProspectOnboarding(lucas.pageId, {
    data: ob as Parameters<typeof updateProspectOnboarding>[1]["data"],
  });
  console.log("\n✓ Notion updated. Approve & deploy edit 96b4d5b3 from /admin and the next build will reflect this.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
