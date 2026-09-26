import { z } from "zod";
import { checkSlug } from "@/lib/tenant/reserved";
import { normalizePhone } from "@/lib/buyer/phone";

/**
 * Authentication and registration schemas.
 *
 * These are shared between the client form and the server action, so the rules
 * cannot drift apart. Server-side validation is authoritative; the client copy
 * exists purely so the user sees the error before a round trip.
 *
 * Every string is length-capped. An unbounded string field is a cheap
 * denial-of-service: a 10 MB "name" costs nothing to send and a great deal to
 * validate, log and store.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254) // RFC 5321
  .email("Enter a valid email address");

/**
 * Password policy: length over composition rules. NIST SP 800-63B guidance is
 * that mandatory symbol/digit rules push users toward predictable patterns
 * ("Password1!") without adding real entropy.
 */
export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200, "Too long");

/** Login. Deliberately lenient — the authorize() callback is the real gate. */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

const PHONE_HINT = "Enter a 10-digit mobile number, e.g. 98765 43210";

/**
 * A mobile number typed the way people type it — "98765 43210",
 * "09876543210", "+91 98765-43210" — stored as E.164 ("+919876543210"),
 * which is what wa.me links and every SMS gateway expect. A bare 10-digit
 * number is taken as Indian; other countries need their "+" code.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, PHONE_HINT)
  .max(24, PHONE_HINT)
  .transform((raw, ctx) => {
    const normalized = normalizePhone(raw);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: PHONE_HINT });
      return z.NEVER;
    }
    return normalized;
  });

/** Same, for fields that may be left empty (returns "" when empty). */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(24, PHONE_HINT)
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return "";
    const normalized = normalizePhone(raw);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: PHONE_HINT });
      return z.NEVER;
    }
    return normalized;
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { message: "You must accept the terms to continue" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Seller registration. The slug becomes the subdomain, so it is validated
 * against the reserved list and DNS label rules here — before the database
 * CHECK constraint has to catch it.
 */
export const sellerRegistrationSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const result = checkSlug(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.message });
      }
    }),
  phone: phoneSchema,
  locationId: z.string().cuid().optional(),
  categoryIds: z.array(z.string().cuid()).min(1, "Choose at least one category").max(5),
});

/**
 * Buyer signup (D35). Phone is required here even though `User.phone` is
 * nullable — the seller's whole reason to answer a lead is a number to call.
 * It is stored unverified; SMS verification is a later phase.
 */
export const buyerSignupSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(120),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    acceptTerms: z.literal(true, { message: "You must accept the terms to continue" }),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

/** The code from the signup email, checked against `EmailOtp`. */
export const emailOtpVerifySchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

/** Google sign-in leaves no phone behind; this is the one-time step that asks. */
export const buyerPhoneSchema = z.object({ phone: phoneSchema });

export const passwordResetRequestSchema = z.object({ email: emailSchema });

/** Password reset by emailed code rather than a link (D35). */
export const passwordResetOtpSchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const passwordResetSchema = z
  .object({
    token: z.string().min(1).max(500),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type Credentials = z.infer<typeof credentialsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SellerRegistrationInput = z.infer<typeof sellerRegistrationSchema>;
