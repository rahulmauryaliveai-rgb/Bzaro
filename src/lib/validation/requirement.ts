import { createHash } from "node:crypto";
import { z } from "zod";
import { optionalText } from "@/lib/validation/optional-text";

/**
 * Buyer requirement form — the step after OTP and before the wa.me hand-off.
 *
 * Short on purpose. Every extra field here is a buyer who closes the popup
 * before the lead exists; the seller can ask follow-ups on WhatsApp.
 */

/** Fixed list so sellers can filter and the matcher can compare. */
export const QUANTITY_UNITS = [
  "pieces",
  "sets",
  "kg",
  "tonnes",
  "litres",
  "metres",
  "sq ft",
  "boxes",
  "rolls",
  "bags",
] as const;

export const requirementTimelineSchema = z.enum([
  "IMMEDIATE",
  "WITHIN_WEEK",
  "WITHIN_MONTH",
  "EXPLORING",
]);

export const requirementPurposeSchema = z.enum(["RESALE", "BUSINESS_USE", "PERSONAL_USE"]);

export const TIMELINE_LABELS: Record<z.infer<typeof requirementTimelineSchema>, string> = {
  IMMEDIATE: "Immediately",
  WITHIN_WEEK: "Within a week",
  WITHIN_MONTH: "Within a month",
  EXPLORING: "Just exploring",
};

export const PURPOSE_LABELS: Record<z.infer<typeof requirementPurposeSchema>, string> = {
  RESALE: "Resale",
  BUSINESS_USE: "Business use",
  PERSONAL_USE: "Personal use",
};

/** Which control the buyer pressed. Decides what happens after submit. */
export const requirementTriggerSchema = z.enum(["CALL", "WHATSAPP", "ENQUIRY", "SEARCH_CARD"]);

/** Where the requirement was raised. Attribution only — never routing. */
export const requirementSourceSchema = z.enum(["BZARO_MARKETPLACE", "STOREFRONT"]);

export const requirementSchema = z.object({
  productName: z.string().trim().min(2, "What are you looking for?").max(200),
  quantity: z.coerce
    .number()
    .int("Enter a whole number")
    .min(1, "Enter a quantity")
    .max(1_000_000_000),
  quantityUnit: z.enum(QUANTITY_UNITS),
  /** Location id of a CITY. Validated against the database in the service. */
  locationId: z.string().min(1, "Choose your city").max(64),
  timeline: requirementTimelineSchema,
  purpose: requirementPurposeSchema,
  notes: optionalText(1000),

  /** Product whose contact button was clicked. Absent on "Post requirement". */
  productId: optionalText(64),
  /** Seller whose page the buyer is on. Derived from the product when both are set. */
  sellerId: optionalText(64),
  /** Category chosen by the buyer on "Post requirement". Ignored when productId is set. */
  categoryId: optionalText(64),

  /** Buyer name, optional; stored on the User row if given. */
  name: optionalText(120),

  trigger: requirementTriggerSchema,
  source: requirementSourceSchema,

  /**
   * Collected only when purpose is RESALE or BUSINESS_USE. The refinement
   * below enforces that; the form hides the fields otherwise.
   */
  businessName: optionalText(200),
  gstin: optionalText(20),

  /** As entered. The service resolves it to a city via the Pincode table. */
  pincode: optionalText(6),

  /** Honeypot. */
  website: z.string().max(0, "Invalid submission").optional(),
});

export type RequirementInput = z.infer<typeof requirementSchema>;

/**
 * The 7-day dedupe key. Lower-cased, whitespace-collapsed product name plus
 * the category id — so "LED Bulb 9W" and "led bulb  9w" are the same
 * requirement, but the same words in a different category are not.
 */
export function requirementFingerprint(productName: string, categoryId: string): string {
  const normalized = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return createHash("sha256").update(`${normalized}|${categoryId}`).digest("hex").slice(0, 32);
}
