// Compatibility Rules Engine — Playbook Section 6.
//
// Cowork runs these rules against every Phase 2 qualification submission
// and produces one of four outcomes:
//
//   accept                — all hard and soft blockers clear
//   soft_reject           — a hard blocker is triggered (Template L4)
//   clarification_needed  — contradictory data; ask for clarification (Template L5)
//   flag_for_review       — a soft blocker is triggered; Ben decides
//
// Cowork does NOT apply judgment. It runs rules. Ambiguity defaults to
// flag_for_review or clarification_needed — never accept when unsure.
//
// Keyword lists are kept conservative. False positives mean Ben gets
// pinged unnecessarily; false negatives mean Cowork accepts something
// it shouldn't. We err toward false positives because Section 9
// "Escalate when uncertain" is non-negotiable.

import type {
  Phase1Data,
  Phase2Data,
  CompatibilityOutcome,
} from "./schemas";

// ---------- Hard blocker IDs ----------

export const HARD_BLOCKERS = {
  HB1_MULTI_BOOKABLE_STAFF: "HB1: Scheduling requires multiple independently-bookable people",
  HB2_ECOMMERCE: "HB2: E-commerce or online product purchasing required",
  HB3_MULTILINGUAL: "HB3: Multilingual or multi-region site required",
  HB4_UNSUPPORTED_INTEGRATION: "HB4: Integration with software outside our supported list",
  HB5_TIGHT_TIMELINE: "HB5: Go-live date is less than 14 days from submission",
  HB6_OUT_OF_TEMPLATE: "HB6: Required feature not deliverable by our template",
} as const;

export const SOFT_BLOCKERS = {
  SB1_CUSTOM_LAYOUT: "SB1: Custom layout work beyond the four vibe presets",
  SB2_TOO_MANY_SERVICES: "SB2: More than 10 services to list",
  SB3_ACCESSIBILITY_BEYOND_AA: "SB3: Accessibility requirements beyond WCAG AA",
  SB4_BAD_PREVIOUS_EXPERIENCE: "SB4: Previous bad experience with a web designer",
  SB5_CONTRADICTORY: "SB5: Contradictory responses in qualification form",
  SB6_TECHNICAL_QUESTIONS: "SB6: Persistent technical implementation questions",
  SB7_OUT_OF_SCOPE_DELIVERABLE: "SB7: Out-of-scope feature that could potentially be delivered",
} as const;

// ---------- Helpers ----------

function normalise(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

/** Match if any keyword (lowercase) appears as a substring in `text`. */
function containsAny(text: string, keywords: string[]): string | null {
  const t = normalise(text);
  for (const k of keywords) {
    if (t.includes(k)) return k;
  }
  return null;
}

function combinedFreeText(phase2: Phase2Data): string {
  return [phase2.specificFeatures ?? "", phase2.dealBreakers ?? ""]
    .join("\n")
    .toLowerCase();
}

// ---------- HB1: Multiple independently-bookable staff ----------

const HB1_KEYWORDS = [
  "multiple stylists",
  "multiple staff",
  "each stylist",
  "each therapist",
  "each practitioner",
  "individual calendars",
  "different practitioners",
  "team bookings",
  "team members can take",
  "staff can take their own",
  "per-stylist",
  "per stylist",
  "per-therapist",
  "per therapist",
  "different staff members",
];

function checkHB1(phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), HB1_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" in their qualification — multiple independently-bookable staff is outside our template.`;
  }
  // Salon business types with booking interest are flagged here too,
  // because the standard salon use-case usually means multiple stylists.
  if (
    phase1.businessType === "Salon" &&
    phase2.modulesInterest.includes("Online Booking")
  ) {
    return "Salon business type with Online Booking module — typically requires multiple independently-bookable stylists, which is outside our template.";
  }
  return null;
}

// ---------- HB2: E-commerce ----------

