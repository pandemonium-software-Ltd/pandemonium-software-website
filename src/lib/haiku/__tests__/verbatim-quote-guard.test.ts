// Tests for the verbatim-quote guard on Haiku's change-request
// classifier output. The guard uses content-similarity matching
// (fuzzy substring, >60% length ratio) to pair double-quoted
// customer text with the correct Haiku-generated patch.

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
    expect(
      extractDoubleQuotedStrings(`We're updating "the tagline" don't worry.`),
    ).toEqual(["the tagline"]);
  });

  test("ignores empty / whitespace-only quoted strings", () => {
    expect(extractDoubleQuotedStrings(`Update to "" please.`)).toEqual([]);
    expect(extractDoubleQuotedStrings(`Update to "   " please.`)).toEqual([]);
  });

  test("does not cross newlines (defensive)", () => {
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
    // Haiku drops the trailing exclamation emphasis — the guard
    // restores the customer's exact quoted text via substring match.
    const out = enforceVerbatimQuotes(
      `Update tagline to "Welcome to BobBuilders - the best ever!"`,
      [patch("copy.tagline", "Welcome to BobBuilders - the best ever")],
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

  test("matches quotes to patches by content similarity, not position", () => {
    // Two quoted strings, two patches — content matching pairs them
    // correctly even if the order of patches differs from quote order.
    const out = enforceVerbatimQuotes(
      `Change about blurb to "We build amazing garden rooms" and tagline to "Garden Rooms by Bob".`,
      [
        patch("copy.tagline", "Garden Rooms by Bob - polished"),
        patch("copy.aboutBlurb", "We build amazing garden rooms for you"),
      ],
    );
    expect(out.overrideCount).toBe(2);
    expect(out.patches[0]!.newValue).toBe("Garden Rooms by Bob");
    expect(out.patches[1]!.newValue).toBe("We build amazing garden rooms");
  });

  test("non-free-text patches do NOT consume quotes", () => {
    const out = enforceVerbatimQuotes(
      `Update phone to 07123 and tagline to "Verbatim Tagline Here".`,
      [
        patch("content.aboutBullets.add", "Some bullet"),
        patch("copy.tagline", "Verbatim Tagline Here polished"),
      ],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe("Some bullet");
    expect(out.patches[1]!.newValue).toBe("Verbatim Tagline Here");
  });

  test("more quotes than free-text patches → extras ignored", () => {
    const out = enforceVerbatimQuotes(
      `Tagline "Welcome to our amazing website" + extra context "something else entirely different".`,
      [patch("copy.tagline", "Welcome to our amazing website - polished")],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe("Welcome to our amazing website");
  });

  test("fewer quotes than free-text patches → only matching patches override", () => {
    const out = enforceVerbatimQuotes(
      `Tagline "We build the best gardens in Oxford" and about blurb please make it nicer.`,
      [
        patch("copy.tagline", "We build the best gardens in Oxford, polished"),
        patch("copy.aboutBlurb", "Totally different text from Haiku"),
      ],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe("We build the best gardens in Oxford");
    expect(out.patches[1]!.newValue).toBe("Totally different text from Haiku");
  });

  test("preserves non-newValue patch fields (locators, etc.)", () => {
    const out = enforceVerbatimQuotes(
      `Update Garden Pods description to "Bespoke garden offices built to last".`,
      [
        patch("content.services.description", "Bespoke garden offices built to last, polished", {
          serviceName: "Garden Pods",
        }),
      ],
    );
    expect(out.patches[0]!.serviceName).toBe("Garden Pods");
    expect(out.patches[0]!.newValue).toBe("Bespoke garden offices built to last");
  });

  test("smart quotes (U+201C / U+201D) work the same as ASCII", () => {
    const out = enforceVerbatimQuotes(
      `Update tagline to “We are the best builders in town”.`,
      [patch("copy.tagline", "We are the best builders in town, polished")],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe("We are the best builders in town");
  });

  test("phone and email targets ARE guarded (preserves user formatting)", () => {
    const out = enforceVerbatimQuotes(
      `Update phone to "+44 7777 123456" and email to "me@example.co.uk".`,
      [
        patch("business.phoneDisplay", "+44 7777 123456"),
        patch("business.publicEmail", "me@example.co.uk"),
      ],
    );
    expect(out.overrideCount).toBe(0);
    expect(out.patches[0]!.newValue).toBe("+44 7777 123456");
    expect(out.patches[1]!.newValue).toBe("me@example.co.uk");
  });

  test("cross-contamination prevented: phone quote does not match service description", () => {
    const out = enforceVerbatimQuotes(
      `Change phone to "0788888888" and service description to "We are the best in the world so come to us"`,
      [
        patch("business.phoneDisplay", "0788888888"),
        patch("content.services.description", "We are the best in the world so come to us", {
          serviceName: "Wedding Planning",
        }),
      ],
    );
    expect(out.overrideCount).toBe(0);
    expect(out.patches[0]!.newValue).toBe("0788888888");
    expect(out.patches[1]!.newValue).toBe("We are the best in the world so come to us");
  });

  test("location patch targets are verbatim-guarded", () => {
    const out = enforceVerbatimQuotes(
      `Change Witney address to "123 High Street, Witney, OX28 6AB, polished by Haiku"`,
      [
        patch("locations.address", "123 High Street, Witney, OX28 6AB", {
          locationName: "Witney office",
        } as Record<string, string | undefined>),
      ],
    );
    expect(out.overrideCount).toBe(1);
    expect(out.patches[0]!.newValue).toBe(
      "123 High Street, Witney, OX28 6AB, polished by Haiku",
    );
  });
});
