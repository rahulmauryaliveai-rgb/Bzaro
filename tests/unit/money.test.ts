import { describe, expect, it } from "vitest";
import { formatMoney, formatPrice, priceForSchema } from "@/lib/utils/money";

/**
 * Money formatting.
 *
 * Prices are the most scrutinised numbers on a B2B site. Getting the grouping
 * or the minor-unit conversion wrong is the kind of error a buyer notices
 * immediately and a seller never forgives.
 */

describe("formatMoney", () => {
  it("converts minor units to major", () => {
    // 129000 paise = ₹1,290, not ₹129,000.
    expect(formatMoney(129_000, "INR")).toContain("1,290");
  });

  it("uses Indian digit grouping for INR", () => {
    // en-IN groups as 12,34,567 — not the Western 1,234,567. Using the wrong
    // convention reads as foreign to the buyers this platform serves.
    const formatted = formatMoney(123_456_700, "INR");
    expect(formatted).toContain("12,34,567");
  });

  it("omits decimals for whole amounts", () => {
    expect(formatMoney(100_000, "INR")).not.toContain(".00");
  });

  it("keeps decimals when the amount has paise", () => {
    expect(formatMoney(129_050, "INR")).toContain(".5");
  });

  it("handles zero-decimal currencies", () => {
    // JPY has no minor unit: 5000 means ¥5000, not ¥50.
    expect(formatMoney(5000, "JPY")).toContain("5,000");
  });
});

describe("formatPrice", () => {
  it("says price on request when flagged", () => {
    expect(formatPrice({ minor: null, currency: "INR", onRequest: true })).toBe("Price on request");
  });

  it("says price on request when there is no price, regardless of the flag", () => {
    // A null price with onRequest=false is a data inconsistency; rendering an
    // empty string or "₹NaN" would look broken to a buyer.
    expect(formatPrice({ minor: null, currency: "INR", onRequest: false })).toBe(
      "Price on request",
    );
  });

  it("appends the unit", () => {
    const result = formatPrice({
      minor: 129_000,
      currency: "INR",
      unit: "piece",
      onRequest: false,
    });
    expect(result).toContain("/ piece");
  });

  it("renders a range when a maximum is set", () => {
    const result = formatPrice({
      minor: 18_500,
      maxMinor: 24_000,
      currency: "INR",
      onRequest: false,
    });
    expect(result).toContain("–");
    expect(result).toContain("185");
    expect(result).toContain("240");
  });

  it("ignores a maximum that is not above the minimum", () => {
    const result = formatPrice({
      minor: 24_000,
      maxMinor: 24_000,
      currency: "INR",
      onRequest: false,
    });
    expect(result).not.toContain("–");
  });
});

describe("priceForSchema", () => {
  it("emits a plain decimal for structured data", () => {
    // schema.org wants "1290.00", not "₹1,290".
    expect(priceForSchema(129_000, "INR")).toBe("1290.00");
  });

  it("omits decimals for zero-decimal currencies", () => {
    expect(priceForSchema(5000, "JPY")).toBe("5000");
  });
});
