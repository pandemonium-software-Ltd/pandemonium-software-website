// Pure template renderer.
//
// Two interpolation forms:
//   {{key}}                    → values[key] coerced to string
//   {{#if key}}...{{/if}}      → block kept iff values[key] truthy
//
// Required-value validation: throws if any key declared in
// template.required is missing from values. Lists ALL missing keys
// in one error (not just the first), so the failing caller can fix
// everything in one go.
//
// Limitations (deliberately small surface; expand only when a real
// template needs it):
//   - No nested conditionals (outer-level only).
//   - No else branch.
//   - No escape syntax for literal `{{` in output. None of our
//     customer-facing copy contains literal `{{`; if that ever
//     changes, add escape support.
//   - Unknown {{keys}} are LEFT UNREPLACED in output. This is
//     intentional — they're visually obvious in QA so a missing slot
//     never silently disappears.

import type { Template, TemplateValues, RenderResult } from "./types";

export function renderTemplate(
  template: Template,
  values: TemplateValues,
): RenderResult {
  const missing = template.required.filter((k) => !(k in values));
  if (missing.length > 0) {
    throw new Error(
      `Template '${template.id}' missing required values: ${missing.join(", ")}`,
    );
  }
  return {
    subject: interpolate(template.subject, values),
    body: interpolate(template.body, values),
  };
}

function interpolate(template: string, values: TemplateValues): string {
  // Conditionals first: {{#if key}}...{{/if}}.
  // Non-greedy match, `s` flag so `.` matches newlines (multi-line
  // blocks). No nested-if support — punt on a full parser until a
  // real template needs nesting.
  let out = template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key: string, content: string) => (values[key] ? content : ""),
  );
  // Then simple substitution: {{key}}.
  out = out.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!(key in values)) return match; // Leave unreplaced — visible to QA.
    return String(values[key]);
  });
  return out;
}
