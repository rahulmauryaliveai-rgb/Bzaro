import { describe, expect, it } from "vitest";
import {
  enquirySchema,
  hasContactMethod,
  scoreSpam,
  SPAM_THRESHOLD,
} from "@/lib/validation/enquiry";

/**
 * Enquiry validation and spam scoring.
 *
 * Enquiry quality IS the product: a seller whose inbox fills with spam stops
 * trusting the platform faster than one who experiences downtime. But a false
 * positive is a real customer a real business never heard from — so the scoring
 * is tested in both directions, and the bar for "certain spam" is deliberately
 * high.
 */

const VALID = {
  name: "Ravi Kumar",
  email: "ravi@example.com",
  phone: "",
  company: "Kumar Traders",
  message: "We need 500 units of the 40W panel. Please share pricing and lead time.",
  quantity: "500",
  website: "",
  elapsedMs: "8000",
  consent: "on",
};

describe("enquirySchema", () => {
  it("accepts a genuine enquiry", () => {
    const result = enquirySchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("requires consent", () => {
    // DPDP: consent must be explicit and unbundled, never implied by use.
    const result = enquirySchema.safeParse({ ...VALID, consent: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects a too-short message", () => {
    const result = enquirySchema.safeParse({ ...VALID, message: "hi" });
    expect(result.success).toBe(false);
  });

  it("caps message length", () => {
    // Unbounded text is a cheap denial-of-service, not a feature.
    const result = enquirySchema.safeParse({ ...VALID, message: "x".repeat(6000) });
    expect(result.success).toBe(false);
  });

  it("treats empty optional strings as absent", () => {
    const result = enquirySchema.safeParse({ ...VALID, phone: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it("rejects a malformed email", () => {
    expect(enquirySchema.safeParse({ ...VALID, email: "not-an-email" }).success).toBe(false);
  });
});

describe("hasContactMethod", () => {
  it("requires at least one way to reply", () => {
    expect(hasContactMethod({})).toBe(false);
    expect(hasContactMethod({ email: "a@b.test" })).toBe(true);
    expect(hasContactMethod({ phone: "+919876543210" })).toBe(true);
  });
});

describe("scoreSpam", () => {
  const genuine = {
    name: "Ravi Kumar",
    message: "We need 500 units of the 40W panel. Please share pricing and lead time.",
    elapsedMs: 12_000,
    hasHoneypot: false,
  };

  it("scores a genuine enquiry as clean", () => {
    expect(scoreSpam(genuine)).toBeLessThan(SPAM_THRESHOLD);
  });

  it("treats a filled honeypot as certain spam", () => {
    // Hidden from humans; only a bot fills it.
    expect(scoreSpam({ ...genuine, hasHoneypot: true })).toBe(1);
  });

  it("flags near-instant submission", () => {
    const fast = scoreSpam({ ...genuine, elapsedMs: 300 });
    expect(fast).toBeGreaterThan(scoreSpam(genuine));
  });

  it("flags link stuffing", () => {
    const spammy = scoreSpam({
      ...genuine,
      message: "Visit https://a.test https://b.test https://c.test for cheap SEO services",
    });
    expect(spammy).toBeGreaterThanOrEqual(SPAM_THRESHOLD);
  });

  it("flags a URL in the name field", () => {
    // A "name" containing a URL is never a person.
    const result = scoreSpam({ ...genuine, name: "https://spam.test" });
    expect(result).toBeGreaterThan(0.3);
  });

  it("flags known spam vocabulary", () => {
    const result = scoreSpam({
      ...genuine,
      message: "We offer the best SEO services and backlink packages for your website.",
    });
    expect(result).toBeGreaterThan(0.3);
  });

  it("does NOT flag a normal enquiry that happens to include one link", () => {
    // A buyer linking to a spec sheet is normal. One link alone must not cross
    // the threshold, or genuine B2B enquiries get filed as spam.
    const result = scoreSpam({
      ...genuine,
      message: "Here is our spec: https://ourcompany.test/spec.pdf — can you match it?",
    });
    expect(result).toBeLessThan(SPAM_THRESHOLD);
  });

  it("does NOT flag a short all-caps exclamation", () => {
    // "URGENT" in an otherwise normal message is not spam.
    const result = scoreSpam({ ...genuine, message: "URGENT - need 200 units by Friday please" });
    expect(result).toBeLessThan(SPAM_THRESHOLD);
  });

  it("never exceeds 1", () => {
    const result = scoreSpam({
      name: "https://x.test",
      message: "CRYPTO CASINO BACKLINK https://a.test https://b.test https://c.test",
      elapsedMs: 10,
      hasHoneypot: false,
    });
    expect(result).toBeLessThanOrEqual(1);
  });
});
