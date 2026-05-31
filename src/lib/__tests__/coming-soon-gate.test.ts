import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Import the middleware directly from the customer-site-template.
// It only depends on next/server (shared dep), no project-local imports.
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
    // NextResponse.next() has no Location header and no rewrite URL
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  // ---- COMING_SOON gate ----

  it("rewrites to /coming-soon for public visitors when COMING_SOON is set", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/"));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe("/coming-soon");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("rewrites to /coming-soon for deep paths too", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/services"));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe("/coming-soon");
  });

  it("grants access via ?pa= query param and sets cookie", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/", { query: { pa: ACCESS_TOKEN } }));
    // Should redirect (strip the ?pa= param)
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    expect(new URL(location!).searchParams.has("pa")).toBe(false);
    // Should set the preview-access cookie
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
    // Should pass through (no rewrite, no redirect)
    const rewrite = res.headers.get("x-middleware-rewrite");
    const location = res.headers.get("location");
    expect(rewrite).toBeNull();
    expect(location).toBeNull();
  });

  it("rejects wrong ?pa= token", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/", { query: { pa: "wrong-token" } }));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe("/coming-soon");
  });

  it("rejects wrong cookie token", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(
      makeRequest("/", { cookie: "pf_preview_access=wrong-token" }),
    );
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe("/coming-soon");
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
    expect(location).toBeTruthy();
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

  it("does NOT add frame-ancestors on coming-soon rewrite (public page)", () => {
    process.env.COMING_SOON = "true";
    process.env.PREVIEW_ACCESS_TOKEN = ACCESS_TOKEN;

    const res = middleware(makeRequest("/"));
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeNull();
  });

  // ---- COMING_SOON without PREVIEW_ACCESS_TOKEN (edge case) ----

  it("rewrites to /coming-soon even without PREVIEW_ACCESS_TOKEN", () => {
    process.env.COMING_SOON = "true";

    const res = middleware(makeRequest("/"));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe("/coming-soon");
  });
});
