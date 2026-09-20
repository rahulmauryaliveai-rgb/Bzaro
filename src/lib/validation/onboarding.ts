import { z } from "zod";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";
import { slugField } from "@/lib/validation/seller";
import { optionalText } from "@/lib/validation/optional-text";
import { normalizePhone } from "@/lib/buyer/phone";
import {
  BUSINESS_TYPES,
  CERTIFICATIONS,
  EMPLOYEE_BANDS,
  MAX_SECONDARY_CATEGORIES,
  MAX_SERVICE_AREAS,
  TURNOVER_BANDS,
} from "@/lib/validation/business-lists";

export * from "@/lib/validation/business-lists";

/**
 * Multi-step seller onboarding (spec §onboarding):
 *
 *   1 account   name, mobile (OTP), WhatsApp, email, password
 *   2 business  name, type, address / pincode / city, primary + ≤4 secondary
 *               categories, cities served
 *   3 trust     GSTIN, year, employees, turnover, logo, certifications
 *   4 catalog   first product, or straight to the dashboard
 *
 * Each step has its own schema so a step can be saved on its own and resumed.
 * Fixed lists (business types, turnover bands, certifications) live here so
 * the form, the validator and the profile page all agree.
 */

const phoneInput = z
  .string()
  .trim()
  .min(1, "Enter your mobile number")
  .max(24)
  .transform((raw, ctx) => {
    const normalized = normalizePhone(raw);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid mobile number, e.g. 98765 43210" });
      return z.NEVER;
    }
    return normalized;
  });

const optionalPhoneInput = z
  .string()
  .trim()
  .max(24)
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return undefined;
    const normalized = normalizePhone(raw);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid WhatsApp number" });
      return z.NEVER;
    }
    return normalized;
  });

// ── Step 1: account ──────────────────────────────────────────────────────────

export const accountStepSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(120),
    phone: phoneInput,
    /** Empty means "same as mobile". */
    whatsapp: optionalPhoneInput,
    /**
     * OTP for the mobile number. Optional: a sign-up without it still creates
     * the account with the phone unverified, and the dashboard checklist
     * (indexability rule `requireVerifiedPhone`) keeps nagging until it is.
     */
    otpCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { message: "You must accept the terms to continue" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AccountStepInput = z.infer<typeof accountStepSchema>;

// ── Step 2: business ─────────────────────────────────────────────────────────

export const businessStepSchema = z
  .object({
    businessName: z.string().trim().min(2, "Enter your business name").max(200),
    slug: slugField,
    businessType: z.enum(BUSINESS_TYPES, { message: "Choose a business type" }),
    phone: phoneInput,
    addressLine1: z.string().trim().min(3, "Enter your address").max(200),
    postalCode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code"),
    locationId: z.string().cuid("Choose your city"),
    primaryCategoryId: z.string().cuid("Choose your main category"),
    secondaryCategoryIds: z
      .array(z.string().cuid())
      .max(MAX_SECONDARY_CATEGORIES, `Choose up to ${MAX_SECONDARY_CATEGORIES} more categories`),
    servesLocationIds: z
      .array(z.string().cuid())
      .max(MAX_SERVICE_AREAS, `Choose up to ${MAX_SERVICE_AREAS} cities`),
  })
  .transform((data) => ({
    ...data,
    // The primary is never also a secondary, and no duplicates.
    secondaryCategoryIds: [...new Set(data.secondaryCategoryIds)].filter(
      (id) => id !== data.primaryCategoryId,
    ),
    // The home city is implied.
    servesLocationIds: [...new Set(data.servesLocationIds)].filter((id) => id !== data.locationId),
  }));

export type BusinessStepInput = z.infer<typeof businessStepSchema>;

// ── Step 3: trust ────────────────────────────────────────────────────────────

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const trustStepSchema = z.object({
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN, "Enter a valid 15-character GSTIN")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  establishedYear: z.coerce
    .number()
    .int()
    .min(1900, "Enter a valid year")
    .max(new Date().getFullYear(), "Enter a valid year")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  employeeCount: z
    .enum(EMPLOYEE_BANDS)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  annualTurnover: z
    .enum(TURNOVER_BANDS)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  logoUrl: optionalText(2048),
  certifications: z.array(z.enum(CERTIFICATIONS)).max(CERTIFICATIONS.length),
});

export type TrustStepInput = z.infer<typeof trustStepSchema>;

// ── Step 4: catalog ──────────────────────────────────────────────────────────

export const catalogStepSchema = z.object({
  next: z.enum(["product", "dashboard"]),
});
