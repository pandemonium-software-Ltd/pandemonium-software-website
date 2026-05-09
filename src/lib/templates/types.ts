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
};

export type RenderResult = {
  subject: string;
  body: string;
};
