// Tests for the Places URL parser. fetchPlaceDetails +
// findPlaceByQuery are thin wrappers around fetch — covered
// at the integration layer (step3-tools.test.ts mocks the
// outbound fetch directly), so no unit tests for them here.

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  extractPlaceIdFromMapsUrl,
  parseMapsUrl,
  resolveMapsShortUrl,
} from "@/lib/google-places";

describe("extractPlaceIdFromMapsUrl", () => {
  test("returns null for empty / invalid input", () => {
    expect(extractPlaceIdFromMapsUrl("")).toBeNull();
    expect(extractPlaceIdFromMapsUrl("not a url")).toBeNull();
    expect(extractPlaceIdFromMapsUrl("https://example.com/")).toBeNull();
  });

  test("extracts place_id from explicit ?q=place_id:... query", () => {
    expect(
      extractPlaceIdFromMapsUrl(
        "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4",
      ),
    ).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
  });

  test("extracts place_id from path-embedded place_id:...", () => {
    expect(
      extractPlaceIdFromMapsUrl(
        "https://www.google.com/maps/place/place_id:ChIJabcDEF1234567890",
      ),
    ).toBe("ChIJabcDEF1234567890");
  });

  test("returns null for share-card URLs without explicit place_id", () => {
    // Most Google Maps share links look like this — name + coords
    // + opaque !1s hex. We deliberately don't try to decode these
    // because the text-search fallback is more reliable.
    expect(
      extractPlaceIdFromMapsUrl(
        "https://www.google.com/maps/place/Bens+Cafe/@51.7521,-1.2577,17z/data=!3m1!4b1!4m6!3m5!1s0x4876c403c5c1a3:0xabcdef",
      ),
    ).toBeNull();
  });
});

describe("parseMapsUrl", () => {
  test("lifts business name + lat/lng from a typical share URL", () => {
    const hints = parseMapsUrl(
      "https://www.google.com/maps/place/Bens+Cafe/@51.7521,-1.2577,17z/data=!3m1!4b1",
    );
    expect(hints.name).toBe("Bens Cafe");
    expect(hints.lat).toBeCloseTo(51.7521, 4);
    expect(hints.lng).toBeCloseTo(-1.2577, 4);
    expect(hints.placeId).toBeUndefined();
  });

  test("handles negative lat/lng", () => {
    const hints = parseMapsUrl(
      "https://www.google.com/maps/place/Outback+Coffee/@-33.8688,151.2093,17z/",
    );
    expect(hints.lat).toBeCloseTo(-33.8688, 4);
    expect(hints.lng).toBeCloseTo(151.2093, 4);
  });

  test("decodes URL-encoded business names + + characters", () => {
    const hints = parseMapsUrl(
      "https://www.google.com/maps/place/Bob%27s%20Pizza%20%26%20Pasta/@51.5,-0.1,17z/",
    );
    expect(hints.name).toBe("Bob's Pizza & Pasta");
  });

  test("falls back to ?q= when no /place segment", () => {
    const hints = parseMapsUrl(
      "https://www.google.com/maps/?q=Bens+Cafe+Oxford",
    );
    // URLSearchParams auto-decodes + to space — fine for us, the
    // result feeds directly into Places API textQuery.
    expect(hints.name).toBe("Bens Cafe Oxford");
  });

  test("returns empty object for non-Maps URLs", () => {
    expect(parseMapsUrl("https://example.com/")).toEqual({});
    expect(parseMapsUrl("")).toEqual({});
  });
});

describe("resolveMapsShortUrl", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("returns input unchanged when not a maps.app.goo.gl URL", async () => {
    expect(
      await resolveMapsShortUrl("https://www.google.com/maps/place/Foo"),
    ).toBe("https://www.google.com/maps/place/Foo");
  });

  test("follows the redirect chain to the canonical URL", async () => {
    // Use a hand-rolled stub instead of `new Response()` — Node's
    // Response constructor strips Location on 3xx in some
    // versions, masking the header from our reader.
    const stub = {
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "location"
            ? "https://www.google.com/maps/place/Bens+Cafe/@51.7521,-1.2577,17z/"
            : null,
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue(stub) as unknown as typeof fetch;

    const out = await resolveMapsShortUrl("https://maps.app.goo.gl/abc123");
    expect(out).toBe(
      "https://www.google.com/maps/place/Bens+Cafe/@51.7521,-1.2577,17z/",
    );
  });

  test("returns input on network failure (caller falls back to raw URL parse)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip")) as unknown as typeof fetch;
    expect(await resolveMapsShortUrl("https://maps.app.goo.gl/x")).toBe(
      "https://maps.app.goo.gl/x",
    );
  });
});
