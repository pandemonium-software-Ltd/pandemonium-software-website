// Conservative regex-based detector for multi-item submissions.
// Flags obvious multi-item structures (numbered/bullet lists,
// explicit conjunctive markers like "also" or "additionally",
// multiple "Please" headers) without being noisy on single-item
// requests with multiple data points (e.g. "update opening hours:
// Mon-Fri 8-6, Sat 9-12").
//
// Used at the API boundary (BOTH /api/account/change-request and
// /api/onboarding/review-edit) to decline multi-item submissions
// before they reach Cowork's LLM classifier — saves an API call
// and gives the customer a clearer "split into separate requests"
// message than a Haiku-generated reasoning string would.
//
// Doesn't catch every multi-field combination: e.g. "change email
// to X and number to Y" doesn't trigger any of these rules. The
// Haiku classifier should refuse those at semantic level (its
// prompt explicitly tells it to classify multi-field patches as
// "ambiguous" — see src/lib/haiku/classify-change-request.ts).

export function looksLikeMultipleItems(message: string): boolean {
  // Numbered list: lines like "1." "1)" "(1)" with content after
  const numbered = (
    message.match(/(?:^|\n)\s*\(?\d+[.)]\s+\S/g) ?? []
  ).length;
  if (numbered >= 2) return true;

  // Bullet list: lines starting with -, *, • with content after
  const bullets = (
    message.match(/(?:^|\n)\s*[-*•]\s+\S/g) ?? []
  ).length;
  if (bullets >= 2) return true;

  // Sentence-starting conjunctive markers ("Also,", "Additionally,",
  // "Secondly,", etc. — anywhere a new sentence begins). Restricting
  // to sentence start avoids false-positives on filler "also" mid-
  // sentence ("I have also uploaded the new file" should NOT match).
  if (
    /(?:^|[.!?\n]\s*)(?:also|additionally|secondly|thirdly|second:|third:)\b[,.\s]/i.test(
      message,
    )
  ) {
    return true;
  }
  // "and also" anywhere — that's a compound conjunction joining two
  // distinct asks ("change X and also do Y"), not filler.
  if (/\band\s+also\b/i.test(message)) {
    return true;
  }

  // 2+ "Please" instances — each typically heads a separate ask
  const pleases = (message.match(/(?:^|\W)please\b/gi) ?? []).length;
  if (pleases >= 2) return true;

  return false;
}

/** The standard customer-facing decline message. Same wording in
 *  both endpoints so the customer sees consistent feedback. */
export const MULTI_ITEM_DECLINE_MESSAGE =
  "Looks like you've sent multiple changes in one request. Please split them into separate requests — one item per request — so each can be tracked and applied cleanly.";