const HB2_KEYWORDS = [
  "ecommerce",
  "e-commerce",
  "e commerce",
  "sell online",
  "online shop",
  "online store",
  "shopping cart",
  "checkout for products",
  "product purchases",
  "buy products",
  "selling products",
  "product catalogue",
  "product catalog",
  "stock management",
  "inventory",
  "shopify",
  "woocommerce",
];

function checkHB2(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), HB2_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — e-commerce is outside our template (we're brochure + lead generation).`;
  }
  return null;
}

// ---------- HB3: Multilingual / multi-region ----------

const HB3_KEYWORDS = [
  "multilingual",
  "multi-lingual",
  "multi lingual",
  "multi-language",
  "multi language",
  "multiple languages",
  "translate",
  "translation",
  "in spanish",
  "in french",
  "in welsh",
  "in polish",
  "language selector",
  "international site",
  "multi-region",
  "multi region",
];

function checkHB3(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), HB3_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — multilingual / multi-region sites are outside our template.`;
  }
  return null;
}

// ---------- HB4: Unsupported integrations ----------
//
// Supported list (Playbook 6): Cal.com, Resend, Google Calendar, Stripe.
// We scan free-text for integration phrasing combined with software names
// not on the list. This is intentionally narrow — broad keyword matches
// trip on innocent phrasing like "Google Maps" (which we do support).

const HB4_INTEGRATION_PHRASES = [
  "integrate with",
  "integration with",
  "connect to",
  "connect with",
  "sync with",
  "api integration",
];

const HB4_UNSUPPORTED_TOOLS = [
  "salesforce",
  "hubspot",
  "pipedrive",
  "zoho",
  "monday.com",
  "asana",
  "trello",
  "mailchimp",
  "klaviyo",
  "constant contact",
  "quickbooks",
  "xero",
  "sage",
  "freshbooks",
  "intercom",
  "zendesk",
  "custom crm",
  "our crm",
  "our erp",
  "in-house system",
  "internal system",
];

function checkHB4(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const text = combinedFreeText(phase2);
  const phraseHit = HB4_INTEGRATION_PHRASES.find((p) => text.includes(p));
  if (!phraseHit) return null;
  const toolHit = HB4_UNSUPPORTED_TOOLS.find((t) => text.includes(t));
  if (toolHit) {
    return `Mentioned "${phraseHit} ... ${toolHit}" — that tool isn't on our supported integration list (Cal.com, Resend, Google Calendar, Stripe).`;
  }
  return null;
}

// ---------- HB5: Tight timeline (< 14 days) ----------

function checkHB5(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  // goLiveDate is a string (YYYY-MM-DD from <input type="date">, or
  // free-text like "asap" / "next week"). Be defensive.
  const raw = phase2.goLiveDate.trim();
  if (!raw) return null;

  // Free-text urgency phrases trigger HB5 directly.
  const urgentPhrases = [
    "asap",
    "as soon as possible",
    "this week",
    "next week",
    "within a week",
    "in a week",
    "in 5 days",
    "in 7 days",
    "in 10 days",
    "within 10 days",
    "within 14 days",
  ];
  const urgencyHit = urgentPhrases.find((p) => raw.toLowerCase().includes(p));
  if (urgencyHit) {
    return `Target go-live "${raw}" is under our 14-day minimum.`;
  }

  // Otherwise try to parse as a date.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    // Unparseable date isn't a hard fail — let it fall through to
    // normal processing. Ben can always flag it manually if odd.
    return null;
  }
  const now = new Date();
  const diffMs = parsed.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 14) {
    return `Target go-live ${raw} is ${Math.floor(diffDays)} days away — under our 14-day minimum.`;
  }
  return null;
}

// ---------- HB6: Out-of-template features ----------

const HB6_KEYWORDS = [
  "membership area",
  "members area",
  "members-only",
  "members only",
  "subscription content",
  "gated content",
  "user accounts",
  "client portal",
  "login area",
  "password-protected pages",
  "live chat",
  "live operator",
  "human chat",
  "chat with agent",
  "custom api",
  "custom backend",
  "custom database",
  "custom development",
  "build us a feature",
  "bespoke functionality",
  "ai chatbot",
  "chatbot",
  "online courses",
  "video streaming",
  "forum",
  "community board",
];

