// Tests for the Places URL parser. fetchPlaceDetails +
// findPlaceByQuery are thin wrappers around fetch — covered
// at the integration layer (step3-tools.test.ts mocks the
// outbound fetch directly), so no unit tests for them here.

import { describe, expect, test } from "vitest";
import { extractPlaceIdFromMapsUrl } from "@/lib/google-places";

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
