// Check what email address an enquiry would actually go to for a
// given prospect. Useful when "I submitted the form but didn't get
// an email" — first thing to verify is that the resolution chain
// (content.business.publicEmail → prospect.email) is pointing at
// the right inbox.
//
// Run with:
//   npx tsx --env-file=.dev.vars scripts/check-enquiry-recipient.ts <token>

import { getProspectByToken } from "../src/lib/notion-prospects";

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error("Usage: npx tsx --env-file=.dev.vars scripts/check-enquiry-recipient.ts <token>");
    process.exit(1);
  }
  const p = await getProspectByToken(token);
  if (!p) {
    console.error("Prospect not found");
    process.exit(1);
  }

  console.log(`prospect: ${p.name} (${p.business ?? "—"})`);
  console.log(`prospect.email:                 ${p.email}`);

  const ob = (p.onboardingData ?? {}) as Record<string, unknown>;
  const content = (ob.content ?? {}) as { business?: { publicEmail?: unknown } };
  const overrideEmail = content.business?.publicEmail;
  console.log(`content.business.publicEmail:   ${typeof overrideEmail === "string" ? overrideEmail : "(unset)"}`);

  // Mirror the resolution logic in /api/public/enquiry/route.ts
  const recipientEmail =
    typeof overrideEmail === "string" && overrideEmail.trim()
      ? overrideEmail.trim()
      : (p.email ?? "").trim();
  console.log(`\n→ enquiry would be SENT TO:    ${recipientEmail}`);

  console.log(`\nmoduleSelections:               ${p.moduleSelections.join(", ") || "(none)"}`);
  console.log(`has Enquiry Form module:        ${p.moduleSelections.includes("Enquiry Form") ? "YES" : "NO ← would 400"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
