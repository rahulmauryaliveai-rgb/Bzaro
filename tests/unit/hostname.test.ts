import { describe, expect, it } from "vitest";
import { getSubdomain, isRootHost, normalizeHost, stripPort } from "@/lib/utils/url";

/**
 * Hostname parsing.
 *
 * This is the highest-leverage test file in the repository. Every request on
 * the platform is routed by these four functions, and the classic failure —
 * a port mismatch between development and production — passes every
 * server-side test and breaks only once deployed.
 */

describe("stripPort", () => {
  it("removes a port", () => {
    expect(stripPort("lvh.me:3000")).toBe("lvh.me");
    expect(stripPort("bzaro.in:443")).toBe("bzaro.in");
  });

  it("leaves a portless host alone", () => {
    expect(stripPort("bzaro.in")).toBe("bzaro.in");
  });

  it("lowercases", () => {
    expect(stripPort("BzAro.IN")).toBe("bzaro.in");
  });

  it("handles IPv6 literals", () => {
    // A naive lastIndexOf(':') would mangle these into "[::1".
    expect(stripPort("[::1]:3000")).toBe("[::1]");
    expect(stripPort("[2001:db8::1]")).toBe("[2001:db8::1]");
  });

  it("drops the trailing dot of a fully qualified name", () => {
    // "bzaro.in." is the same host but fails a naive string comparison,
    // which would send real traffic to the wrong zone.
    expect(stripPort("bzaro.in.")).toBe("bzaro.in");
  });
});

describe("normalizeHost", () => {
  it("returns null for missing or empty headers", () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost("")).toBeNull();
  });
});

describe("isRootHost", () => {
  it("matches the apex and www", () => {
    expect(isRootHost("lvh.me")).toBe(true);
    expect(isRootHost("www.lvh.me")).toBe(true);
  });

  it("does not match a tenant", () => {
    expect(isRootHost("abc-electronics.lvh.me")).toBe(false);
  });

  it("does not match a lookalike domain", () => {
    // Guards against an endsWith() implementation, which would treat an
    // attacker-controlled "evil-lvh.me" as the platform's own apex.
    expect(isRootHost("evil-lvh.me")).toBe(false);
    expect(isRootHost("notlvh.me")).toBe(false);
  });
});

describe("getSubdomain", () => {
  it("extracts a single label", () => {
    expect(getSubdomain("abc-electronics.lvh.me")).toBe("abc-electronics");
  });

  it("returns null for the apex", () => {
    expect(getSubdomain("lvh.me")).toBeNull();
  });

  it("returns null for a host outside the root domain", () => {
    expect(getSubdomain("abcelectronics.com")).toBeNull();
  });

  it("rejects multi-label hosts", () => {
    // A wildcard TLS certificate covers exactly one level, so
    // "a.b.bzaro.in" has no valid certificate and must never resolve to
    // a tenant.
    expect(getSubdomain("a.b.lvh.me")).toBeNull();
  });

  it("returns null when the label would be empty", () => {
    expect(getSubdomain(".lvh.me")).toBeNull();
  });
});
