import { describe, expect, it } from "vitest";
import {
  DEFAULT_INDEX_ELIGIBILITY_RULES,
  evaluateEligibility,
  indexEligibilityRulesSchema,
} from "@/lib/validation/index-eligibility";

/**
 * Index eligibility (decision D2).
 *
 * These rules are the platform's defence against a root-domain thin-content
 * penalty, so they get tested against fixtures rather than trusted.
 */

const rules = DEFAULT_INDEX_ELIGIBILITY_RULES;

function seller(overrides: Partial<Parameters<typeof evaluateEligibility>[0]> = {}) {
  return {
    status: "VERIFIED",
    businessName: "ABC Electronics",
    description: "x".repeat(200),
    logoUrl: "https://cdn.example/logo.png",
    coverImageUrl: null,
    locationId: "loc_1",
    addressLine1: "Plot 14, Industrial Estate",
    phone: "+919876543210",
    whatsapp: "+919876543210",
    email: "owner@abc.test",
    verifiedAt: new Date(),
    phoneVerified: true,
    publishedProducts: 5,
    publishedServices: 0,
    flaggedContent: 0,
    websitePublishedAt: new Date(),
    ...overrides,
  };
}

describe("evaluateEligibility", () => {
  it("passes a complete, verified seller", () => {
    const result = evaluateEligibility(seller(), rules);
    expect(result.eligible).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.score).toBe(100);
    expect(result.blockReason).toBeNull();
  });

  it("blocks a seller with a short description", () => {
    const result = evaluateEligibility(seller({ description: "We supply steel." }), rules);
    expect(result.eligible).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("description");
    expect(result.blockReason).toBe("description");
  });

  it("blocks a seller with no description at all", () => {
    const result = evaluateEligibility(seller({ description: null }), rules);
    expect(result.eligible).toBe(false);
  });

  it("blocks an unverified seller", () => {
    const result = evaluateEligibility(seller({ verifiedAt: null }), rules);
    expect(result.eligible).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("not_verified");
  });

  it("blocks a suspended seller", () => {
    const result = evaluateEligibility(seller({ status: "SUSPENDED" }), rules);
    expect(result.eligible).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("inactive");
  });

  it("blocks an unpublished website", () => {
    const result = evaluateEligibility(seller({ websitePublishedAt: null }), rules);
    expect(result.eligible).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("not_published");
  });

  it("blocks a seller with too few products and no services", () => {
    const result = evaluateEligibility(
      seller({ publishedProducts: 1, publishedServices: 0 }),
      rules,
    );
    expect(result.eligible).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("catalogue");
  });

  it("accepts a services-only business", () => {
    // A pure services seller must not be gatekept for having no products.
    const result = evaluateEligibility(
      seller({ publishedProducts: 0, publishedServices: 2 }),
      rules,
    );
    expect(result.eligible).toBe(true);
  });

  it("blocks a seller with flagged content", () => {
    const result = evaluateEligibility(seller({ flaggedContent: 1 }), rules);
    expect(result.eligible).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("moderation");
  });

  it("accepts a cover image in place of a logo", () => {
    const result = evaluateEligibility(
      seller({ logoUrl: null, coverImageUrl: "https://cdn.example/cover.jpg" }),
      rules,
    );
    expect(result.eligible).toBe(true);
  });

  it("reports every unmet requirement, not just the first", () => {
    // The seller UI renders this as a to-do list, so it must be complete.
    const result = evaluateEligibility(
      seller({
        description: null,
        logoUrl: null,
        coverImageUrl: null,
        locationId: null,
        addressLine1: null,
        publishedProducts: 0,
      }),
      rules,
    );
    expect(result.failures.length).toBeGreaterThanOrEqual(5);
  });

  it("honours relaxed rules without a code change", () => {
    // The point of storing rules as data: a threshold can be tuned from the
    // admin dashboard the same afternoon Search Console complains.
    const relaxed = indexEligibilityRulesSchema.parse({
      minDescriptionLength: 10,
      minPublishedProducts: 0,
      minPublishedServices: 0,
      requireVerifiedPhone: false,
      requireAddress: false,
    });

    const result = evaluateEligibility(
      seller({
        description: "Short one.",
        publishedProducts: 0,
        publishedServices: 0,
        phoneVerified: false,
        addressLine1: null,
      }),
      relaxed,
    );

    expect(result.eligible).toBe(true);
  });

  it("keeps default weights summing to 100", () => {
    // Score is presented to sellers as a percentage complete.
    expect(evaluateEligibility(seller(), rules).score).toBe(100);
  });
});
