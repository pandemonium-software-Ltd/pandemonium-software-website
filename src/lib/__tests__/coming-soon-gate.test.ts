import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// The middleware imports `@/lib/site-data` which resolves to the
// customer-site-template's src/lib/site-data via its own tsconfig.
// Vitest resolves `@` to the main project's src/ (per vitest.config),
// so we mock the path that vitest will actually look up.
vi.mock("@/lib/site-data", () => ({
  SITE_DATA: {
    business: { name: "Test Biz" },
    brandAssets: { logoUrl: "https://example.com/logo.png" },
    colors: { primary: "#ff0000" },
  },
}));

import { middleware } from "../../../customer-site-template/src/middleware";

const BASE = "https://example-customer.co.uk";
const ACCESS_TOKEN = "test-preview-access-token-uuid";

function makeRequest(
  path: string,
  opts?: { cookie?: string; query?: Record<string, string> },
): NextRequest {
  const url = new URL(path, BASE);
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }
  const headers = new Headers();
  if (opts?.cookie) {
    headers.set("cookie", opts.cookie);
  }
  return new NextRequest(url, { headers });
}

describe("customer-site middleware — coming-soon gate", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.COMING_SOON;
    delete process.env.PREVIEW_ACCESS_TOKEN;
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  // ---- No gate (live site) ----

  it("passes through when no env vars are set (live site)", () => {
    const res = middleware(makeRequest("/"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  // ---- COMING_SOON gate ----

  it("returns inline coming-soon HTML for public visitors", async () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const body = await res.text();
    expect(body).toContain("Coming Soon");
    expect(body).toContain("Test Biz");
  });

  it("returns coming-soon for deep paths too", async () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/services"));
    const body = await res.text();
    expect(body).toContain("Coming Soon");
  });

  it("grants access via ?pa= query param (pass-through, no redirect)", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/", { query: { pa: ACCESS_TOKEN } }));
    const location = res.headers.get("location");
    expect(location).toBeNull();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("pf_preview_access");
    expect(setCookie).toContain(ACCESS_TOKEN);
  });

  it("grants access via valid cookie", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(
      makeRequest("/", { cookie: `pf_preview_access=${ACCESS_TOKEN}` }),
    );
    const rewrite = res.headers.get("x-middleware-rewrite");
    const location = res.headers.get("location");
    expect(rewrite).toBeNull();
    expect(location).toBeNull();
  });

  it("rejects wrong ?pa= token", async () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/", { query: { pa: "wrong-token" } }));
    const body = await res.text();
    expect(body).toContain("Coming Soon");
  });

  it("rejects wrong cookie token", async () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(
      makeRequest("/", { cookie: "pf_preview_access=wrong-token" }),
    );
    const body = await res.text();
    expect(body).toContain("Coming Soon");
  });

  // ---- PREVIEW_ACCESS_TOKEN only (no COMING_SOON) ----

  it("rewrites to /preview-locked when only PREVIEW_ACCESS_TOKEN is set", () => {
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/"));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe("/preview-locked");
  });

  it("grants access via ?pa= in preview-only mode", () => {
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/", { query: { pa: ACCESS_TOKEN } }));
    const location = res.headers.get("location");
    expect(location).toBeNull();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("pf_preview_access");
  });

  it("grants access via cookie in preview-only mode", () => {
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(
      makeRequest("/", { cookie: `pf_preview_access=${ACCESS_TOKEN}` }),
    );
    const rewrite = res.headers.get("x-middleware-rewrite");
    const location = res.headers.get("location");
    expect(rewrite).toBeNull();
    expect(location).toBeNull();
  });

  // ---- Security headers ----

  it("adds frame-ancestors CSP on preview-only authenticated pass-through", () => {
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(
      makeRequest("/", { cookie: `pf_preview_access=${ACCESS_TOKEN}` }),
    );
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("modu-forge.co.uk");
  });

  it("does NOT add frame-ancestors on coming-soon response", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/"));
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeNull();
  });

  // ---- COMING_SOON without PREVIEW_ACCESS_TOKEN (edge case) ----

  it("returns coming-soon HTML even without PREVIEW_ACCESS_TOKEN", async () => {
    process.env.COMING_SOON = "true";

    const res = middleware(makeRequest("/"));
    const body = await res.text();
    expect(body).toContain("Coming Soon");
    expect(body).toContain("Test Biz");
  });
});
