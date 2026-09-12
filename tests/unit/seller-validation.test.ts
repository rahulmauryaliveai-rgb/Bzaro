import { describe, expect, it } from "vitest";
import {
  businessRegistrationSchema,
  sellerProfileSchema,
  slugChangeSchema,
  websiteSettingsSchema,
} from "@/lib/validation/seller";

/**
 * Seller onboarding and profile validation.
 *
 * The slug field carries the most weight here: it becomes the seller's
 * permanent web address, it is enforced identically by a database CHECK
 * constraint, and getting it wrong means a site with no valid TLS certificate.
 */

const VALID_REGISTRATION = {
  businessName: "ABC Electronics",
  slug: "abc-electronics",
  phone: "+919876543210",
  locationId: "clh1234567890abcdefghijkl",
  categoryIds: ["clh1234567890abcdefghijkm"],
};

describe("businessRegistrationSchema", () => {
  it("accepts a valid registration", () => {
    expect(businessRegistrationSchema.safeParse(VALID_REGISTRATION).success).toBe(true);
  });

  it("rejects a slug containing a dot", () => {
    // A dot produces a.b.bzaro.in, which a one-label wildcard
    // certificate does not cover — the site would fail TLS entirely.
    const result = businessRegistrationSchema.safeParse({
      ...VALID_REGISTRATION,
      slug: "abc.electronics",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reserved subdomains", () => {
    for (const slug of ["www", "api", "admin", "login", "mail"]) {
      const result = businessRegistrationSchema.safeParse({ ...VALID_REGISTRATION, slug });
      expect(result.success, `${slug} should be reserved`).toBe(false);
    }
  });

  it("lowercases the slug", () => {
    const result = businessRegistrationSchema.safeParse({
      ...VALID_REGISTRATION,
      slug: "ABC-Electronics",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slug).toBe("abc-electronics");
  });

  it("requires a phone number in international format", () => {
    // wa.me needs E.164; a local-format number produces a dead WhatsApp link.
    const result = businessRegistrationSchema.safeParse({
      ...VALID_REGISTRATION,
      phone: "9876543210",
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one category", () => {
    const result = businessRegistrationSchema.safeParse({
      ...VALID_REGISTRATION,
      categoryIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("caps categories at five", () => {
    const result = businessRegistrationSchema.safeParse({
      ...VALID_REGISTRATION,
      categoryIds: Array.from({ length: 6 }, () => "clh1234567890abcdefghijkm"),
    });
    expect(result.success).toBe(false);
  });
});

describe("sellerProfileSchema", () => {
  it("accepts a profile with only a business name", () => {
    // Every other field is optional. A seller must be able to save partial
    // progress — blocking the save would strand them mid-edit.
    const result = sellerProfileSchema.safeParse({ businessName: "ABC Electronics" });
    expect(result.success).toBe(true);
  });

  it("does NOT enforce the D2 description minimum", () => {
    // The eligibility gate reports a short description as an unmet requirement
    // on the dashboard checklist. Refusing the save as well would be
    // obstruction rather than guidance.
    const result = sellerProfileSchema.safeParse({
      businessName: "ABC Electronics",
      description: "Short.",
    });
    expect(result.success).toBe(true);
  });

  it("caps the description", () => {
    const result = sellerProfileSchema.safeParse({
      businessName: "ABC",
      description: "x".repeat(6000),
    });
    expect(result.success).toBe(false);
  });

  it("validates GSTIN format when provided", () => {
    const bad = sellerProfileSchema.safeParse({ businessName: "ABC", gstin: "NOTAGSTIN" });
    expect(bad.success).toBe(false);

    const good = sellerProfileSchema.safeParse({
      businessName: "ABC",
      gstin: "27AAPFU0939F1ZV",
    });
    expect(good.success).toBe(true);
  });

  it("treats an empty GSTIN as absent rather than invalid", () => {
    const result = sellerProfileSchema.safeParse({ businessName: "ABC", gstin: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a protocol-relative logo URL", () => {
    // Same regression as the catalogue: it looks like a local path and is not.
    const result = sellerProfileSchema.safeParse({
      businessName: "ABC",
      logoUrl: "//evil.example.com/logo.png",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a logo uploaded by the development media provider", () => {
    const result = sellerProfileSchema.safeParse({
      businessName: "ABC",
      logoUrl: "/uploads/sellers/abc/logo/x.png",
    });
    expect(result.success).toBe(true);
  });

  it("requires a full URL for social links", () => {
    const bad = sellerProfileSchema.safeParse({
      businessName: "ABC",
      linkedin: "linkedin.com/company/abc",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an established year in the future", () => {
    const result = sellerProfileSchema.safeParse({
      businessName: "ABC",
      establishedYear: String(new Date().getFullYear() + 5),
    });
    expect(result.success === false || result.data?.establishedYear === undefined).toBe(true);
  });
});

describe("websiteSettingsSchema", () => {
  const VALID = {
    templateKey: "classic",
    primary: "#0f6a5b",
    accent: "#b4541a",
    background: "#ffffff",
    foreground: "#14181a",
    surface: "#f6f7f7",
    border: "#dfe4e5",
    fontPair: "plex",
    radius: "md",
    headerVariant: "classic",
    heroVariant: "cover",
  };

  it("accepts valid settings", () => {
    expect(websiteSettingsSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects a non-hex colour", () => {
    // These become CSS custom properties. Anything but a constrained hex value
    // is a style-injection vector on a shared domain (D7).
    for (const bad of ["red", "rgb(1,2,3)", "var(--x)", "red; } body {"]) {
      const result = websiteSettingsSchema.safeParse({ ...VALID, primary: bad });
      expect(result.success, `${bad} should be rejected`).toBe(false);
    }
  });

  it("warns about over-long meta titles", () => {
    const result = websiteSettingsSchema.safeParse({ ...VALID, metaTitle: "x".repeat(100) });
    expect(result.success).toBe(false);
  });
});

describe("slugChangeSchema", () => {
  it("requires explicit confirmation", () => {
    // Changing a web address breaks printed material; it must never happen as a
    // side effect of saving something else.
    const result = slugChangeSchema.safeParse({ slug: "new-name" });
    expect(result.success).toBe(false);
  });

  it("accepts a confirmed valid slug", () => {
    const result = slugChangeSchema.safeParse({ slug: "new-name", confirm: "on" });
    expect(result.success).toBe(true);
  });

  it("applies the same slug rules as registration", () => {
    const result = slugChangeSchema.safeParse({ slug: "admin", confirm: "on" });
    expect(result.success).toBe(false);
  });
});
