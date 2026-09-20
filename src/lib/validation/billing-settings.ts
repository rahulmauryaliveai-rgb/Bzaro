import { z } from "zod";

/**
 * How a seller pays for a plan until a payment gateway exists (decision D32).
 *
 * Stored as one JSON row in `Setting` under BILLING_SETTINGS_KEY, edited from
 * the admin settings screen. The upgrade page renders these verbatim: the
 * WhatsApp number to message, the UPI id to pay, and any instructions. Empty
 * values simply hide their line, so the page degrades to "contact us".
 */

export const BILLING_SETTINGS_KEY = "billing";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

export const billingSettingsSchema = z.object({
  /** E.164 without the plus, as wa.me wants it: 919876543210. */
  supportWhatsapp: optionalText(15),
  supportEmail: optionalText(120),
  upiId: optionalText(80),
  /** Shown under the payment details; plain text, newlines kept. */
  instructions: optionalText(1000),
});

export type BillingSettings = z.infer<typeof billingSettingsSchema>;

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  supportWhatsapp: null,
  supportEmail: null,
  upiId: null,
  instructions:
    "Pay the plan amount to the UPI id above and send us the payment reference on WhatsApp. We activate your plan within one working day.",
};
