// Re-render every golden fixture against the current template
// source. Writes the new `expected.subject` + `expected.body` back
// into the JSON file so the test suite's expectations match what
// the templates produce today.
//
// Use after editing template copy. Run BEFORE committing so the
// golden tests pass.
//
//   npx tsx scripts/regenerate-golden-fixtures.ts
//
// Each fixture's `values` and `template` are untouched — only
// expected output changes.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTemplate, renderTemplate } from "../src/lib/templates";
import type { TemplateValues } from "../src/lib/templates";

type GoldenFixture = {
  description: string;
  template: string;
  values: TemplateValues;
  expected: { subject: string; body: string };
};

const FIXTURES_DIR = join(__dirname, "..", "src/lib/templates/golden");

const fixtures = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));

let regenerated = 0;
let unchanged = 0;
for (const file of fixtures) {
  const path = join(FIXTURES_DIR, file);
  const raw = readFileSync(path, "utf-8");
  const fixture: GoldenFixture = JSON.parse(raw);
  const template = getTemplate(fixture.template);
  const out = renderTemplate(template, fixture.values);
  if (
    out.subject === fixture.expected.subject &&
    out.body === fixture.expected.body
  ) {
    unchanged++;
    continue;
  }
  fixture.expected.subject = out.subject;
  fixture.expected.body = out.body;
  // Re-write with the same indentation the old fixtures used.
  writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
  regenerated++;
  console.log(`✓ ${file}`);
}

console.log(`\n${regenerated} fixture(s) regenerated, ${unchanged} unchanged.`);
