import { describe, expect, it } from "vitest";
import { computeCompletion, type CompletionInput } from "@/lib/onboarding/completion";
import {
  accountStepSchema,
  businessStepSchema,
  trustStepSchema,
} from "@/lib/validation/onboarding";

const empty: CompletionInput = {
  businessName: "X",
  description: null,
  logoUrl: null,
  coverImageUrl: null,
  businessType: null,
  addressLine1: null,
  postalCode: null,
  locationId: null,
  phone: null,
  whatsapp: null,
  phoneVerified: false,
  gstin: null,
  establishedYear: null,
  employeeCount: null,
  annualTurnover: null,
  certifications: [],
  categoryCount: 0,
  serviceAreaCount: 0,
  publishedProducts: 0,
  galleryItems: 0,
  websitePublished: false,
};

describe("computeCompletion", () => {
  it("is 0 for an empty profile and 100 for a full one", () => {
    expect(computeCompletion(empty).score).toBe(0);
    const full = computeCompletion({
      ...empty,
      description: "x".repeat(150),
      logoUrl: "/l.png",
      coverImageUrl: "/c.png",
      businessType: "MANUFACTURER",
      addressLine1: "Plot 1",
      postalCode: "400001",
      locationId: "loc",
      phone: "+919876543210",
      whatsapp: "+919876543210",
      phoneVerified: true,
      gstin: "27ABCDE1234F1Z5",
      establishedYear: 2010,
      employeeCount: "11-50",
      annualTurnover: "1.5 Cr - 5 Cr",
      certifications: ["ISO 9001"],
      categoryCount: 1,
      serviceAreaCount: 1,
      publishedProducts: 1,
      galleryItems: 1,
      websitePublished: true,
    });
    expect(full.score).toBe(100);
    expect(full.next).toHaveLength(0);
  });

  it("suggests the heaviest missing items first", () => {
    const result = computeCompletion(empty);
    expect(result.next.map((i) => i.key)).toEqual(["phone_verified", "description", "products"]);
    expect(result.items.reduce((sum, i) => sum + i.weight, 0)).toBe(100);
  });
});

describe("accountStepSchema", () => {
  const base = {
    name: "Rahul",
    phone: "98765 43210",
    email: "r@example.test",
    password: "long-enough-password",
    confirmPassword: "long-enough-password",
    acceptTerms: true,
  };

  it("normalises the phone and makes the OTP optional", () => {
    const parsed = accountStepSchema.parse({ ...base, otpCode: "" });
    expect(parsed.phone).toBe("+919876543210");
    expect(parsed.otpCode).toBeUndefined();
    expect(parsed.whatsapp).toBeUndefined();
  });

  it("rejects a malformed code but accepts a separate WhatsApp number", () => {
    expect(accountStepSchema.safeParse({ ...base, otpCode: "12" }).success).toBe(false);
    expect(accountStepSchema.parse({ ...base, whatsapp: "9123456789" }).whatsapp).toBe(
      "+919123456789",
    );
  });
});

describe("businessStepSchema", () => {
  it("dedupes categories and cities and drops the primary/home from the extras", () => {
    const parsed = businessStepSchema.parse({
      businessName: "Acme",
      slug: "acme-lights",
      businessType: "TRADER",
      phone: "9876543210",
      addressLine1: "Plot 1",
      postalCode: "400001",
      locationId: "cmtxwjvok0014a4utuu2kfirx",
      primaryCategoryId: "cmtxwjvok0014a4utuu2kfiry",
      secondaryCategoryIds: [
        "cmtxwjvok0014a4utuu2kfiry",
        "cmtxwjvok0014a4utuu2kfirz",
        "cmtxwjvok0014a4utuu2kfirz",
      ],
      servesLocationIds: ["cmtxwjvok0014a4utuu2kfirx", "cmtxwjvok0014a4utuu2kfira"],
    });
    expect(parsed.secondaryCategoryIds).toEqual(["cmtxwjvok0014a4utuu2kfirz"]);
    expect(parsed.servesLocationIds).toEqual(["cmtxwjvok0014a4utuu2kfira"]);
  });

  it("requires a 6-digit PIN that does not start with 0", () => {
    const base = {
      businessName: "Acme",
      slug: "acme-lights",
      businessType: "TRADER",
      phone: "9876543210",
      addressLine1: "Plot 1",
      locationId: "cmtxwjvok0014a4utuu2kfirx",
      primaryCategoryId: "cmtxwjvok0014a4utuu2kfiry",
      secondaryCategoryIds: [],
      servesLocationIds: [],
    };
    expect(businessStepSchema.safeParse({ ...base, postalCode: "040001" }).success).toBe(false);
    expect(businessStepSchema.safeParse({ ...base, postalCode: "4000" }).success).toBe(false);
    expect(businessStepSchema.safeParse({ ...base, postalCode: "400001" }).success).toBe(true);
  });
});

describe("trustStepSchema", () => {
  it("treats every field as optional and upper-cases the GSTIN", () => {
    expect(trustStepSchema.parse({ certifications: [] })).toEqual({ certifications: [] });
    expect(trustStepSchema.parse({ gstin: "27abcde1234f1z5", certifications: [] }).gstin).toBe(
      "27ABCDE1234F1Z5",
    );
    expect(trustStepSchema.safeParse({ gstin: "nope", certifications: [] }).success).toBe(false);
  });
});