function checkHB6(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), HB6_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — that feature isn't deliverable by our template.`;
  }
  return null;
}

// ---------- Soft blockers ----------

const SB1_KEYWORDS = [
  "custom design",
  "completely custom",
  "bespoke design",
  "unique layout",
  "custom layout",
  "different from your template",
  "not like your template",
  "fully custom",
  "branded experience that",
  "we want it to look like",
];

function checkSB1(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), SB1_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — sounds like custom layout work beyond our four vibe presets.`;
  }
  return null;
}

const SB2_KEYWORDS = [
  "15 services",
  "20 services",
  "25 services",
  "30 services",
  "lots of services",
  "many services",
  "hundreds of services",
  "all our services",
  "full service list",
];

function checkSB2(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), SB2_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — our template displays up to 10 services.`;
  }
  return null;
}

const SB3_KEYWORDS = [
  "wcag aaa",
  "wcag 2.2 aaa",
  "ada compliant",
  "ada compliance",
  "section 508",
  "accessibility audit",
  "accessibility certification",
  "screen reader optimisation beyond",
  "screen reader optimization beyond",
  "blind users specifically",
  "deaf users specifically",
];

function checkSB3(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), SB3_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — that's beyond our standard WCAG AA baseline; Ben should review before acceptance.`;
  }
  return null;
}

const SB4_KEYWORDS = [
  "ripped off",
  "scammed",
  "previous developer",
  "last designer",
  "last developer",
  "burned by",
  "bad experience with",
  "previous web designer",
  "they took my money",
  "ghosted me",
  "cowboys",
  "rip off",
];

function checkSB4(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), SB4_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — Ben handles first response personally where there's prior bad experience.`;
  }
  return null;
}

// SB5 = contradictions. These produce `clarification_needed`, not
// flag_for_review (per Playbook §6 + §7 Phase 2 Clarification Path).
function checkContradictions(
  _phase1: Phase1Data,
  phase2: Phase2Data,
): string[] {
  const issues: string[] = [];

  // GBP contradiction: requesting GBP setup while saying GBP is up to date.
  if (
    phase2.gbpStatus === "Yes and up to date" &&
    phase2.modulesInterest.includes("Google Business Profile Setup/Audit")
  ) {
    issues.push(
      "GBP status is 'Yes and up to date' but they're asking for the GBP Setup/Audit add-on.",
    );
  }

  // Acquisition cost contradiction: paying for ads but answering "Nothing".
  if (
    phase2.acquisitionMethod === "Nothing" &&
    phase2.acquisitionMonthlyCost > 0
  ) {
    issues.push(
      `Acquisition method is "Nothing" but monthly cost is £${phase2.acquisitionMonthlyCost}.`,
    );
  }

  // Spend / volume sanity check: very low enquiries for very high spend.
  if (
    phase2.enquiryVolume === "0-5" &&
    phase2.acquisitionMonthlyCost >= 1000
  ) {
    issues.push(
      `£${phase2.acquisitionMonthlyCost}/mo on acquisition for only 0-5 enquiries — likely a mistake or worth confirming.`,
    );
  }

  return issues;
}

const SB6_KEYWORDS = [
  "what tech stack",
  "what framework",
  "which framework",
  "next.js",
  "nextjs",
  "react app",
  "node.js backend",
  "github access",
  "git access",
  "source code access",
  "self-host",
  "self host",
  "do you use wordpress",
  "is this wordpress",
  "headless cms",
  "graphql",
  "tailwind",
];

function checkSB6(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), SB6_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — sounds like persistent technical implementation questions; Ben should reply.`;
  }
  return null;
}

const SB7_KEYWORDS = [
  "small shop",
  "few products",
  "5 products",
  "couple of products",
  "simple booking",
  "basic ecommerce",
  "basic e-commerce",
  "simple shop",
  "small online shop",
  "selling a few items",
];

function checkSB7(_phase1: Phase1Data, phase2: Phase2Data): string | null {
  const hit = containsAny(combinedFreeText(phase2), SB7_KEYWORDS);
  if (hit) {
    return `Mentioned "${hit}" — it's in our out-of-scope list but might be deliverable with effort; Ben should decide.`;
  }
  return null;
}

