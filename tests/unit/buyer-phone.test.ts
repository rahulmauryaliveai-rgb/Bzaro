import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone } from "@/lib/buyer/phone";

/**
 * Phone normalisation is the identity key for buyers AND the rate-limit key
 * for OTP sends. Any two spellings that normalise differently are a duplicate
 * account and a free extra OTP.
 */

describe("normalizePhone", () => {
  it("accepts every common Indian spelling and produces one E.164 string", () => {
    const expected = "+919876543210";
    for (const input of [
      "+919876543210",
      "+91 98765 43210",
      "+91-98765-43210",
      "919876543210",
      "09876543210",
      "9876543210",
      "98765 43210",
      "(98765) 43210",
      "00919876543210",
    ]) {
      expect(normalizePhone(input), input).toBe(expected);
    }
  });

  it("keeps a foreign number that carries its own country code", () => {
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
    expect(normalizePhone("+1 (415) 555-0132")).toBe("+14155550132");
  });

  it("rejects bare numbers that are not Indian mobiles", () => {
    // Indian mobiles start 6-9; a bare 10-digit number starting 1-5 is not one.
    expect(normalizePhone("1234567890")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });

  it("rejects a plus-prefixed number outside E.164 bounds", () => {
    expect(normalizePhone("+0123456789")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("hides the last five digits of an Indian number", () => {
    expect(maskPhone("+919876543210")).toBe("+91 98765 XXXXX");
  });

  it("hides at least the last five digits of any other number", () => {
    expect(maskPhone("+447911123456")).toMatch(/^\+4479111X{5}$/);
  });
});

describe("formatPhone", () => {
  it("spaces an Indian number for display", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  });

  it("leaves other numbers alone", () => {
    expect(formatPhone("+447911123456")).toBe("+447911123456");
  });
});
