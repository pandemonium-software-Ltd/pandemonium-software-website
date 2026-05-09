// Engine tests for renderTemplate. Pure unit tests — no fixtures,
// no template registry. The fixture-driven golden tests live in
// golden.test.ts.

import { describe, expect, test } from "vitest";
import { renderTemplate } from "../render";
import type { Template } from "../types";

const minimal: Template = {
  id: "test",
  riskTier: "low",
  subject: "Hi {{name}}",
  body: "Body for {{name}}.",
  required: ["name"],
};

describe("renderTemplate", () => {
  test("interpolates simple {{key}} substitution", () => {
    const out = renderTemplate(minimal, { name: "Alex" });
    expect(out.subject).toBe("Hi Alex");
    expect(out.body).toBe("Body for Alex.");
  });

  test("throws on missing required value", () => {
    expect(() => renderTemplate(minimal, {})).toThrow(
      "Template 'test' missing required values: name",
    );
  });

  test("throws listing all missing keys, not just the first", () => {
    const t: Template = { ...minimal, required: ["name", "date", "site"] };
    expect(() => renderTemplate(t, { name: "Alex" })).toThrow(
      "Template 'test' missing required values: date, site",
    );
  });

  test("handles {{#if key}}...{{/if}} when truthy", () => {
    const t: Template = {
      ...minimal,
      body: "Hi{{#if hasNote}}, note: yes{{/if}}.",
      required: [],
    };
    expect(renderTemplate(t, { hasNote: true }).body).toBe(
      "Hi, note: yes.",
    );
  });

  test("handles {{#if key}}...{{/if}} when falsy", () => {
    const t: Template = {
      ...minimal,
      body: "Hi{{#if hasNote}}, note: yes{{/if}}.",
      required: [],
    };
    expect(renderTemplate(t, { hasNote: false }).body).toBe("Hi.");
  });

  test("handles {{#if}} when key absent (treated as falsy)", () => {
    const t: Template = {
      ...minimal,
      body: "Hi{{#if hasNote}}, note: yes{{/if}}.",
      required: [],
    };
    expect(renderTemplate(t, {}).body).toBe("Hi.");
  });

  test("handles multi-line conditional block", () => {
    const t: Template = {
      ...minimal,
      body: "Line 1\n{{#if extra}}Line 2\nLine 3\n{{/if}}Line 4",
      required: [],
    };
    expect(renderTemplate(t, { extra: true }).body).toBe(
      "Line 1\nLine 2\nLine 3\nLine 4",
    );
    expect(renderTemplate(t, { extra: false }).body).toBe("Line 1\nLine 4");
  });

  test("leaves unknown {{key}} unreplaced (so QA spots them)", () => {
    const t: Template = {
      ...minimal,
      body: "Hi {{name}}, {{mystery}}.",
      required: ["name"],
    };
    expect(renderTemplate(t, { name: "Alex" }).body).toBe(
      "Hi Alex, {{mystery}}.",
    );
  });

  test("coerces number values to strings", () => {
    const t: Template = {
      ...minimal,
      subject: "Count: {{count}}",
      body: "",
      required: ["count"],
    };
    expect(renderTemplate(t, { count: 42 }).subject).toBe("Count: 42");
  });

  test("treats {{#if}} value of 0 as falsy", () => {
    const t: Template = {
      ...minimal,
      body: "{{#if count}}some{{/if}}",
      required: [],
    };
    expect(renderTemplate(t, { count: 0 }).body).toBe("");
    expect(renderTemplate(t, { count: 1 }).body).toBe("some");
  });

  test("treats {{#if}} value of empty string as falsy", () => {
    const t: Template = {
      ...minimal,
      body: "{{#if name}}some{{/if}}",
      required: [],
    };
    expect(renderTemplate(t, { name: "" }).body).toBe("");
    expect(renderTemplate(t, { name: "x" }).body).toBe("some");
  });
});
