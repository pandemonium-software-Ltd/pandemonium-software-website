// Tests for the shared path-humanising helpers. Pure functions
// so the unit tests are cheap and cover the realistic UK
// small-business cases the helper exists to handle.

import { describe, expect, test } from "vitest";
import { humanizePath, isMeaningfulPath } from "@/lib/humanize-path";

describe("humanizePath", () => {
  test("home path", () => {
    expect(humanizePath("/")).toBe("Home");
    expect(humanizePath("")).toBe("Home");
  });

  test("common UK small-business paths get curated labels", () => {
    expect(humanizePath("/contact")).toBe("Contact us");
    expect(humanizePath("/about-us")).toBe("About us");
    expect(humanizePath("/our-services")).toBe("Our services");
    expect(humanizePath("/booking")).toBe("Book online");
    expect(humanizePath("/enquiries")).toBe("Enquiries");
    expect(humanizePath("/quote")).toBe("Get a quote");
    expect(humanizePath("/gallery")).toBe("Gallery");
    expect(humanizePath("/team")).toBe("The team");
    expect(humanizePath("/reviews")).toBe("Reviews");
    expect(humanizePath("/faqs")).toBe("FAQs");
  });

  test("unknown paths fall back to title-case", () => {
    expect(humanizePath("/wedding-flowers")).toBe("Wedding flowers");
    expect(humanizePath("/garden-design")).toBe("Garden design");
  });

  test("nested paths join with colon", () => {
    expect(humanizePath("/blog/my-first-post")).toBe(
      "Blog: My first post",
    );
    expect(humanizePath("/gallery/wedding-flowers")).toBe(
      "Gallery: Wedding flowers",
    );
  });

  test("query strings + hashes are stripped", () => {
    expect(humanizePath("/contact?utm=foo")).toBe("Contact us");
    expect(humanizePath("/about#team")).toBe("About us");
  });
});

describe("isMeaningfulPath", () => {
  test("real pages pass", () => {
    expect(isMeaningfulPath("/")).toBe(true);
    expect(isMeaningfulPath("/contact")).toBe(true);
    expect(isMeaningfulPath("/blog/foo")).toBe(true);
    expect(isMeaningfulPath("/our-services")).toBe(true);
  });

  test("Next.js framework chunks rejected", () => {
    expect(isMeaningfulPath("/_next/static/chunks/main.js")).toBe(false);
    expect(isMeaningfulPath("/_next/image")).toBe(false);
  });

  test("WordPress probe paths rejected", () => {
    expect(isMeaningfulPath("/wp-admin/install.php")).toBe(false);
    expect(isMeaningfulPath("/wp-login.php")).toBe(false);
    expect(isMeaningfulPath("/wp-includes/wlwmanifest.xml")).toBe(false);
    expect(isMeaningfulPath("/sito/wp-includes/wlwmanifest.xml")).toBe(false);
  });

  test("static asset paths rejected by extension", () => {
    expect(isMeaningfulPath("/favicon.ico")).toBe(false);
    expect(isMeaningfulPath("/robots.txt")).toBe(false);
    expect(isMeaningfulPath("/sitemap.xml")).toBe(false);
    expect(isMeaningfulPath("/icon.svg")).toBe(false);
    expect(isMeaningfulPath("/photo.jpg")).toBe(false);
    expect(isMeaningfulPath("/banner.webp")).toBe(false);
    expect(isMeaningfulPath("/fonts/inter.woff2")).toBe(false);
  });
});
