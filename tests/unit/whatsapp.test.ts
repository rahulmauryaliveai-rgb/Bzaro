import { describe, expect, it } from "vitest";
import {
  buildMessage,
  isValidWhatsAppNumber,
  toWhatsAppNumber,
  whatsAppHref,
} from "@/lib/whatsapp/link";

/**
 * WhatsApp deep links.
 *
 * The format rules here are unforgiving and fail silently: a link built with a
 * `+` or a space opens WhatsApp on a "phone number is invalid" dialog, which
 * buyers read as a broken or fake listing.
 */

describe("toWhatsAppNumber", () => {
  it("strips the plus and any formatting", () => {
    expect(toWhatsAppNumber("+919876543210")).toBe("919876543210");
    expect(toWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("+91-98765-43210")).toBe("919876543210");
  });
});

describe("isValidWhatsAppNumber", () => {
  it("accepts E.164 numbers", () => {
    expect(isValidWhatsAppNumber("+919876543210")).toBe(true);
  });

  it("rejects empty and short values", () => {
    expect(isValidWhatsAppNumber(null)).toBe(false);
    expect(isValidWhatsAppNumber(undefined)).toBe(false);
    expect(isValidWhatsAppNumber("")).toBe(false);
    expect(isValidWhatsAppNumber("+91987")).toBe(false);
  });

  it("rejects numbers longer than E.164 permits", () => {
    expect(isValidWhatsAppNumber("+9198765432101234")).toBe(false);
  });
});

describe("buildMessage", () => {
  it("names the product and the platform", () => {
    const message = buildMessage({
      kind: "product",
      productName: "LED Panel 40W",
      sellerName: "ABC Electronics",
    });

    expect(message).toContain("LED Panel 40W");
    // The platform name comes from configuration; the point of the assertion is
    // that the message names it at all, so the buyer knows where the enquiry
    // originated.
    expect(message).toContain(process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Bzaro");
    expect(message).toContain("price and details");
  });

  it("writes from the buyer's side", () => {
    const message = buildMessage({ kind: "seller", sellerName: "ABC Electronics" });
    expect(message.startsWith("Hello")).toBe(true);
  });
});

describe("whatsAppHref", () => {
  it("builds a wa.me link with an encoded message", () => {
    const href = whatsAppHref("+919876543210", {
      kind: "product",
      productName: "LED Panel 40W",
      sellerName: "ABC Electronics",
    });

    expect(href.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    // Spaces must be percent-encoded, never left raw or turned into "+".
    expect(href).not.toContain(" ");
    expect(decodeURIComponent(href.split("?text=")[1]!)).toContain("LED Panel 40W");
  });
});

describe("buildMessage: requirement", () => {
  it("lists every fact the seller needs to quote, one per line", () => {
    const message = buildMessage({
      kind: "requirement",
      sellerName: "ABC Electronics",
      productName: "LED Bulb 9W",
      quantity: 500,
      quantityUnit: "pieces",
      city: "Mumbai",
      timeline: "Within a week",
      purpose: "Resale",
      buyerName: "Rahul",
      notes: "Cool white only",
    });

    const lines = message.split("\n");
    expect(lines[0]).toContain("ABC Electronics");
    expect(lines).toContain("• Product: LED Bulb 9W");
    expect(lines).toContain("• Quantity: 500 pieces");
    expect(lines).toContain("• City: Mumbai");
    expect(lines).toContain("• Needed: Within a week");
    expect(lines).toContain("• Purpose: Resale");
    expect(lines).toContain("• Notes: Cool white only");
    expect(lines.at(-1)).toBe("Please share your best price. — Rahul");
  });

  it("reads naturally without a name or notes", () => {
    const message = buildMessage({
      kind: "requirement",
      sellerName: "ABC Electronics",
      productName: "LED Bulb 9W",
      quantity: 10,
      quantityUnit: "boxes",
      city: "Pune",
      timeline: "Immediately",
      purpose: "Business use",
    });
    expect(message).not.toContain("Notes:");
    expect(message.split("\n").at(-1)).toBe("Please share your best price.");
  });
});