// ---------- Engine ----------

type HardBlockerCheck = {
  id: keyof typeof HARD_BLOCKERS;
  fn: (p1: Phase1Data, p2: Phase2Data) => string | null;
};

const HARD_CHECKS: HardBlockerCheck[] = [
  { id: "HB1_MULTI_BOOKABLE_STAFF", fn: checkHB1 },
  { id: "HB2_ECOMMERCE", fn: checkHB2 },
  { id: "HB3_MULTILINGUAL", fn: checkHB3 },
  { id: "HB4_UNSUPPORTED_INTEGRATION", fn: checkHB4 },
  { id: "HB5_TIGHT_TIMELINE", fn: checkHB5 },
  { id: "HB6_OUT_OF_TEMPLATE", fn: checkHB6 },
];

type SoftBlockerCheck = {
  id: keyof typeof SOFT_BLOCKERS;
  fn: (p1: Phase1Data, p2: Phase2Data) => string | null;
};

const SOFT_CHECKS: SoftBlockerCheck[] = [
  { id: "SB1_CUSTOM_LAYOUT", fn: checkSB1 },
  { id: "SB2_TOO_MANY_SERVICES", fn: checkSB2 },
  { id: "SB3_ACCESSIBILITY_BEYOND_AA", fn: checkSB3 },
  { id: "SB4_BAD_PREVIOUS_EXPERIENCE", fn: checkSB4 },
  { id: "SB6_TECHNICAL_QUESTIONS", fn: checkSB6 },
  { id: "SB7_OUT_OF_SCOPE_DELIVERABLE", fn: checkSB7 },
];

/**
 * Run the full compatibility rules engine against a Phase 1 + Phase 2
 * submission. Outcome priority:
 *
 *   1. Any hard blocker → soft_reject
 *   2. Any contradiction → clarification_needed
 *   3. Any soft blocker → flag_for_review
 *   4. Otherwise → accept
 */
export function runCompatibilityCheck(
  phase1: Phase1Data,
  phase2: Phase2Data,
): CompatibilityOutcome {
  // 1. Hard blockers
  for (const check of HARD_CHECKS) {
    const reasoning = check.fn(phase1, phase2);
    if (reasoning) {
      return {
        outcome: "soft_reject",
        reasoning,
        hardBlockerTriggered: HARD_BLOCKERS[check.id],
        softBlockersTriggered: [],
      };
    }
  }

  // 2. Contradictions (SB5 → clarification_needed)
  const contradictions = checkContradictions(phase1, phase2);
  if (contradictions.length > 0) {
    return {
      outcome: "clarification_needed",
      reasoning:
        "Some of their answers don't quite line up:\n- " +
        contradictions.join("\n- ") +
        "\n\nDraft Template L5 (clarification request) before deciding.",
      softBlockersTriggered: [SOFT_BLOCKERS.SB5_CONTRADICTORY],
    };
  }

  // 3. Soft blockers
  const triggeredSoft: { id: string; reasoning: string }[] = [];
  for (const check of SOFT_CHECKS) {
    const reasoning = check.fn(phase1, phase2);
    if (reasoning) {
      triggeredSoft.push({ id: SOFT_BLOCKERS[check.id], reasoning });
    }
  }
  if (triggeredSoft.length > 0) {
    return {
      outcome: "flag_for_review",
      reasoning:
        "Soft blockers triggered:\n- " +
        triggeredSoft.map((s) => s.reasoning).join("\n- "),
      softBlockersTriggered: triggeredSoft.map((s) => s.id),
    };
  }

  // 4. Accept
  return {
    outcome: "accept",
    reasoning:
      "All hard and soft blocker checks passed. Cowork drafts Template L3 acceptance for Ben approval.",
    softBlockersTriggered: [],
  };
}
