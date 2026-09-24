"use server";

import { cookies, headers } from "next/headers";
import { REFERRAL_COOKIE } from "@/proxy";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { PURPOSE_LABELS, TIMELINE_LABELS, requirementSchema } from "@/lib/validation/requirement";
import { whatsAppHref } from "@/lib/whatsapp/link";
import { getBuyerSession } from "@/server/services/buyer.service";
import { createRequirement } from "@/server/services/requirement.service";

/**
 * Requirement submission — the last step of the contact modal.
 *
 * Identity comes from the Auth.js session, never from the form. A request
 * without one is sent back to the sign-in step, where the modal keeps the
 * drafted requirement and resubmits it once the account exists.
 */

export type RequirementState = {
  ok?: boolean;
  error?: string;
  /** "session" tells the modal to show the sign-in step. */
  errorKind?: "session" | "generic";
  fieldErrors?: Record<string, string>;
  /** Present when the direct seller has WhatsApp; the modal opens it. */
  whatsappUrl?: string;
  /** Revealed after a CALL requirement, which is what the buyer pressed for. */
  sellerPhone?: string;
  sellerName?: string;
};

export async function submitRequirementAction(
  _previous: RequirementState,
  formData: FormData,
): Promise<RequirementState> {
  const buyer = await getBuyerSession();
  if (!buyer) {
    return {
      error: "Please sign in or create an account to send your requirement.",
      errorKind: "session",
    };
  }
  if (buyer.isBlocked) {
    return { error: "This account can't be used to contact suppliers." };
  }
  const buyerId = buyer.id;

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
    trigger: formData.get("trigger"),
    source: formData.get("source"),
    businessName: formData.get("businessName") ?? undefined,
    gstin: formData.get("gstin") ?? undefined,
    pincode: formData.get("pincode") ?? undefined,
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

  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const result = await createRequirement({
    buyerId,
    input: parsed.data,
    ip: getClientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
    refBzaro: cookieStore.get(REFERRAL_COOKIE)?.value === "bzaro",
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

  return {
    ok: true,
    whatsappUrl,
    // Only for the trigger that asked for it — an ENQUIRY does not reveal a
    // number the buyer never pressed for.
    sellerPhone: parsed.data.trigger === "CALL" ? (result.direct.phone ?? undefined) : undefined,
    sellerName: result.direct.sellerName,
  };
}
