// Tests for the verbatim-quote guard on Haiku's change-request
// classifier output. The guard is deterministic — it doesn't call
// the model — so we can unit-test the matching logic directly.
//
// Background: Haiku is asked (via Rule 15 in the prompt) to preserve
// any text the customer wrapped in double quotes verbatim. The guard
// is a belt-and-braces post-validator that overwrites any divergence,
// so even when the model "improves" the customer's wording, the
// customer's exact text wins for free-text targets.

import { describe, expect, test } from "vitest";
import {
  enforceVerbatimQuotes,
  extractDoubleQuotedStrings,
} from "../classify-change-request";

describe("extractDoubleQuotedStrings", () => {
  test("returns empty array when message has no double quotes", () => {
    expect(extractDoubleQuotedStrings("Update my phone to 07123")).toEqual([]);
  });

  test("extracts a single ASCII double-quoted span", () => {
    expect(
      extractDoubleQuotedStrings(`Update tagline to "Hello world".`),
    ).toEqual(["Hello world"]);
  });

  test("extracts multiple quoted spans in order", () => {
    expect(
      extractDoubleQuotedStrings(
        `Tagline: "First quote". About blurb: "Second quote".`,
      ),
    ).toEqual(["First quote", "Second quote"]);
  });

  test("handles Unicode smart quotes (Word / Apple keyboards)", () => {
    expect(
      extractDoubleQuotedStrings(`Update tagline to “Smart quoted”.`),
    ).toEqual(["Smart quoted"]);
  });

  test("ignores apostrophes within words", () => {
    // "we're", "don't" etc. — the regex only matches double quotes
    // so single-quote apostrophes never start/end a span.
    expect(
      extractDoubleQuotedStrings(`We're updating "the tagline" don't worry.`),
    ).toEqual(["the tagline"]);
  });

  test("ignores empty / whitespace-only quoted strings", () => {
    expect(extractDoubleQuotedStrings(`Update to "" please.`)).toEqual([]);
    expect(extractDoubleQuotedStrings(`Update to "   " please.`)).toEqual([]);
  });

  test("does not cross newlines (defensive)", () => {
    // Multi-line quoted strings would mis-bracket if a stray quote
    // appeared on a different line. Keep matches single-line.
    expect(
      extractDoubleQuotedStrings(`Update tagline to "line one\nline two".`),
    ).toEqual([]);
  });

  test("returns inner text trimmed", () => {
    expect(extractDoubleQuotedStrings(`Update to "  Hello  ".`)).toEqual([
      "Hello",
    ]);
  });
});

describe("enforceVerbatimQuotes", () => {
  const patch = (
    target: string,
    newValue: string,
    extra: Record<string, string | undefined> = {},
  ) =>
    ({
      target: target as never,
      newValue,
      ...extra,
    }) satisfies {
      target: string;
      newValue: string;
      serviceName?: string;
      faqQuestion?: string;
      testimonialName?: string;
    };

  test("no-op when message has no quoted text", () => {
    const patches = [patch("copy.tagline", "Polished version")];
    const out = enforceVerbatimQuotes(`Update tagline to something.`, patches);
    expect(out.overrideCount).toBe(0);
    expect(out.patches).toEqual(patches);
  });

  test("overrides Haiku-paraphrased tagline with verbatim quote", () => {
    // Lucas's real case: customer quoted the exact tagline, Haiku
    // "polished" it (added a period, removed "the best ever!" as
    // hypey). The guard restores the verbatim text.
    const out = enforceVerbatimQuotes(
      `Update tagline to "Welcome to BobBuilders - the best ever!"`,
      [patch("copy.tagline", "Welcome to BobBuilders.")],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe(
      "Welcome to BobBuilders - the best ever!",
    );
  });

  test("no override when Haiku already matches the quote exactly", () => {
    const out = enforceVerbatimQuotes(
      `Update tagline to "The exact words".`,
      [patch("copy.tagline", "The exact words")],
    );
    expect(out.overrideCount).toBe(0);
    expect(out.patches[0]!.newValue).toBe("The exact words");
  });

  test("matches quotes to free-text patches in order", () => {
    const out = enforceVerbatimQuotes(
      `Tagline "First" and about blurb "Second".`,
      [
        patch("copy.tagline", "First polished"),
        patch("copy.aboutBlurb", "Second polished"),
      ],
    );
    expect(out.overrideCount).toBe(2);
    expect(out.patches.map((p) => p.newValue)).toEqual(["First", "Second"]);
  });

  test("non-free-text patches do NOT consume quotes", () => {
    // "Update phone to 07777 and tagline to 'X'" — phone is NOT a
    // free-text target so it shouldn't eat the 'X' quote meant for
    // tagline. Lucas's real case spelled out this concern.
    const out = enforceVerbatimQuotes(
      `Update phone to 07123 and tagline to "Verbatim Tagline".`,
      [
        // aboutBullets.add is not free-text (it's the .add marker)
        patch("content.aboutBullets.add", "Some bullet"),
        patch("copy.tagline", "Polished tagline"),
      ],
    );
    expect(out.overrideCount).toBe(1);
    // The bullet add target should NOT have been overridden.
    expect(out.patches[0]!.newValue).toBe("Some bullet");
    // The tagline target SHOULD have picked up the only quote.
    expect(out.patches[1]!.newValue).toBe("Verbatim Tagline");
  });

  test("more quotes than free-text patches → extras ignored", () => {
    const out = enforceVerbatimQuotes(
      `Tagline "Wanted" + extra context "ignored please".`,
      [patch("copy.tagline", "Polished")],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe("Wanted");
  });

  test("fewer quotes than free-text patches → only first patches override", () => {
    const out = enforceVerbatimQuotes(
      `Tagline "Wanted" and about blurb please make it nicer.`,
      [
        patch("copy.tagline", "Polished tagline"),
        patch("copy.aboutBlurb", "Polished blurb"),
      ],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe("Wanted");
    // Customer didn't quote the blurb → Haiku's value stands.
    expect(out.patches[1]!.newValue).toBe("Polished blurb");
  });

  test("preserves non-newValue patch fields (locators, etc.)", () => {
    const out = enforceVerbatimQuotes(
      `Update Garden Pods description to "Bespoke garden offices".`,
      [
        patch("content.services.description", "Polished pods description", {
          serviceName: "Garden Pods",
        }),
      ],
    );
    expect(out.patches[0]!.serviceName).toBe("Garden Pods");
    expect(out.patches[0]!.newValue).toBe("Bespoke garden offices");
  });

  test("smart quotes (U+201C / U+201D) work the same as ASCII", () => {
    const out = enforceVerbatimQuotes(
      `Update tagline to “Smart-quoted text”.`,
      [patch("copy.tagline", "Some polish")],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe("Smart-quoted text");
  });

  test("phone and email targets ARE guarded (preserves user formatting)", () => {
    // Phone formatting matters: customer might quote "+44 7777 777777"
    // (international) vs "07777 777777" (national). The guard
    // preserves whichever they typed.
    const out = enforceVerbatimQuotes(
      `Update phone to "+44 7777 123456" and email to "me@example.co.uk".`,
      [
        patch("business.phoneDisplay", "+44 7777 123456"),
        patch("business.publicEmail", "me@example.co.uk"),
      ],
    );
    // Both already match → no overrides, but they should be guarded
    // (a divergent Haiku output WOULD be overridden).
    expect(out.overrideCount).toBe(0);
    expect(out.patches[0]!.newValue).toBe("+44 7777 123456");
    expect(out.patches[1]!.newValue).toBe("me@example.co.uk");
  });
});
