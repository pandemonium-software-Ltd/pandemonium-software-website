// Coverage lock for vibe-recommendations: every BUSINESS_TYPE_OPTIONS
// entry must have a corresponding entry in VIBE_BY_BUSINESS_TYPE.
// Adding a new businessType to schemas.ts without a vibe mapping
// here would silently fall back to "modern" — the test makes that
// noisy at build time instead.

import { describe, expect, test } from "vitest";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/schemas";
import {
  VIBE_BY_BUSINESS_TYPE,
  VIBE_BEST_FOR,
  VIBE_FEATURES,
  recommendedVibeFor,
  STRUCTURE_BY_BUSINESS_TYPE,
  STRUCTURE_BEST_FOR,
  STRUCTURE_FEATURES,
  recommendedStructureFor,
} from "@/lib/vibe-recommendations";

const ALL_VIBES = ["modern", "traditional", "premium", "friendly"] as const;
const ALL_STRUCTURES = [
  "services",
  "showcase",
  "booking",
  "editorial",
] as const;

describe("VIBE_BY_BUSINESS_TYPE coverage", () => {
  test("every BUSINESS_TYPE_OPTIONS entry has a recommended vibe", () => {
    const missing = BUSINESS_TYPE_OPTIONS.filter(
      (bt) => !VIBE_BY_BUSINESS_TYPE[bt],
    );
    expect(missing).toEqual([]);
  });

  test("every recommended vibe is one of the four canonical vibes", () => {
    for (const [bt, vibe] of Object.entries(VIBE_BY_BUSINESS_TYPE)) {
      expect(ALL_VIBES, `unexpected vibe for ${bt}: ${vibe}`).toContain(vibe);
    }
  });

  test("no extraneous business types in the mapping (catches typos)", () => {
    const valid = new Set(BUSINESS_TYPE_OPTIONS as readonly string[]);
    const extras = Object.keys(VIBE_BY_BUSINESS_TYPE).filter(
      (k) => !valid.has(k),
    );
    expect(extras).toEqual([]);
  });
});

describe("VIBE_BEST_FOR / VIBE_FEATURES coverage", () => {
  for (const vibe of ALL_VIBES) {
    test(`'${vibe}' has best-for copy + features`, () => {
      expect(VIBE_BEST_FOR[vibe]?.length).toBeGreaterThan(0);
      expect(VIBE_FEATURES[vibe]?.length).toBeGreaterThan(0);
    });
  }
});

describe("recommendedVibeFor", () => {
  test("returns the mapped vibe for a known businessType", () => {
    expect(recommendedVibeFor("Plumber")).toBe("friendly");
    expect(recommendedVibeFor("Solicitor")).toBe("traditional");
    expect(recommendedVibeFor("Photographer")).toBe("premium");
    expect(recommendedVibeFor("Locksmith")).toBe("modern");
  });

  test("returns 'modern' for unknown / missing inputs", () => {
    expect(recommendedVibeFor(undefined)).toBe("modern");
    expect(recommendedVibeFor("")).toBe("modern");
    expect(recommendedVibeFor("Astronaut")).toBe("modern");
  });
});

describe("STRUCTURE_BY_BUSINESS_TYPE coverage", () => {
  test("every BUSINESS_TYPE_OPTIONS entry has a recommended structure", () => {
    const missing = BUSINESS_TYPE_OPTIONS.filter(
      (bt) => !STRUCTURE_BY_BUSINESS_TYPE[bt],
    );
    expect(missing).toEqual([]);
  });

  test("every recommended structure is one of the four canonical structures", () => {
    for (const [bt, s] of Object.entries(STRUCTURE_BY_BUSINESS_TYPE)) {
      expect(ALL_STRUCTURES, `unexpected structure for ${bt}: ${s}`).toContain(s);
    }
  });

  test("no extraneous business types in the structure mapping", () => {
    const valid = new Set(BUSINESS_TYPE_OPTIONS as readonly string[]);
    const extras = Object.keys(STRUCTURE_BY_BUSINESS_TYPE).filter(
      (k) => !valid.has(k),
    );
    expect(extras).toEqual([]);
  });
});

describe("STRUCTURE_BEST_FOR / STRUCTURE_FEATURES coverage", () => {
  for (const s of ALL_STRUCTURES) {
    test(`'${s}' has best-for copy + features`, () => {
      expect(STRUCTURE_BEST_FOR[s]?.length).toBeGreaterThan(0);
      expect(STRUCTURE_FEATURES[s]?.length).toBeGreaterThan(0);
    });
  }
});

describe("recommendedStructureFor", () => {
  test("returns the mapped structure for a known businessType", () => {
    expect(recommendedStructureFor("Plumber")).toBe("services");
    expect(recommendedStructureFor("Photographer")).toBe("showcase");
    expect(recommendedStructureFor("Therapist")).toBe("booking");
    expect(recommendedStructureFor("Solicitor")).toBe("editorial");
  });

  test("returns 'services' for unknown / missing inputs", () => {
    expect(recommendedStructureFor(undefined)).toBe("services");
    expect(recommendedStructureFor("")).toBe("services");
    expect(recommendedStructureFor("Astronaut")).toBe("services");
  });
});
