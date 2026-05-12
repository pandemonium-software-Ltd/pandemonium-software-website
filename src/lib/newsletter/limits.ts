// Newsletter module — length + count limits in one place.
//
// Same single-source pattern as offers/limits.ts: Hub form,
// dashboard composer, server validator + schema all import here
// so a change applies everywhere.

// ---------- Customer-side input ----------
// Sender name appears in the inbox From line — short helps it
// not get truncated in the recipient's inbox preview.
export const NEWSLETTER_SENDER_NAME_MAX = 60;
// Local part of the sender email. RFC 5321 allows 64 chars;
// we cap at 32 for the same readability reason. e.g. "news",
// "hello", "monthly-update".
export const NEWSLETTER_SENDER_LOCAL_MAX = 32;
// Subscribe widget copy — short tagline + button label.
export const NEWSLETTER_WIDGET_HEADLINE_MAX = 60;
export const NEWSLETTER_WIDGET_BODY_MAX = 140;
export const NEWSLETTER_WIDGET_CTA_MAX = 22;

// ---------- Composer (Phase 1B) ----------
// Newsletter subject — Gmail/Outlook truncate around 60-70 chars.
export const NEWSLETTER_SUBJECT_MAX = 80;
// Total body length across all paragraphs. Aim for short-form;
// long emails kill open rates.
export const NEWSLETTER_BODY_MAX = 2000;
// Per-paragraph cap to nudge customers toward scannable writing.
export const NEWSLETTER_PARAGRAPH_MAX = 500;

// ---------- Subscriber storage ----------
// Cap to keep the onboarding-data JSON blob under Notion's
// 200KB chunked-rich-text ceiling. ~100 bytes per subscriber
// at 1000 subscribers = ~100KB. When customers approach this,
// we migrate to a dedicated Notion DB (or D1) — flagged at
// 800/1000.
export const SUBSCRIBER_CAP_PER_CUSTOMER = 1000;
export const SUBSCRIBER_WARN_AT = 800;
// Email + first name caps — typical hard limits in mailing
// systems.
export const SUBSCRIBER_EMAIL_MAX = 254;
export const SUBSCRIBER_FIRST_NAME_MAX = 60;

// ---------- Sending ----------
// Built-in monthly send limit per customer (the £6/mo Newsletter
// fee includes one send). Extra sends require operator approval
// in Phase 2.
export const NEWSLETTER_MONTHLY_SEND_LIMIT = 1;
// History entries kept in the prospect's onboardingData blob.
// 24 = two years of monthly sends.
export const NEWSLETTER_HISTORY_CAP = 24;
