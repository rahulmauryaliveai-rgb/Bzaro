"use server";

import { headers } from "next/headers";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { readBuyerIdFromCookie } from "@/lib/buyer/cookie";
import { PURPOSE_LABELS, TIMELINE_LABELS, requirementSchema } from "@/lib/validation/requirement";
import { whatsAppHref } from "@/lib/whatsapp/link";
import { getBuyerSession } from "@/server/services/buyer.service";
import { createRequirement } from "@/server/services/requirement.service";

/**
 * Requirement submission — the last step of the contact modal.
 *
 * Identity comes from the buyer cookie set by `verifyOtpAction`, never from
 * the form. A request without a valid cookie is sent back to the OTP step.
 */

export type RequirementState = {
  ok?: boolean;
  error?: string;
  /** "session" tells the modal to restart at the phone step. */
  errorKind?: "session" | "generic";
  fieldErrors?: Record<string, string>;
  /** Present when the direct seller has WhatsApp; the modal opens it. */
  whatsappUrl?: string;
  sellerName?: string;
};

export async function submitRequirementAction(
  _previous: RequirementState,
  formData: FormData,
): Promise<RequirementState> {
  const buyerId = await readBuyerIdFromCookie();
  if (!buyerId) {
    return {
      error: "Your session has expired. Please verify your number again.",
      errorKind: "session",
    };
  }

  const buyer = await getBuyerSession(buyerId);
  if (!buyer || buyer.isBlocked) {
    return {
      error: "Your session has expired. Please verify your number again.",
      errorKind: "session",
    };
  }

  const parsed = requirementSchema.safeParse({
    productName: formData.get("productName"),
    quantity: formData.get("quantity"),
    quantityUnit: formData.get("quantityUnit"),
    locationId: formData.get("locationId"),
    timeline: formData.get("timeline"),
    purpose: formData.get("purpose"),
    notes: formData.get("notes") ?? undefined,
    productId: formData.get("productId") ?? undefined,
    sellerId: formData.get("sellerId") ?? undefined,
    categoryId: formData.get("categoryId") ?? undefined,
    name: formData.get("name") ?? undefined,
    website: formData.get("website") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const limit = await checkRateLimit("requirement", buyerId);
  if (!limit.success) {
    return { error: "You've sent several requirements recently. Please try again later." };
  }

  const requestHeaders = await headers();
  const result = await createRequirement({
    buyerId,
    input: parsed.data,
    ip: getClientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
  });

  if (!result.ok) {
    switch (result.reason) {
      case "city_invalid":
        return { fieldErrors: { locationId: "Choose a city from the list." } };
      case "category_invalid":
        return { fieldErrors: { categoryId: "Choose a category." } };
      default:
        return {
          error: "This supplier isn't available right now. Please try another.",
          errorKind: "generic",
        };
    }
  }

  if (!result.direct) return { ok: true };

  const whatsappUrl = result.direct.whatsapp
    ? whatsAppHref(result.direct.whatsapp, {
        kind: "requirement",
        sellerName: result.direct.sellerName,
        productName: parsed.data.productName,
        quantity: parsed.data.quantity,
        quantityUnit: parsed.data.quantityUnit,
        city: result.cityName,
        timeline: TIMELINE_LABELS[parsed.data.timeline],
        purpose: PURPOSE_LABELS[parsed.data.purpose],
        buyerName: parsed.data.name ?? buyer.name,
        notes: parsed.data.notes,
      })
    : undefined;

  return { ok: true, whatsappUrl, sellerName: result.direct.sellerName };
}
