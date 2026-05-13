// Template types for the customer-facing email cascade.
//
// Each template is the deterministic, no-LLM-in-the-path output of
// step 1 of the cascade in §11.1 — handles 90%+ of customer emails.
// Cowork's classifier (§11.1 step 2) maps a customer's classified
// intent → template id; this module then resolves id → template and
// renders subject + body from values pulled from Notion.
//
// Risk tier (§11.2) drives the §11.7 needsBenReview helper:
//   - low:    auto-send, no review
//   - medium: classifier-confidence-based; first 10 invocations of
//             any new variant route to Ben (Shadow mode)
//   - high:   always Ben review via the Cowork Drafts inbox

export type RiskTier = "low" | "medium" | "high";

export type TemplateValues = Record<string, string | number | boolean>;

export type Template = {
  /**
   * Unique id used by Cowork to look up the template after class
   * classification. Convention: kebab-case, scoped by domain
   * (e.g. `dns-verified`, `change-request-received`,
   * `monthly-report`).
   */
  id: string;

  /** §11.2 risk tier — drives auto-send vs Ben review. */
  riskTier: RiskTier;

  /** Subject line; supports `{{key}}` substitution. */
  subject: string;

  /**
   * Plain-text body; supports `{{key}}` substitution and
   * `{{#if key}}...{{/if}}` conditionals.
   */
  body: string;

  /**
   * Required value keys. `renderTemplate` throws if any are missing
   * from the values object — catches "added a slot but forgot to
   * update callers" at runtime instead of producing
   * empty-substitution emails.
   */
  required: readonly string[];

  /**
   * Optional value keys. Documented for caller clarity (and the
   * golden-fixture review process); not enforced at render time.
   * Use these for slots inside `{{#if}}...{{/if}}` conditionals.
   */
  optional?: readonly string[];

  /**
   * Optional call-to-action button. When set, the HTML version of
   * the email rendered by notify.ts wrapInBrandedHtml() includes a
   * styled button at the URL = values[cta.urlKey], with the
   * provided label. The text version is unaffected — the URL stays
   * inline in the body where the template put it. Use only when
   * there's exactly one primary action; emails without a CTA
   * (status updates, monthly reports) leave this unset.
   */
  cta?: {
    /** Key in values that holds the URL the button links to. */
    urlKey: string;
    /** Button label, e.g. "Open the form". Imperative, ≤30 chars. */
    label: string;
  };

  /**
   * Optional secondary CTA — rendered below the primary as a
   * lighter outline button. Useful for post-launch confirmation
   * emails where the customer can either "View your site" (primary)
   * or "Open dashboard" (secondary). Only valid when `cta` is also
   * set — there's no UI for a secondary-only layout.
   */
  secondaryCta?: {
    urlKey: string;
    label: string;
  };
};

export type RenderResult = {
  subject: string;
  body: string;
  /** Populated iff template.cta was set AND values[urlKey] is a non-empty string. */
  cta?: { url: string; label: string };
  /** Populated iff template.secondaryCta was set AND values[urlKey]
   *  is a non-empty string. */
  secondaryCta?: { url: string; label: string };
};
