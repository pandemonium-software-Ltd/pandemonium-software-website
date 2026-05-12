// Polish functions — one per kind of customer copy that benefits from
// LLM rewriting. Each function takes the raw customer text + minimal
// context (business name, type) and returns a marketing-polished
// version. All returns are nullable: null = "use the raw input as-is".
//
// IMPORTANT — polishTagline was REMOVED. Hero taglines are short,
// personal, and the customer always wants their exact words. The
// silent-override cost was too high. Currently only aboutBlurb,
// service longDescription, and FAQ answer have polish functions —
// and even those only run when the source is `intake` (the Phase 3
// raw dump). Hub Step 4 edits + change-request patches pass through
// verbatim. See enrich.ts for the source gating.
//
// Design rules these prompts enforce on Haiku:
//   1. Keep all facts the customer wrote. Don't invent prices, hours,
//      services, or features.
//   2. UK English (the marketing site's audience is UK SMBs).
//   3. Plain prose, no headings, no markdown, no emojis.
//   4. Match the requested length envelope so layout doesn't break.
//   5. Sound like a human small-business owner — not corporate, not
//      hype, not aggressive.
//
// All polish functions share the same structure:
//   - skip if input is too short to be worth polishing
//   - skip if already polished-looking (heuristic: long enough +
//     ends with proper punctuation + has at least one comma)
//   - call Haiku with kind-specific system + prompt
//   - return result (or null on failure / empty)
// The "already polished" skip saves tokens on customers who write
// well — common for tradespeople with marketing background.

import { callHaiku } from "./client";

type PolishContext = {
  businessName: string;
  businessType: string;
  location?: string;
};

/** Soft minimum length below which polish isn't worth the round-trip. */
const MIN_LEN = 20;

/**
 * Polish the multi-paragraph about-us blurb. Customers often write
 * a single dense paragraph; Haiku breaks it into ~2-3 readable
 * paragraphs, smooths transitions, and softens the salesy bits.
 * Caps total length at ~600 chars (around 3 short paragraphs) to
 * keep the about page scannable.
 */
export async function polishAboutBlurb(
  raw: string,
  ctx: PolishContext,
): Promise<string | null> {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_LEN * 2) return null;
  // If the customer already broke it into paragraphs AND it's
  // reasonably sized, leave it alone. Saves tokens on customers
  // who write well.
  if (
    trimmed.includes("\n\n") &&
    trimmed.length > 200 &&
    trimmed.length < 600
  ) {
    return null;
  }

  const system =
    `You polish "about us" copy for small UK business websites. ` +
    `Keep every fact, name, year and detail the user wrote — invent nothing. ` +
    `UK English. Plain prose. No headings, no markdown, no emojis. ` +
    `Output only the polished blurb, nothing else.`;

  const prompt =
    `Business: ${ctx.businessName} (${ctx.businessType}` +
    (ctx.location ? `, ${ctx.location}` : ``) +
    `)\n\n` +
    `Polish this "about us" blurb. Aim for 2-3 short paragraphs ` +
    `(under 600 characters total). Warm and professional — like the ` +
    `owner introducing their business in person. Use \\n\\n between ` +
    `paragraphs.\n\n` +
    `Blurb:\n${trimmed}`;

  const out = await callHaiku({ system, prompt, maxTokens: 400 });
  if (!out) return null;
  const cleaned = out.trim();
  if (cleaned.length < 50 || cleaned.length > 800) return null;
  return cleaned;
}

/**
 * Polish a single service's long-form description. Often these are
 * one-liners that need expanding into a card-friendly 2-3 sentences.
 * Skips if the customer already wrote a full paragraph.
 */
export async function polishServiceDescription(
  raw: string,
  serviceName: string,
  ctx: PolishContext,
): Promise<string | null> {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_LEN) return null;
  // Already a substantial paragraph? Skip.
  if (trimmed.length > 280 && trimmed.includes(". ")) return null;

  const system =
    `You polish service descriptions for small UK business websites. ` +
    `Keep every fact the user wrote — invent no prices, durations, or ` +
    `features. UK English. Plain prose, 2-3 sentences. No headings, ` +
    `no markdown, no bullets, no emojis. Output only the polished ` +
    `description, nothing else.`;

  const prompt =
    `Business: ${ctx.businessName} (${ctx.businessType})\n` +
    `Service: ${serviceName}\n\n` +
    `Polish this service description. 2-3 sentences. Aim for ` +
    `120-280 characters total. Concrete and reassuring — answer ` +
    `"what is it and why would I pick them?".\n\n` +
    `Description:\n${trimmed}`;

  const out = await callHaiku({ system, prompt, maxTokens: 200 });
  if (!out) return null;
  const cleaned = out.trim();
  if (cleaned.length < 60 || cleaned.length > 400) return null;
  return cleaned;
}

/**
 * Polish a single FAQ answer. Customer-written answers are often
 * curt ("Yes we do") — Haiku expands to a friendly, complete
 * sentence while keeping the answer accurate. Question is not
 * polished (customers write the questions they actually get asked,
 * which is more SEO-valuable than rewording them).
 */
export async function polishFaqAnswer(
  rawAnswer: string,
  question: string,
  ctx: PolishContext,
): Promise<string | null> {
  const trimmed = rawAnswer.trim();
  if (trimmed.length < 10) return null;
  // Already a full paragraph? Skip.
  if (trimmed.length > 200 && trimmed.includes(". ")) return null;

  const system =
    `You polish FAQ answers for small UK business websites. ` +
    `Keep every fact and instruction the user wrote — invent nothing. ` +
    `UK English. Plain prose, 1-3 sentences. No headings, no markdown, ` +
    `no emojis. Output only the polished answer, nothing else.`;

  const prompt =
    `Business: ${ctx.businessName} (${ctx.businessType})\n` +
    `Question: ${question}\n\n` +
    `Polish this answer. 1-3 sentences. Friendly, complete, helpful. ` +
    `Don't pad — answer the question directly.\n\n` +
    `Answer:\n${trimmed}`;

  const out = await callHaiku({ system, prompt, maxTokens: 200 });
  if (!out) return null;
  const cleaned = out.trim();
  if (cleaned.length < 15 || cleaned.length > 400) return null;
  return cleaned;
}
