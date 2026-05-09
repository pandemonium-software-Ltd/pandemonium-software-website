// Golden-fixture tests. Each .json fixture in ../golden declares a
// template id, the values to interpolate, and the expected
// rendered output. The test asserts deterministic output — same
// values → same email, every time.
//
// These are the "gate any template change" tests from §5 C0. If you
// edit a template body, the matching fixture(s) MUST be updated in
// the same commit; otherwise this suite fails CI.

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTemplate, renderTemplate } from "..";
import type { TemplateValues } from "../types";

type GoldenFixture = {
  description: string;
  template: string;
  values: TemplateValues;
  expected: {
    subject: string;
    body: string;
  };
};

const FIXTURES_DIR = join(__dirname, "..", "golden");
const fixtures = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));

describe("golden fixtures", () => {
  if (fixtures.length === 0) {
    test.skip("no fixtures found in src/lib/templates/golden/", () => {});
    return;
  }

  test.each(fixtures)("%s renders to expected output", (file) => {
    const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
    const fixture: GoldenFixture = JSON.parse(raw);
    const template = getTemplate(fixture.template);
    const out = renderTemplate(template, fixture.values);
    expect(out.subject).toBe(fixture.expected.subject);
    expect(out.body).toBe(fixture.expected.body);
  });
});
