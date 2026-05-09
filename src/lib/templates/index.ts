// Template registry — single source of truth for all customer-facing
// email templates.
//
// Adding a new template:
//   1. Create a file in templates/ that exports a `Template`.
//   2. Import it here and add it to TEMPLATES.
//   3. Add at least one golden fixture in golden/ named
//      <template-id>-<scenario>.json so the golden test picks it up.
//   4. Run `npm test` and confirm both the engine tests and the
//      new fixture pass.
//
// Cowork looks up templates by id. The classifier (§11.1) maps a
// customer's classified intent → template id; this registry then
// resolves id → template; renderTemplate fills slots from Notion.

import type { Template } from "./types";
import { dnsVerified } from "./templates/dns-verified";
import { changeRequestReceived } from "./templates/change-request-received";
import { domainNameserversPending } from "./templates/domain-nameservers-pending";
import { domainZoneActive } from "./templates/domain-zone-active";

export type {
  Template,
  TemplateValues,
  RenderResult,
  RiskTier,
} from "./types";
export { renderTemplate } from "./render";

const TEMPLATES = new Map<string, Template>([
  [dnsVerified.id, dnsVerified],
  [changeRequestReceived.id, changeRequestReceived],
  [domainNameserversPending.id, domainNameserversPending],
  [domainZoneActive.id, domainZoneActive],
]);

export function getTemplate(id: string): Template {
  const template = TEMPLATES.get(id);
  if (!template) {
    throw new Error(
      `Unknown template id: '${id}'. Did you forget to register it in src/lib/templates/index.ts?`,
    );
  }
  return template;
}

export function listTemplates(): readonly Template[] {
  return Array.from(TEMPLATES.values());
}
