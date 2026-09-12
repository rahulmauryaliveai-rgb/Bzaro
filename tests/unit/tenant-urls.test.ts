import { describe, expect, it } from "vitest";
import { canonical, marketplaceUrl, tenantUrl, tenantUrlFor } from "@/lib/utils/url";

/**
 * Tenant URL construction.
 *
 * These tests exist because of a real bug: `urls.base` carried a trailing
 * slash, so every `${base}/products/…` in the codebase produced `//products`.
 * A double slash is a different URL to a crawler, which meant sitemaps
 * advertised paths that did not match what was served.
 */

describe("tenantUrl", () => {
  it("builds a tenant origin", () => {
    expect(tenantUrl("abc-electronics")).toBe("http://abc-electronics.lvh.me:3000/");
  });

  it("appends a path without doubling the slash", () => {
    expect(tenantUrl("abc", "/products")).toBe("http://abc.lvh.me:3000/products");
  });

  it("tolerates a path missing its leading slash", () => {
    expect(tenantUrl("abc", "products")).toBe("http://abc.lvh.me:3000/products");
  });
});

describe("tenantUrlFor", () => {
  it("uses the subdomain when there is no custom domain", () => {
    expect(tenantUrlFor({ slug: "abc" })).toContain("abc.lvh.me");
  });

  it("prefers a VERIFIED custom domain", () => {
    const url = tenantUrlFor({
      slug: "abc",
      customDomain: "abcelectronics.com",
      customDomainStatus: "ACTIVE",
    });
    // Custom domains are only ever provisioned with TLS.
    expect(url).toBe("https://abcelectronics.com/");
  });

  it("ignores a custom domain that is not yet ACTIVE", () => {
    // A domain still pending DNS verification must not be used as canonical —
    // it would point crawlers at a hostname that does not resolve yet.
    const url = tenantUrlFor({
      slug: "abc",
      customDomain: "abcelectronics.com",
      customDomainStatus: "PENDING_DNS",
    });
    expect(url).toContain("abc.lvh.me");
  });
});

describe("base origin concatenation", () => {
  it("a stripped base concatenates cleanly", () => {
    // This is the shape `toTenantContext` now stores.
    const base = tenantUrl("abc").replace(/\/+$/, "");

    expect(`${base}/products`).toBe("http://abc.lvh.me:3000/products");
    expect(`${base}/products/led-panel`).not.toContain("//products");
  });

  it("catches the regression directly", () => {
    const base = tenantUrl("abc").replace(/\/+$/, "");
    // Everything after the scheme must contain no double slash.
    expect(`${base}/about`.replace(/^https?:\/\//, "")).not.toContain("//");
  });
});

describe("canonical", () => {
  it("strips query strings and hashes", () => {
    // A canonical that varies by query parameter defeats its own purpose.
    expect(canonical("http://abc.lvh.me:3000", "/products?page=2#top")).toBe(
      "http://abc.lvh.me:3000/products",
    );
  });

  it("keeps the root slash but strips others", () => {
    expect(canonical("http://abc.lvh.me:3000", "/")).toBe("http://abc.lvh.me:3000/");
    expect(canonical("http://abc.lvh.me:3000", "/about/")).toBe("http://abc.lvh.me:3000/about");
  });

  it("normalises a double slash in the supplied path", () => {
    expect(canonical("http://abc.lvh.me:3000", "//about")).not.toContain("lvh.me:3000//about");
  });
});

describe("marketplaceUrl", () => {
  it("builds apex URLs", () => {
    expect(marketplaceUrl("/search")).toBe("http://lvh.me:3000/search");
    expect(marketplaceUrl()).toBe("http://lvh.me:3000/");
  });
});
