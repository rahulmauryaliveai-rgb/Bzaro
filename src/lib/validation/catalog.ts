import { z } from "zod";
import { checkCatalogSlug } from "@/lib/utils/slug";
import { IMAGE_REFERENCE_MESSAGE, isUsableImageReference } from "@/lib/validation/image-reference";

/**
 * Product and service schemas.
 *
 * Shared between the dashboard forms and the Server Actions so the rules cannot
 * drift. Server-side validation is authoritative.
 *
 * ── What is deliberately NOT enforced here ───────────────────────────────────
 * Nothing in this file blocks a save for being incomplete. A seller must be
 * able to write down a product name today and fill in the price tomorrow, so
 * only genuine correctness rules live here: lengths that protect the public
 * page, a price that is actually a number, a slug that produces a reachable
 * URL. Completeness is reported as guidance on the dashboard, the same way the
 * index-eligibility checklist works (D2).
 *
 * Every string is capped because all of it renders on a public website.
 */

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const result = checkCatalogSlug(value);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message });
  });

/** Optional free text: an empty form field means "not set", never an error. */
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** See `@/lib/validation/image-reference` for what is and is not allowed. */
const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || isUsableImageReference(value), IMAGE_REFERENCE_MESSAGE)
  .optional()
  .or(z.literal(""));

/**
 * Price in MAJOR units as typed by the seller.
 *
 * Accepted as a string and converted in the action, because the conversion to
 * minor units is currency-dependent and belongs with the currency, not in a
 * field-level transform that cannot see it.
 */
const priceField = z
  .string()
  .trim()
  .max(20)
  .regex(/^$|^[₹$€£,\s\d.]+$/, "Enter a number, e.g. 1250")
  .optional()
  .or(z.literal(""));

/**
 * Specifications: a small key/value table shown on the product page.
 *
 * Capped at 30 rows. The cap is not arbitrary — the list renders in full on a
 * public page with no pagination, and an unbounded table is both a layout bug
 * and a cheap way to bloat every cached render of that page.
 */
export const specificationSchema = z.object({
  key: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
});

export const specificationsSchema = z.array(specificationSchema).max(30).default([]);

/**
 * Tags. Lowercased and de-duplicated so "LED", "led" and " led " are one tag —
 * otherwise the facet counts on the marketplace fragment into near-duplicates.
 */
export const tagsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(20)
  .default([])
  .transform((tags) => [...new Set(tags.filter(Boolean))]);

export const publishStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

/**
 * One product image.
 *
 * `url` is the only required field, because an image may arrive two ways: a
 * verified upload, which carries provider metadata, or a pasted link, which
 * carries none. The upload path is the better one and supplies the rest.
 *
 * A relative URL is accepted alongside an absolute one: the development media
 * provider serves from `/uploads/...`, and rejecting that would mean uploads
 * only work once someone has a Cloudinary account.
 */
export const productImageSchema = z.object({
  url: z.string().trim().max(2048).refine(isUsableImageReference, IMAGE_REFERENCE_MESSAGE),
  alt: z.string().trim().max(200).optional().or(z.literal("")),

  // Populated by a verified upload; absent for a pasted link. Kept so the
  // asset can be deleted from the CDN later and so width/height can be emitted
  // on the public page to stop layout shift.
  provider: z.enum(["CLOUDINARY", "S3"]).optional(),
  publicId: z.string().trim().max(300).optional().or(z.literal("")),
  width: z.coerce.number().int().positive().max(20000).optional(),
  height: z.coerce.number().int().positive().max(20000).optional(),
  bytes: z.coerce.number().int().positive().max(50_000_000).optional(),
  mimeType: z.string().trim().max(100).optional().or(z.literal("")),
});

export const productImagesSchema = z.array(productImageSchema).max(12).default([]);

export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name").max(200),
  slug: slugField,
  categoryId: z.string().cuid().optional().or(z.literal("")),

  shortDescription: optionalText(300),
  description: optionalText(5000),

  brand: optionalText(100),
  sku: optionalText(60),
  modelNumber: optionalText(60),

  price: priceField,
  priceMax: priceField,
  currency: z.string().trim().length(3).toUpperCase().default("INR"),
  unit: optionalText(40),
  minOrderQty: z
    .string()
    .trim()
    .regex(/^$|^\d{1,7}$/, "Enter a whole number")
    .optional()
    .or(z.literal("")),
  priceOnRequest: z.coerce.boolean().default(false),

  specifications: specificationsSchema,
  tags: tagsSchema,
  images: productImagesSchema,

  metaTitle: optionalText(70),
  metaDescription: optionalText(180),

  status: publishStatusSchema.default("DRAFT"),
});

export type ProductInput = z.infer<typeof productSchema>;

/**
 * Services have no SKU, no price range and no image gallery — a service is
 * quoted, not stocked. Modelling them with the product schema and hiding
 * fields would put stock-keeping vocabulary in front of a consultancy.
 */
export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Enter a service name").max(200),
  slug: slugField,
  categoryId: z.string().cuid().optional().or(z.literal("")),

  shortDescription: optionalText(300),
  description: optionalText(5000),

  price: priceField,
  currency: z.string().trim().length(3).toUpperCase().default("INR"),
  pricingModel: z.enum(["hourly", "fixed", "quote"]).optional().or(z.literal("")),
  priceOnRequest: z.coerce.boolean().default(false),

  /** Where the service is offered — free text, one per line in the form. */
  serviceAreas: z.array(z.string().trim().min(1).max(80)).max(30).default([]),

  imageUrl: optionalUrl,
  tags: tagsSchema,

  metaTitle: optionalText(70),
  metaDescription: optionalText(180),

  status: publishStatusSchema.default("DRAFT"),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

/**
 * Deleting is destructive and irreversible from the seller's point of view, so
 * it takes an explicit confirmation rather than being a bare button press.
 */
export const deleteCatalogItemSchema = z.object({
  id: z.string().cuid(),
  confirm: z.literal("on", { message: "Tick the box to confirm." }),
});
