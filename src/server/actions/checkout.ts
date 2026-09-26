"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSubdomain, isRootHost, normalizeHost } from "@/lib/utils/url";
import { getBuyerSession } from "@/server/services/buyer.service";
import { beginCheckout, confirmPayment } from "@/server/services/order.service";
import { canAcceptPayments, getCheckoutMethods } from "@/server/services/integration.service";

/**
 * Checkout (Phase 5). Storefronts only — same host-derived guard as the cart.
 */

const addressSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  line1: z.string().trim().min(3, "Enter the address").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, "Enter the city").max(120),
  state: z.string().trim().min(2, "Enter the state").max(120),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter a six-digit PIN code"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{8,20}$/, "Enter a contact number"),
  method: z.enum(["razorpay", "cod"]),
});

export type CheckoutState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Handed to Razorpay Checkout in the browser. */
  payment?: {
    orderId: string;
    razorpayOrderId: string;
    keyId: string;
    amountMinor: number;
    currency: string;
  };
  /** Set when nothing more is owed — COD, or an already-paid order. */
  orderNumber?: string;
};

async function sellerFromHost(): Promise<string | null> {
  const host = normalizeHost((await headers()).get("host"));
  if (!host || isRootHost(host)) return null;

  const slug = getSubdomain(host);
  if (!slug) return null;

  const seller = await db.seller.findFirst({
    where: { slug, status: "VERIFIED", deletedAt: null },
    select: { id: true },
  });
  return seller?.id ?? null;
}

export async function startCheckoutAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const sellerId = await sellerFromHost();
  if (!sellerId) return { error: "Checkout is only available on a seller's store." };

  if (!(await canAcceptPayments(sellerId))) {
    return { error: "This store isn't taking online orders yet." };
  }

  const buyer = await getBuyerSession();
  if (!buyer) return { error: "Please sign in to check out." };
  if (buyer.isBlocked) return { error: "This account can't place orders." };

  const parsed = addressSchema.safeParse({
    name: formData.get("name"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    phone: formData.get("phone"),
    method: formData.get("method"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { method, ...address } = parsed.data;

  // The form only offers what the store accepts; the server enforces it.
  const methods = await getCheckoutMethods(sellerId);
  if ((method === "cod" && !methods.cod) || (method === "razorpay" && !methods.online)) {
    return { error: "That payment option isn't available at this store." };
  }

  const result = await beginCheckout({
    sellerId,
    buyerId: buyer.id,
    address,
    buyerName: address.name,
    buyerEmail: null,
    method,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "empty_cart":
        return { error: "Your cart is empty." };
      case "payments_unavailable":
        return { error: "This store isn't taking online orders yet." };
      default:
        return { error: result.error ?? "We couldn't start the payment. Please try again." };
    }
  }

  if (!result.razorpay) {
    return { ok: true, orderNumber: result.orderNumber };
  }

  return {
    ok: true,
    payment: {
      orderId: result.orderId,
      razorpayOrderId: result.razorpay.orderId,
      keyId: result.razorpay.keyId,
      amountMinor: result.totalMinor,
      currency: result.currency,
    },
  };
}

/**
 * Called after Razorpay Checkout closes. The signature is what makes this
 * trustworthy — the browser saying "paid" is not evidence of payment.
 */
export async function confirmPaymentAction(input: {
  orderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<CheckoutState> {
  const buyer = await getBuyerSession();
  if (!buyer) return { error: "Please sign in again." };

  const result = await confirmPayment({
    orderId: input.orderId,
    buyerId: buyer.id,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
  });

  if (!result.ok) {
    return result.reason === "bad_signature"
      ? { error: "We couldn't verify that payment. If you were charged, contact the seller." }
      : { error: "We couldn't find that order." };
  }

  return { ok: true, orderNumber: result.orderNumber };
}
