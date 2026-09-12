"use server";

import { headers } from "next/headers";
import { enquirySchema, hasContactMethod } from "@/lib/validation/enquiry";
import { createEnquiry } from "@/server/services/enquiry.service";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { getSessionUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import type { EnquirySource } from "@/generated/prisma/enums";

/**
 * Enquiry submission.
 *
 * Called from both the microsite contact form and the marketplace product page,
 * so it takes the seller SLUG rather than an id — the caller never supplies a
 * raw database id, and the slug is resolved and re-validated here.
 *
 * Note `serverActions.allowedOrigins` in next.config.ts must include
 * `*.<root domain>`: without it this action 403s silently when invoked from a
 * tenant subdomain, and it fails only in the browser, so every server-side test
 * still passes.
 */

export type EnquiryState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
};

export async function submitEnquiryAction(
  _previous: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const parsed = enquirySchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    company: formData.get("company"),
    message: formData.get("message"),
    quantity: formData.get("quantity") || undefined,
    website: formData.get("website"),
    elapsedMs: formData.get("elapsedMs") || undefined,
    productId: formData.get("productId"),
    serviceId: formData.get("serviceId"),
    consent: formData.get("consent"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  if (!hasContactMethod(parsed.data)) {
    return {
      fieldErrors: {
        email: "Add an email address or a phone number so the supplier can reply.",
      },
    };
  }

  const requestHeaders = await headers();
  const ip = getClientIp(requestHeaders);

  const limit = await checkRateLimit("enquiry", ip);
  if (!limit.success) {
    return {
      error: "You've sent several enquiries recently. Please try again in a little while.",
    };
  }

  const sellerSlug = String(formData.get("sellerSlug") ?? "");
  if (!sellerSlug) return { error: "Something went wrong. Please try again." };

  const seller = await db.seller.findFirst({
    where: { slug: sellerSlug, status: "VERIFIED", deletedAt: null },
    select: { id: true },
  });

  if (!seller) {
    return { error: "This supplier is not accepting enquiries right now." };
  }

  const source = (String(formData.get("source") ?? "MICROSITE_CONTACT") as EnquirySource) ?? null;
  const allowedSources: EnquirySource[] = [
    "MICROSITE_CONTACT",
    "MICROSITE_PRODUCT",
    "MARKETPLACE_PRODUCT",
    "MARKETPLACE_SELLER",
  ];

  const user = await getSessionUser();

  const result = await createEnquiry({
    sellerId: seller.id,
    input: parsed.data,
    source: allowedSources.includes(source) ? source : "MICROSITE_CONTACT",
    ip,
    userAgent: requestHeaders.get("user-agent"),
    referrer: requestHeaders.get("referer"),
    landingPath: String(formData.get("landingPath") ?? "") || null,
    buyerUserId: user?.id ?? null,
  });

  if (!result.ok) {
    return {
      error:
        result.reason === "no_contact"
          ? "Add an email address or phone number so the supplier can reply."
          : "This supplier is not accepting enquiries right now.",
    };
  }

  // Suspected spam gets the same success response as a genuine enquiry.
  // Telling a bot it was filtered only teaches it to try a different shape, and
  // a false positive would otherwise leave a real buyer staring at an error.
  return {
    ok: true,
    message: "Enquiry sent. The supplier will get back to you directly.",
  };
}
