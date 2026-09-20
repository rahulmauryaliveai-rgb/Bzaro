import { z } from "zod";
import { normalizePhone } from "@/lib/buyer/phone";

/**
 * OTP request / verify inputs.
 *
 * The phone is normalised to E.164 INSIDE the schema so every caller — the
 * buyer popup, the seller onboarding step, a future API — gets the same
 * canonical value and the same error copy. Rate limits are keyed on the
 * normalised form, which is why normalisation must happen before, not after.
 */

const phoneInput = z
  .string()
  .trim()
  .min(1, "Enter your mobile number")
  .max(24)
  .transform((raw, ctx) => {
    const normalized = normalizePhone(raw);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid mobile number, e.g. 98765 43210",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const otpPurposeSchema = z.enum(["BUYER_CONTACT", "SELLER_SIGNUP"]);

export const requestOtpSchema = z.object({
  phone: phoneInput,
  purpose: otpPurposeSchema,
  /** Honeypot. Must be empty. */
  website: z.string().max(0, "Invalid submission").optional(),
});

export const verifyOtpSchema = z.object({
  phone: phoneInput,
  purpose: otpPurposeSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
  /**
   * Buyer-facing consent, required for BUYER_CONTACT. The text lives in the
   * component; the schema only records that it was ticked.
   */
  consent: z
    .union([z.literal("on"), z.literal("true"), z.literal(true), z.literal(""), z.literal(false)])
    .optional()
    .transform((value) => value === "on" || value === "true" || value === true),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/** Wording shown next to the consent checkbox. Kept here so tests and the
 * privacy page quote the same string. */
export const BUYER_CONSENT_TEXT =
  "I agree to share my requirement with the selected supplier and up to 10 other verified suppliers.";
