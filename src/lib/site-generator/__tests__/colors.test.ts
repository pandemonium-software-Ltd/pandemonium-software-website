// Brand-colour utility tests.
//
// Covers: tonal-scale generation (10 shades from 1 hex), accessible
// text-colour pick (white-vs-near-black for contrast), and the CSS
// custom-property block emitter.

import { describe, expect, test } from "vitest";
import {
  generateTonalScale,
  pickAccessibleText,
  renderColorVariables,
} from "../colors";

describe("generateTonalScale", () => {
  test("preserves the input hex as the 500 step", () => {
    const scale = generateTonalScale("#3d6591");
    expect(scale[500]).toBe("#3d6591");
  });

  test("produces lighter shades for 50-400, darker for 600-900", () => {
    const scale = generateTonalScale("#3d6591");
    // Light ones should be brighter than 500.
    expect(brightness(scale[50])).toBeGreaterThan(brightness(scale[500]));
    expect(brightness(scale[400])).toBeGreaterThan(brightness(scale[500]));
    // Dark ones darker.
    expect(brightness(scale[600])).toBeLessThan(brightness(scale[500]));
    expect(brightness(scale[900])).toBeLessThan(brightness(scale[500]));
    // Monotonic.
    expect(brightness(scale[50])).toBeGreaterThan(brightness(scale[100]));
    expect(brightness(scale[100])).toBeGreaterThan(brightness(scale[200]));
    expect(brightness(scale[800])).toBeGreaterThan(brightness(scale[900]));
  });

  test("handles 3-digit hex shorthand", () => {
    const scale = generateTonalScale("#abc");
    expect(scale[500]).toBe("#abc"); // input preserved
    expect(scale[100]).toMatch(/^#[0-9a-f]{6}$/i); // expanded form
  });

  test("throws on invalid hex", () => {
    // Cast for runtime-defence test — value is well-typed at TS level
    // because the brand is a structural template literal type.
    expect(() => generateTonalScale("#zzz123" as `#${string}`)).toThrow(
      /Invalid hex/,
    );
    expect(() => generateTonalScale("not-a-hex" as `#${string}`)).toThrow(
      /Invalid hex/,
    );
  });
});

describe("pickAccessibleText", () => {
  test("returns white for dark backgrounds", () => {
    expect(pickAccessibleText({ r: 10, g: 20, b: 34 })).toBe("#ffffff");
    expect(pickAccessibleText({ r: 0, g: 0, b: 0 })).toBe("#ffffff");
  });

  test("returns near-black for light backgrounds", () => {
    expect(pickAccessibleText({ r: 250, g: 247, b: 240 })).toBe("#0a1422");
    expect(pickAccessibleText({ r: 255, g: 255, b: 255 })).toBe("#0a1422");
  });
});

describe("renderColorVariables", () => {
  test("emits a :root block with both primary + secondary 50-900 + text", () => {
    const css = renderColorVariables({
      primary: "#3d6591",
      secondary: "#f97316",
    });
    expect(css).toMatch(/^:root \{/);
    expect(css).toContain("--brand-primary-500: #3d6591;");
    expect(css).toContain("--brand-secondary-500: #f97316;");
    expect(css).toContain("--brand-primary-50:");
    expect(css).toContain("--brand-primary-900:");
    expect(css).toContain("--brand-primary-text:");
    expect(css).toContain("--brand-secondary-text:");
  });
});

// Helper — sum of channels as a quick "brightness" proxy.
function brightness(hex: string): number {
  const c = hex.replace("#", "");
  return (
    parseInt(c.slice(0, 2), 16) +
    parseInt(c.slice(2, 4), 16) +
    parseInt(c.slice(4, 6), 16)
  );
}
