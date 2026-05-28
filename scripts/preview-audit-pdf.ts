import { generateAuditPdf, type AuditPdfInput } from "../src/lib/gbp-audit-pdf";
import { writeFileSync } from "fs";

const input: AuditPdfInput = {
  businessName: "MyGem Photography",
  auditDate: "2026-05-29",
  score: 5,
  mapsUrl: "https://maps.google.com/?cid=4955406735",
  snapshot: {
    displayName: "MyGem Photography",
    formattedAddress: "10 MyGem, Oxford, Oxfordshire",
    rating: null,
    totalReviews: 0,
    topReviews: [],
    websiteUri: "https://test09052026moduforge.store",
    nationalPhoneNumber: "07824 369088",
    primaryType: "photographer",
    types: ["photographer", "point_of_interest", "establishment"],
    editorialSummary: null,
    regularOpeningHours: "Thu: 9am–6pm; Fri: 9am–7pm; Sat: 9am–7pm; Sun: 9am–6:30pm",
    photoCount: 0,
    googleMapsUri: "https://maps.google.com/?cid=4955406735",
  },
  sections: [
    {
      level: "red",
      title: "Critical Issues",
      items: [
        "No photos uploaded — listings with photos get 42% more requests for directions and 35% more clicks to websites (Google's own data). Upload at least 5 high-quality photos: exterior, interior, team, 2-3 best work examples.",
        "No business description set — this is prime real estate for local keywords. Write 750 chars covering services, location, and what makes MyGem different.",
        "No Google reviews yet — reviews are the #1 local ranking factor. Set up a review request workflow (SMS/email after each job with a direct review link).",
      ],
    },
    {
      level: "amber",
      title: "High-Impact Improvements",
      items: [
        "Only one category set (photographer). Add secondary categories: 'Wedding photographer', 'Portrait photographer', 'Event photographer' to capture more search queries.",
        "Opening hours show Thu–Sun only. If Mon–Wed are genuinely closed, add them as 'Closed' explicitly — Google penalises missing hours vs stated-closed hours.",
        "Website URL points to test domain (test09052026moduforge.store). Update to the live production domain once it's ready.",
        "Service area set to 'Oxfordshire' — consider expanding to specific nearby towns (Abingdon, Witney, Bicester) for better local pack coverage.",
      ],
    },
    {
      level: "green",
      title: "Nice-to-Have",
      items: [
        "Add Q&A to the listing — pre-populate 3-5 common questions (pricing, availability, what's included) to control the narrative.",
        "Create Google Posts weekly — event/offer posts with photos get 2-3x more engagement than text-only.",
        "Add 'appointment' link to enable direct booking from the GBP listing.",
      ],
    },
    {
      level: "green",
      title: "What's Working Well",
      items: [
        "Phone number is set and matches intake data.",
        "Opening hours are set for operational days.",
        "Primary category 'photographer' is correct.",
        "Manager access granted — ready for optimisation.",
      ],
    },
  ],
  reviewsSummary:
    "No reviews yet. This is the single biggest gap — aim for 5-10 reviews within the first month. Create a simple review request flow: after each job, send a thank-you message with a direct Google review link. Even 5 genuine reviews with responses will significantly boost local ranking.",
  consistencyNotes:
    "Phone: MATCH (07824 369088 on both GBP and intake). Address: PARTIAL — GBP shows '10 MyGem, Oxford' but intake has '10 MyGem\\nOxford' — verify the full postcode is included on GBP. Website: MISMATCH — GBP points to test domain, intake domain is test09052026moduforge.store. Update once live domain is active. Hours: GBP shows Thu–Sun only, intake matches. Verify Mon–Wed closure is intentional.",
};

async function main() {
  const pdf = await generateAuditPdf(input);
  const outPath = "scripts/gbp-audit-preview-mygem.pdf";
  writeFileSync(outPath, pdf);
  console.log(`PDF written to ${outPath} (${pdf.length} bytes)`);
}

main().catch(console.error);
