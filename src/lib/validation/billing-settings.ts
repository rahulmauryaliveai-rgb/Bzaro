import { z } from "zod";

/**
 * Billing settings (D32, extended by D41).
 *
 * Stored as one JSON row in `Setting` under BILLING_SETTINGS_KEY, edited from
 * the admin settings screen.
 *
 * - Manual payment details (WhatsApp, UPI, instructions) — the fallback when
 *   Bzaro's Razorpay keys are not configured, and for bank transfers.
 * - D41 add-on prices, GST rate, grace and refund windows. Every new field has
 *   a default, so a row saved before D41 still parses — a failed parse would
 *   silently fall back to DEFAULT_BILLING_SETTINGS and lose the admin's edits.
 * - The supplier details printed on GST invoices.
 *
 * Money is paise, exclusive of GST.
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

  // ── D41: prices and rules ──
  gstRatePercent: z.number().min(0).max(28).default(18),
  leadPackPriceMinor: z.number().int().min(100).max(10_000_000).default(49_900),
  leadPackCredits: z.number().int().min(1).max(1000).default(10),
  paymentGatewayAddonMinor: z.number().int().min(100).max(10_000_000).default(200_000),
  shippingAddonMinor: z.number().int().min(100).max(10_000_000).default(500_000),
  /** Days a PAST_DUE subscription keeps its plan before dropping to Free. */
  graceDays: z.number().int().min(0).max(30).default(3),
  /** Days after a plan payment in which a refund may be requested. */
  refundWindowDays: z.number().int().min(0).max(90).default(7),

  // ── D41: supplier details on GST invoices ──
  legalName: optionalText(160).default(null),
  gstin: optionalText(15).default(null),
  address: optionalText(400).default(null),
  /** Place of supply — decides CGST+SGST vs IGST. */
  state: optionalText(60).default(null),
  sacCode: optionalText(8).default(null),
  invoicePrefix: optionalText(4).default(null),
});

export type BillingSettings = z.infer<typeof billingSettingsSchema>;

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  supportWhatsapp: null,
  supportEmail: null,
  upiId: null,
  instructions:
    "Pay the plan amount to the UPI id above and send us the payment reference on WhatsApp. We activate your plan within one working day.",
  gstRatePercent: 18,
  leadPackPriceMinor: 49_900,
  leadPackCredits: 10,
  paymentGatewayAddonMinor: 200_000,
  shippingAddonMinor: 500_000,
  graceDays: 3,
  refundWindowDays: 7,
  legalName: null,
  gstin: null,
  address: null,
  state: null,
  sacCode: null,
  invoicePrefix: null,
};
