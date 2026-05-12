// Conservative wishlist detector for change-request submissions.
//
// Cowork's classifier now properly handles multi-field requests
// (e.g. "change phone AND email" → 2 patches → applied atomically),
// so this detector ONLY catches genuinely list-shaped submissions
// that look like a wishlist or site rebrief rather than a normal
// edit. The classifier won't auto-apply 5+ patches in one go and
// the operator UX of approving a sprawling list is poor — better
// to ask the customer to split.
//
// Triggers (any one):
//   - 3+ numbered list items (1. ... 2. ... 3. ...)
//   - 3+ bullet items (-, *, •)
//   - 2+ instances of "additionally" / "also another" / "thirdly"
//     (genuine multi-paragraph compound asks)
//
// Used at the API boundary (BOTH /api/account/change-request and
// /api/onboarding/review-edit) to give the customer a fast, clear
// "split into separate requests" message before paying for a
// classification round-trip. Two-field "and" requests are now
// ALLOWED through — Haiku handles them.

export function looksLikeMultipleItems(message: string): boolean {
  // Numbered list: lines like "1." "1)" "(1)" with content after.
  // Threshold raised from 2 to 3 so that a customer numbering two
  // related fields (which Haiku can patch as 2 patches) doesn't
  // get blocked at the front door.
  const numbered = (
    message.match(/(?:^|\n)\s*\(?\d+[.)]\s+\S/g) ?? []
  ).length;
  if (numbered >= 3) return true;

  // Bullet list: lines starting with -, *, • with content after.
  // Same threshold reasoning as numbered.
  const bullets = (
    message.match(/(?:^|\n)\s*[-*•]\s+\S/g) ?? []
  ).length;
  if (bullets >= 3) return true;

  // Multiple compound-ask markers ("Additionally,", "Also another",
  // "Thirdly,") — singular use is fine ("change X. Also Y." is a
  // legitimate 2-field request); 2+ is wishlist territory.
  const compoundMarkers = (
    message.match(
      /(?:^|[.!?\n]\s*)(?:additionally|also another|thirdly|second:|third:)\b/gi,
    ) ?? []
  ).length;
  if (compoundMarkers >= 2) return true;

  return false;
}

/** The standard customer-facing decline message for genuine
 *  wishlists. (Two-field "and" requests no longer hit this — Cowork
 *  patches them atomically.) */
export const MULTI_ITEM_DECLINE_MESSAGE =
  "This request looks like a list of several distinct changes. Please split it into separate requests — one ask per request — so each can be tracked, classified, and deployed cleanly.";
