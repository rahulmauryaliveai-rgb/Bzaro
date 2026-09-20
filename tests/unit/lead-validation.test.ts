import { describe, expect, it } from "vitest";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validation/otp";
import { requirementFingerprint, requirementSchema } from "@/lib/validation/requirement";
import { DEFAULT_LEAD_SETTINGS, leadSettingsSchema } from "@/lib/validation/lead-settings";
import { discoveryTags } from "@/lib/cache/tags";

describe("requestOtpSchema", () => {
  it("normalises the phone as part of parsing", () => {
    const parsed = requestOtpSchema.parse({ phone: "98765 43210", purpose: "BUYER_CONTACT" });
    expect(parsed.phone).toBe("+919876543210");
  });

  it("rejects an unparseable phone with buyer-facing copy", () => {
    const result = requestOtpSchema.safeParse({ phone: "12345", purpose: "BUYER_CONTACT" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/valid mobile number/);
    }
  });

  it("rejects a filled honeypot", () => {
    expect(
      requestOtpSchema.safeParse({ phone: "9876543210", purpose: "BUYER_CONTACT", website: "x" })
        .success,
    ).toBe(false);
  });
});

describe("verifyOtpSchema", () => {
  it("requires exactly six digits and records consent as a boolean", () => {
    const ok = verifyOtpSchema.parse({
      phone: "9876543210",
      purpose: "BUYER_CONTACT",
      code: " 004213 ",
      consent: "on",
    });
    expect(ok.code).toBe("004213");
    expect(ok.consent).toBe(true);

    const noConsent = verifyOtpSchema.parse({
      phone: "9876543210",
      purpose: "SELLER_SIGNUP",
      code: "123456",
    });
    expect(noConsent.consent).toBe(false);

    expect(
      verifyOtpSchema.safeParse({ phone: "9876543210", purpose: "BUYER_CONTACT", code: "12345" })
        .success,
    ).toBe(false);
  });
});

describe("requirementSchema", () => {
  const base = {
    productName: "LED Bulb 9W",
    quantity: "500",
    quantityUnit: "pieces",
    locationId: "loc_1",
    timeline: "WITHIN_WEEK",
    purpose: "RESALE",
  };

  it("coerces quantity from form strings and blanks optional fields", () => {
    const parsed = requirementSchema.parse({ ...base, notes: "", productId: "", name: "" });
    expect(parsed.quantity).toBe(500);
    expect(parsed.notes).toBeUndefined();
    expect(parsed.productId).toBeUndefined();
    expect(parsed.name).toBeUndefined();
  });

  it("rejects zero, fractional and unknown-unit quantities", () => {
    expect(requirementSchema.safeParse({ ...base, quantity: "0" }).success).toBe(false);
    expect(requirementSchema.safeParse({ ...base, quantity: "1.5" }).success).toBe(false);
    expect(requirementSchema.safeParse({ ...base, quantityUnit: "dozen" }).success).toBe(false);
  });
});

describe("requirementFingerprint", () => {
  it("ignores case, punctuation and spacing but not category", () => {
    const a = requirementFingerprint("LED Bulb 9W", "cat_1");
    expect(requirementFingerprint("led   bulb, 9w!", "cat_1")).toBe(a);
    expect(requirementFingerprint("LED Bulb 9W", "cat_2")).not.toBe(a);
    expect(requirementFingerprint("LED Bulb 12W", "cat_1")).not.toBe(a);
  });
});

describe("leadSettingsSchema", () => {
  it("accepts the defaults", () => {
    expect(leadSettingsSchema.safeParse(DEFAULT_LEAD_SETTINGS).success).toBe(true);
  });

  it("rejects min > max sellers", () => {
    const bad = {
      ...DEFAULT_LEAD_SETTINGS,
      market: { minSellers: 11, maxSellers: 10, expiryHours: 48 },
    };
    expect(leadSettingsSchema.safeParse(bad).success).toBe(false);
  });
});

describe("discoveryTags", () => {
  it("covers home, every category, every city and every city x category pair once", () => {
    const tags = discoveryTags({ categoryIds: ["c1", "c2"], locationIds: ["l1"] });
    expect(tags).toEqual(
      expect.arrayContaining([
        "home",
        "discovery:category:c1",
        "discovery:category:c2",
        "discovery:city:l1",
        "discovery:popular:l1",
        "discovery:city:l1:category:c1",
        "discovery:city:l1:category:c2",
      ]),
    );
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toHaveLength(7);
  });
});
