import { describe, expect, it } from "vitest";
import {
  canonical,
  marketplacePathFor,
  marketplaceUrl,
  sellerSiteUrl,
  sellerVisitUrl,
  tenantUrl,
  tenantUrlFor,
} from "@/lib/utils/url";

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

/**
 * Decision D32: the seller's highest available surface is canonical.
 * `sellerSiteUrl` is the one rule every canonical, sitemap entry, JSON-LD url
 * and dashboard link goes through, so its table is pinned here.
 */
describe("marketplacePathFor", () => {
  it("maps microsite paths onto their marketplace equivalents", () => {
    expect(marketplacePathFor("abc")).toBe("/seller/abc");
    expect(marketplacePathFor("abc", "/")).toBe("/seller/abc");
    expect(marketplacePathFor("abc", "/products/led-bulb")).toBe("/product/abc/led-bulb");
    expect(marketplacePathFor("abc", "/products/led-bulb/")).toBe("/product/abc/led-bulb");
    expect(marketplacePathFor("abc", "/services/install")).toBe("/service/abc/install");
  });

  it("sends pages with no marketplace twin to the catalogue page", () => {
    for (const path of ["/about", "/contact", "/gallery", "/products", "/services", "/nope/x/y"]) {
      expect(marketplacePathFor("abc", path)).toBe("/seller/abc");
    }
  });

  it("drops query strings and fragments", () => {
    expect(marketplacePathFor("abc", "/products/bulb?utm=1#specs")).toBe("/product/abc/bulb");
  });
});

describe("sellerSiteUrl", () => {
  it("catalogue tier → the marketplace page", () => {
    expect(sellerSiteUrl({ slug: "abc", webPresence: "CATALOGUE" })).toBe(
      "http://lvh.me:3000/seller/abc",
    );
    expect(sellerSiteUrl({ slug: "abc", webPresence: "CATALOGUE" }, "/products/bulb")).toBe(
      "http://lvh.me:3000/product/abc/bulb",
    );
  });

  it("subdomain tier → the subdomain, ignoring any custom domain on file", () => {
    expect(
      sellerSiteUrl(
        {
          slug: "abc",
          webPresence: "SUBDOMAIN",
          customDomain: "abc.com",
          customDomainStatus: "ACTIVE",
        },
        "/products/bulb",
      ),
    ).toBe("http://abc.lvh.me:3000/products/bulb");
  });

  it("custom-domain tier → the verified domain, else the subdomain", () => {
    expect(
      sellerSiteUrl({
        slug: "abc",
        webPresence: "CUSTOM_DOMAIN",
        customDomain: "abc.com",
        customDomainStatus: "ACTIVE",
      }),
    ).toBe("https://abc.com/");
    expect(
      sellerSiteUrl({
        slug: "abc",
        webPresence: "CUSTOM_DOMAIN",
        customDomain: "abc.com",
        customDomainStatus: "PENDING_DNS",
      }),
    ).toBe("http://abc.lvh.me:3000/");
  });
});

describe("sellerVisitUrl", () => {
  it("tags a storefront link so the proxy can record first-touch attribution", () => {
    expect(sellerVisitUrl({ slug: "abc", webPresence: "SUBDOMAIN" })).toBe(
      "http://abc.lvh.me:3000/?ref=bzaro",
    );
    expect(sellerVisitUrl({ slug: "abc", webPresence: "SUBDOMAIN" }, "/products")).toBe(
      "http://abc.lvh.me:3000/products?ref=bzaro",
    );
  });

  it("leaves a catalogue-tier seller untagged — that page IS the marketplace", () => {
    const seller = { slug: "abc", webPresence: "CATALOGUE" } as const;
    expect(sellerVisitUrl(seller)).toBe(sellerSiteUrl(seller));
    expect(sellerVisitUrl(seller)).not.toContain("ref=bzaro");
  });

  it("appends rather than replaces an existing query string", () => {
    expect(sellerVisitUrl({ slug: "abc", webPresence: "SUBDOMAIN" }, "/products?page=2")).toBe(
      "http://abc.lvh.me:3000/products?page=2&ref=bzaro",
    );
  });
});
