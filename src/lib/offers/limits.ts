// Length caps for the Offers module — single source of truth.
//
// These exist because the offer strip renders in a tight horizontal
// band at the top of the customer's homepage. Long copy wraps onto
// multiple lines, breaks the layout on mobile, or pushes the CTA
// off-screen. The caps below are picked from layout testing rather
// than character-count tradition:
//
//   headline 70  — fits one line on a 360px viewport in 14px text,
//                  two lines on phones at the smallest breakpoint
//                  we support.
//   body 140     — Twitter-length. Two lines wraps comfortably on
//                  mobile, one line on tablet up.
//   ctaLabel 22  — keeps the pill button under ~150px wide so it
//                  doesn't push past the right edge of the strip.
//   ctaUrl  500  — URLs don't visually break layout (rendered as a
//                  button); generous limit lets long tracking links
//                  through.
//
// The Hub Step 4 form, dashboard composer, server validator, and
// applier schema all import from here so a change in one place
// applies everywhere automatically.

export const OFFER_HEADLINE_MAX = 70;
export const OFFER_BODY_MAX = 140;
export const OFFER_CTA_LABEL_MAX = 22;
export const OFFER_CTA_URL_MAX = 500;
