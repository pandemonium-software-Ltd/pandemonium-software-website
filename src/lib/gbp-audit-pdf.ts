// GBP Audit PDF generator.
//
// Produces a branded, traffic-light-scored PDF report for each
// customer's Google Business Profile audit. Uses pdf-lib (pure JS,
// Cloudflare Workers compatible — no Puppeteer/Chrome needed).
//
// The PDF is attached to the weekly audit email so Ben has a
// professional document he can also forward to the customer if
// needed.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PlaceAuditSnapshot } from "./google-places";

export type AuditSection = {
  level: "red" | "amber" | "green";
  title: string;
  items: string[];
};

export type AuditPdfInput = {
  businessName: string;
  auditDate: string;
  score: number;
  mapsUrl: string | null;
  snapshot: PlaceAuditSnapshot;
  sections: AuditSection[];
  reviewsSummary: string;
  consistencyNotes: string;
};

const NAVY = rgb(15 / 255, 29 / 255, 48 / 255);
const EMBER = rgb(249 / 255, 115 / 255, 22 / 255);
const CREAM = rgb(253 / 255, 252 / 255, 249 / 255);
const WHITE = rgb(1, 1, 1);
const LIGHT_GREY = rgb(0.92, 0.92, 0.92);

const RED = rgb(220 / 255, 38 / 255, 38 / 255);
const AMBER_COLOR = rgb(245 / 255, 158 / 255, 11 / 255);
const GREEN = rgb(22 / 255, 163 / 255, 74 / 255);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

function trafficColor(level: "red" | "amber" | "green") {
  if (level === "red") return RED;
  if (level === "amber") return AMBER_COLOR;
  return GREEN;
}

function scoreColor(score: number) {
  if (score <= 4) return RED;
  if (score <= 6) return AMBER_COLOR;
  return GREEN;
}

