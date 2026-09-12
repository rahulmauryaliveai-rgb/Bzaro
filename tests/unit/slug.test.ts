import { describe, expect, it } from "vitest";
import { checkSlug, isReservedSubdomain } from "@/lib/tenant/reserved";
import { SLUG_PATTERN } from "@/lib/tenant/reserved";

/**
 * Slug validation.
 *
 * A seller's slug IS their subdomain, so these rules are routing and security
 * constraints rather than cosmetic ones.
 */

describe("checkSlug", () => {
  it("accepts ordinary business slugs", () => {
    expect(checkSlug("abc-electronics").ok).toBe(true);
    expect(checkSlug("sharma-steel").ok).toBe(true);
    expect(checkSlug("tata123").ok).toBe(true);
  });

  it("rejects slugs that are too short or too long", () => {
    expect(checkSlug("ab")).toMatchObject({ ok: false, reason: "too_short" });
    expect(checkSlug("a".repeat(64))).toMatchObject({ ok: false, reason: "too_long" });
  });

  it("rejects dots", () => {
    // A dot produces a.b.bzaro.in, which a one-level wildcard
    // certificate does not cover — the site would fail TLS entirely.
    expect(checkSlug("abc.electronics")).toMatchObject({
      ok: false,
      reason: "invalid_characters",
    });
  });

  it("rejects leading and trailing hyphens", () => {
    expect(checkSlug("-abc").ok).toBe(false);
    expect(checkSlug("abc-").ok).toBe(false);
  });

  it("rejects uppercase, spaces and underscores", () => {
    expect(checkSlug("ABC Electronics").ok).toBe(false);
    expect(checkSlug("abc_electronics").ok).toBe(false);
  });

  it("rejects infrastructure hostnames", () => {
    // Squatting these would shadow a platform service for every tenant.
    for (const label of ["www", "api", "mail", "cdn", "ns1"]) {
      expect(checkSlug(label)).toMatchObject({ ok: false, reason: "reserved" });
    }
  });

  it("rejects platform surfaces", () => {
    // Reserved so a tenant cannot impersonate the platform to its own users.
    for (const label of ["admin", "login", "billing", "support", "security"]) {
      expect(checkSlug(label)).toMatchObject({ ok: false, reason: "reserved" });
    }
  });

  it("rejects punycode", () => {
    // IDN labels enable homograph attacks against other tenants.
    expect(checkSlug("xn--80ak6aa92e")).toMatchObject({ ok: false, reason: "punycode" });
  });

  it("normalises case and surrounding whitespace before validating", () => {
    expect(checkSlug("  ABC-Electronics  ").ok).toBe(true);
  });
});

describe("isReservedSubdomain", () => {
  it("is case-insensitive", () => {
    expect(isReservedSubdomain("WWW")).toBe(true);
    expect(isReservedSubdomain("Admin")).toBe(true);
  });
});

describe("SLUG_PATTERN", () => {
  it("matches the database CHECK constraint", () => {
    // Seller_slug_format in the init migration uses this exact expression. If
    // the two drift, a slug passes validation and then fails on insert with an
    // opaque constraint error.
    expect(SLUG_PATTERN.source).toBe("^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$");
  });
});
