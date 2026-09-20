import { z } from "zod";
import { optionalText } from "@/lib/validation/optional-text";

/**
 * Seller-side lead actions: view, accept, close, flag.
 *
 * Ids are opaque strings validated for shape only — ownership is proven in
 * the service by `requireSellerAccess` plus a `sellerId` filter on the query,
 * never by trusting the id.
 */

const id = z.string().min(1).max(64);

export const leadIdSchema = z.object({ leadId: id });

export const closeLeadSchema = z.object({
  leadId: id,
  note: optionalText(1000),
});

export const leadFlagReasonSchema = z.enum([
  "UNREACHABLE",
  "WRONG_CATEGORY",
  "WRONG_CITY",
  "DUPLICATE",
  "SPAM",
  "OTHER",
]);

export const FLAG_REASON_LABELS: Record<z.infer<typeof leadFlagReasonSchema>, string> = {
  UNREACHABLE: "Number unreachable or wrong",
  WRONG_CATEGORY: "Not my product category",
  WRONG_CITY: "Outside my service area",
  DUPLICATE: "Duplicate of a lead I already have",
  SPAM: "Spam or not a genuine buyer",
  OTHER: "Something else",
};

export const flagLeadSchema = z.object({
  leadId: id,
  reason: leadFlagReasonSchema,
  note: optionalText(1000),
});

/** Admin: resolve a flag. */
export const resolveFlagSchema = z.object({
  flagId: id,
  decision: z.enum(["REFUNDED", "REJECTED"]),
  reviewNote: optionalText(1000),
});

/** Admin: manual credit adjustment. Zero is rejected by the ledger CHECK. */
export const adjustCreditsSchema = z.object({
  sellerId: id,
  delta: z.coerce
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((n) => n !== 0, "Enter a non-zero amount"),
  note: z.string().trim().min(3, "Say why").max(500),
});

/** Lead list filters in the seller dashboard. */
export const leadListParamsSchema = z.object({
  type: z.enum(["DIRECT", "MARKET"]).optional(),
  status: z.enum(["NEW", "VIEWED", "ACCEPTED", "CLOSED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