export async function generateAuditPdf(
  input: AuditPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function addPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawFooter();
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 30) addPage();
  }

  function drawFooter() {
    page.drawText("ModuForge — Google Business Profile Audit", {
      x: MARGIN,
      y: 25,
      size: 7,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });
    page.drawText(input.auditDate, {
      x: PAGE_W - MARGIN - 60,
      y: 25,
      size: 7,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  // Wrap text to fit within maxWidth, returns array of lines
  function wrapText(
    text: string,
    fontSize: number,
    maxWidth: number,
    font = helvetica,
  ): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  drawFooter();

  // ── Header bar ──
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 90,
    width: PAGE_W,
    height: 90,
    color: NAVY,
  });

  page.drawText("Google Business Profile Audit", {
    x: MARGIN,
    y: PAGE_H - 45,
    size: 22,
    font: helveticaBold,
    color: WHITE,
  });
  page.drawText(input.businessName, {
    x: MARGIN,
    y: PAGE_H - 68,
    size: 13,
    font: helvetica,
    color: EMBER,
  });
  page.drawText(input.auditDate, {
    x: PAGE_W - MARGIN - helvetica.widthOfTextAtSize(input.auditDate, 10),
    y: PAGE_H - 45,
    size: 10,
    font: helvetica,
    color: rgb(0.7, 0.75, 0.8),
  });

  y = PAGE_H - 110;

  // ── Score badge ──
  const scoreStr = `${input.score}/10`;
  const badgeW = 90;
  const badgeH = 50;
  const badgeX = PAGE_W - MARGIN - badgeW;
  const badgeY = y - badgeH;
  const sc = scoreColor(input.score);

  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: sc,
    borderColor: sc,
    borderWidth: 0,
  });
  // Round corners aren't supported in pdf-lib; the solid rect is fine.
  page.drawText(scoreStr, {
    x: badgeX + (badgeW - helveticaBold.widthOfTextAtSize(scoreStr, 24)) / 2,
    y: badgeY + 18,
    size: 24,
    font: helveticaBold,
    color: WHITE,
  });
  page.drawText("HEALTH SCORE", {
    x: badgeX + (badgeW - helvetica.widthOfTextAtSize("HEALTH SCORE", 7)) / 2,
    y: badgeY + 7,
    size: 7,
    font: helvetica,
    color: WHITE,
  });

  // ── Listing snapshot ──
  page.drawText("Listing Overview", {
    x: MARGIN,
    y,
    size: 14,
    font: helveticaBold,
    color: NAVY,
  });
  y -= 20;

  const snap = input.snapshot;
  const overviewRows = [
    ["Display Name", snap.displayName ?? "—"],
    ["Address", snap.formattedAddress ?? "—"],
    ["Phone", snap.nationalPhoneNumber ?? "Not set"],
    ["Website", snap.websiteUri ?? "Not set"],
    ["Primary Category", snap.primaryType?.replace(/_/g, " ") ?? "Not set"],
    [
      "Rating",
      snap.rating != null
        ? `${snap.rating.toFixed(1)} ★ (${snap.totalReviews ?? 0} reviews)`
        : "No rating yet",
    ],
    ["Photos", `${snap.photoCount} uploaded`],
    ["Description", snap.editorialSummary ?? "Not set"],
    ["Opening Hours", snap.regularOpeningHours ?? "Not set"],
  ];

  for (const [label, value] of overviewRows) {
    ensureSpace(18);
    // Alternate row background
    const rowIdx = overviewRows.indexOf([label, value]);
    if (overviewRows.findIndex((r) => r[0] === label) % 2 === 0) {
      page.drawRectangle({
        x: MARGIN - 5,
        y: y - 4,
        width: CONTENT_W + 10,
        height: 16,
        color: CREAM,
      });
    }
    page.drawText(label, {
      x: MARGIN,
      y,
      size: 9,
      font: helveticaBold,
      color: NAVY,
    });
    // Truncate long values
    const maxValW = CONTENT_W - 130;
    let displayVal = value;
    while (
      helvetica.widthOfTextAtSize(displayVal, 9) > maxValW &&
      displayVal.length > 3
    ) {
      displayVal = displayVal.slice(0, -4) + "…";
    }
    page.drawText(displayVal, {
      x: MARGIN + 125,
      y,
      size: 9,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 17;
  }

  y -= 10;

  // ── Traffic-light sections ──
  for (const section of input.sections) {
    if (section.items.length === 0) continue;

    ensureSpace(40);

    // Section header with traffic light dot
    const dotR = 5;
    page.drawCircle({
      x: MARGIN + dotR,
      y: y + 3,
      size: dotR,
      color: trafficColor(section.level),
    });
    page.drawText(section.title, {
      x: MARGIN + dotR * 2 + 8,
      y,
      size: 12,
      font: helveticaBold,
      color: NAVY,
    });
    y -= 8;

    // Thin coloured bar under the heading
    page.drawRectangle({
      x: MARGIN,
      y,
      width: CONTENT_W,
      height: 2,
      color: trafficColor(section.level),
    });
    y -= 12;

    // Items
    for (const item of section.items) {
      const lines = wrapText(item, 9, CONTENT_W - 15);
      ensureSpace(lines.length * 13 + 4);

      for (let i = 0; i < lines.length; i++) {
        if (i === 0) {
          page.drawText("•", {
            x: MARGIN + 4,
            y,
            size: 9,
            font: helvetica,
            color: trafficColor(section.level),
          });
        }
        page.drawText(lines[i], {
          x: MARGIN + 15,
          y,
          size: 9,
          font: helvetica,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= 13;
      }
      y -= 2;
    }

    y -= 8;
  }

  // ── Reviews summary ──
  if (input.reviewsSummary) {
    ensureSpace(50);
    page.drawText("Reviews Summary", {
      x: MARGIN,
      y,
      size: 12,
      font: helveticaBold,
      color: NAVY,
    });
    y -= 8;
    page.drawRectangle({
      x: MARGIN,
      y,
      width: CONTENT_W,
      height: 2,
      color: LIGHT_GREY,
    });
    y -= 14;

    const reviewLines = wrapText(input.reviewsSummary, 9, CONTENT_W);
    for (const line of reviewLines) {
      ensureSpace(14);
      page.drawText(line, {
        x: MARGIN,
        y,
        size: 9,
        font: helvetica,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 13;
    }
    y -= 8;
  }

  // ── Consistency notes ──
  if (input.consistencyNotes) {
    ensureSpace(50);
    page.drawText("GBP ↔ Website Consistency", {
      x: MARGIN,
      y,
      size: 12,
      font: helveticaBold,
      color: NAVY,
    });
    y -= 8;
    page.drawRectangle({
      x: MARGIN,
      y,
      width: CONTENT_W,
      height: 2,
      color: LIGHT_GREY,
    });
    y -= 14;

    const consLines = wrapText(input.consistencyNotes, 9, CONTENT_W);
    for (const line of consLines) {
      ensureSpace(14);
      page.drawText(line, {
        x: MARGIN,
        y,
        size: 9,
        font: helvetica,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 13;
    }
    y -= 8;
  }

  // ── Top reviews ──
  if (snap.topReviews.length > 0) {
    ensureSpace(40);
    page.drawText("Top Reviews", {
      x: MARGIN,
      y,
      size: 12,
      font: helveticaBold,
      color: NAVY,
    });
    y -= 8;
    page.drawRectangle({
      x: MARGIN,
      y,
      width: CONTENT_W,
      height: 2,
      color: LIGHT_GREY,
    });
    y -= 14;

    for (const review of snap.topReviews) {
      const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
      const header = `${stars}  ${review.authorName} — ${review.relativeTimeDescription}`;
      ensureSpace(30);

      page.drawText(header, {
        x: MARGIN,
        y,
        size: 8,
        font: helveticaBold,
        color: EMBER,
      });
      y -= 12;

      const reviewLines = wrapText(
        `"${review.text}"`,
        8,
        CONTENT_W - 10,
      );
      for (const line of reviewLines) {
        ensureSpace(12);
        page.drawText(line, {
          x: MARGIN + 5,
          y,
          size: 8,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= 11;
      }
      y -= 6;
    }
  }

  // ── Google Maps link ──
  if (input.mapsUrl) {
    ensureSpace(25);
    page.drawText(`Google Maps: ${input.mapsUrl}`, {
      x: MARGIN,
      y,
      size: 7,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return doc.save();
}

/** Parse Claude's markdown audit into structured sections for the PDF.
 *  Falls back gracefully — if parsing fails, returns a single green
 *  section with the raw text. */
export function parseAuditMarkdown(markdown: string): {
  score: number;
  sections: AuditSection[];
  reviewsSummary: string;
  consistencyNotes: string;
} {
  let score = 7;
  const scoreMatch = markdown.match(/Score:\s*(\d+)\s*\/\s*10/i);
  if (scoreMatch) score = parseInt(scoreMatch[1], 10);

  const sections: AuditSection[] = [];
  let reviewsSummary = "";
  let consistencyNotes = "";

  const sectionPatterns: Array<{
    pattern: RegExp;
    level: "red" | "amber" | "green";
    title: string;
    target?: "reviews" | "consistency";
  }> = [
    {
      pattern: /###\s*🔴\s*Critical[^\n]*/i,
      level: "red",
      title: "Critical Issues",
    },
    {
      pattern: /###\s*🟠\s*High[^\n]*/i,
      level: "amber",
      title: "High-Impact Improvements",
    },
    {
      pattern: /###\s*🟡\s*Nice[^\n]*/i,
      level: "green",
      title: "Nice-to-Have",
    },
    {
      pattern: /###\s*✅\s*What'?s?\s*Working[^\n]*/i,
      level: "green",
      title: "What's Working Well",
    },
    {
      pattern: /###\s*Reviews?\s*Summary[^\n]*/i,
      level: "green",
      title: "Reviews Summary",
      target: "reviews",
    },
    {
      pattern: /###\s*GBP\s*↔|###\s*Consistency[^\n]*/i,
      level: "amber",
      title: "GBP ↔ Website Consistency",
      target: "consistency",
    },
  ];

  for (const sp of sectionPatterns) {
    const match = markdown.match(sp.pattern);
    if (!match) continue;

    const startIdx = match.index! + match[0].length;
    const nextHeading = markdown
      .slice(startIdx)
      .match(/\n###?\s/);
    const content = nextHeading
      ? markdown.slice(startIdx, startIdx + nextHeading.index!)
      : markdown.slice(startIdx);

    const items = content
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));

    if (sp.target === "reviews") {
      reviewsSummary = items.join(" ");
    } else if (sp.target === "consistency") {
      consistencyNotes = items.join(" ");
    } else if (items.length > 0) {
      sections.push({ level: sp.level, title: sp.title, items });
    }
  }

  if (sections.length === 0) {
    const lines = markdown
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.trim().length > 0)
      .map((l) => l.replace(/^[-*]\s*/, "").trim());
    if (lines.length > 0) {
      sections.push({ level: "green", title: "Audit Notes", items: lines });
    }
  }

  return { score, sections, reviewsSummary, consistencyNotes };
}
