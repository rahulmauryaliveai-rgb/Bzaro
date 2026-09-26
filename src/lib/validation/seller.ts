import { z } from "zod";
import {
  BUSINESS_TYPES,
  CERTIFICATIONS,
  MAX_SERVICE_AREAS,
  TURNOVER_BANDS,
} from "@/lib/validation/business-lists";
import { checkSlug } from "@/lib/tenant/reserved";
import { optionalPhoneSchema, phoneSchema } from "@/lib/validation/auth";
import { IMAGE_REFERENCE_MESSAGE, isUsableImageReference } from "@/lib/validation/image-reference";

/**
 * Seller profile and onboarding schemas.
 *
 * Shared between the client form and the Server Action so the rules cannot
 * drift. Server-side validation is authoritative; the client copy exists so the
 * seller sees the error before a round trip.
 *
 * Every string is capped. These fields are rendered on a public website, so an
 * unbounded description is both a denial-of-service vector and a layout bug
 * waiting to happen.
 */

/**
 * Deliberately NOT `z.string().url()`, which rejects the relative paths the
 * development media provider produces. See `@/lib/validation/image-reference`.
 */
const imageReference = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || isUsableImageReference(value), IMAGE_REFERENCE_MESSAGE)
  .optional()
  .or(z.literal(""));

export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const result = checkSlug(value);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message });
  });

/** Business registration — the onboarding step after account creation. */
export const businessRegistrationSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(200),
  slug: slugField,
  phone: phoneSchema,
  locationId: z.string().cuid("Choose your city"),
  categoryIds: z
    .array(z.string().cuid())
    .min(1, "Choose at least one category")
    .max(5, "Choose up to five categories"),
});

export type BusinessRegistrationInput = z.infer<typeof businessRegistrationSchema>;

/**
 * Business profile.
 *
 * `description` has no minimum here even though the D2 gate wants 150
 * characters. Blocking the save would strand a seller mid-edit; the gate
 * reports it as an unmet requirement on the dashboard checklist instead, which
 * is the difference between guidance and obstruction.
 */
export const sellerProfileSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(200),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  tagline: z
    .string()
    .trim()
    .max(160, "Keep the tagline under 160 characters")
    .optional()
    .or(z.literal("")),
  description: z.string().trim().max(5000, "Description is too long").optional().or(z.literal("")),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  phone: optionalPhoneSchema,
  whatsapp: optionalPhoneSchema,
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .url("Enter a full URL including https://")
    .optional()
    .or(z.literal("")),

  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  locationId: z.string().cuid().optional().or(z.literal("")),

  establishedYear: z.coerce
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear())
    .optional()
    .or(z.literal("").transform(() => undefined))
    .catch(undefined),
  employeeCount: z.string().trim().max(40).optional().or(z.literal("")),
  businessType: z.enum(BUSINESS_TYPES).optional().or(z.literal("")),
  annualTurnover: z.enum(TURNOVER_BANDS).optional().or(z.literal("")),
  certifications: z.array(z.enum(CERTIFICATIONS)).max(CERTIFICATIONS.length).default([]),
  /** Cities served besides the home city. */
  servesLocationIds: z.array(z.string().cuid()).max(MAX_SERVICE_AREAS).default([]),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN")
    .optional()
    .or(z.literal("")),

  // An absolute URL (a pasted link, or a CDN upload) OR a site-relative path
  // (the development media provider serves from /uploads/...). Requiring an
  // absolute URL here would mean uploads only work once someone has configured
  // Cloudinary, which is exactly the friction the local provider removes.
  logoUrl: imageReference,
  coverImageUrl: imageReference,

  facebook: z.string().trim().max(300).url().optional().or(z.literal("")),
  instagram: z.string().trim().max(300).url().optional().or(z.literal("")),
  linkedin: z.string().trim().max(300).url().optional().or(z.literal("")),
  youtube: z.string().trim().max(300).url().optional().or(z.literal("")),
  x: z.string().trim().max(300).url().optional().or(z.literal("")),
});

export type SellerProfileInput = z.infer<typeof sellerProfileSchema>;

/** Website settings: template choice, theme tokens and SEO overrides. */
export const websiteSettingsSchema = z.object({
  templateKey: z.string().trim().min(1).max(50),

  primary: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour"),
  accent: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour"),
  background: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour"),
  foreground: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour"),
  surface: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour"),
  border: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour"),

  fontPair: z.string().trim().max(30),
  radius: z.string().trim().max(10),
  headerVariant: z.string().trim().max(20),
  heroVariant: z.string().trim().max(20),

  metaTitle: z
    .string()
    .trim()
    .max(70, "Search engines truncate past ~60 characters")
    .optional()
    .or(z.literal("")),
  metaDescription: z
    .string()
    .trim()
    .max(200, "Search engines truncate past ~160 characters")
    .optional()
    .or(z.literal("")),
});

export type WebsiteSettingsInput = z.infer<typeof websiteSettingsSchema>;

/**
 * Slug change.
 *
 * Separate from the profile form on purpose: changing a slug changes the
 * seller's public web address, breaks every printed business card, and is rate
 * limited to once per 90 days (decision D11). Burying that in a general "save
 * profile" button would let someone do it by accident.
 */
export const slugChangeSchema = z.object({
  slug: slugField,
  confirm: z.literal("on", { message: "Confirm you understand your web address will change" }),
});

/** How often a seller may change their subdomain (decision D11). */
export const SLUG_CHANGE_COOLDOWN_DAYS = 90;
