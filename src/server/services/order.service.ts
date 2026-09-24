import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { clearCart, repriceCart } from "@/server/services/cart.service";
import { getRazorpayConfig } from "@/server/services/integration.service";
import { createRazorpayOrder, verifyPaymentSignature } from "@/lib/payments/razorpay";
import { autoCreateShipment } from "@/server/services/shipping.service";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Checkout and orders (Phase 5).
 *
 * A paid checkout produces an `Order` for exactly one seller — never a lead.
 * The other matched sellers get an anonymous `DemandAlert` instead, which is
 * the whole point of the split: the buyer chose this seller, so nobody else
 * gets their details, but the category still learns that demand exists.
 */

export type ShippingAddress = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
};

/**
 * "BZ-" plus 8 chars of base32. Collision-resistant enough that the unique
 * index is a backstop rather than a retry loop, and short enough to read over
 * a phone call.
 */
function generateOrderNumber(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(8);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `BZ-${out}`;
}

export type BeginCheckoutResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      totalMinor: number;
      currency: string;
      /** Absent for COD. */
      razorpay: { orderId: string; keyId: string } | null;
    }
  | { ok: false; reason: "empty_cart" | "payments_unavailable" | "gateway_error"; error?: string };

export async function beginCheckout(params: {
  sellerId: string;
  buyerId: string;
  address: ShippingAddress;
  buyerName: string;
  buyerEmail: string | null;
  method: "razorpay" | "cod";
}): Promise<BeginCheckoutResult> {
  // Reprice first: the buyer is charged today's price, not a stale snapshot.
  const cart = await repriceCart(params.sellerId, params.buyerId);
  if (!cart || cart.lines.length === 0) return { ok: false, reason: "empty_cart" };

  const subtotalMinor = cart.subtotalMinor;
  const totalMinor = subtotalMinor;
  const orderNumber = generateOrderNumber();

  const order = await db.order.create({
    data: {
      orderNumber,
      sellerId: params.sellerId,
      buyerId: params.buyerId,
      subtotalMinor,
      totalMinor,
      currency: cart.currency,
      status: "PENDING",
      paymentStatus: "PENDING",
      paymentMethod: params.method,
      shippingAddress: params.address as unknown as Prisma.InputJsonValue,
      buyerName: params.buyerName,
      buyerEmail: params.buyerEmail,
      buyerPhone: params.address.phone,
      items: {
        create: cart.lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          totalMinor: line.lineTotalMinor,
          currency: cart.currency,
        })),
      },
    },
    select: { id: true, orderNumber: true },
  });

  if (params.method === "cod") {
    // Nothing to charge now. The seller confirms and collects on delivery.
    await db.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
    await finaliseOrder(order.id);
    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalMinor,
      currency: cart.currency,
      razorpay: null,
    };
  }

  const integration = await getRazorpayConfig(params.sellerId);
  if (!integration) return { ok: false, reason: "payments_unavailable" };

  const created = await createRazorpayOrder(integration.config, {
    amountMinor: totalMinor,
    currency: cart.currency,
    receipt: order.orderNumber,
    notes: { bzaroOrderId: order.id },
  });

  if (!created.ok) {
    await db.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", paymentStatus: "FAILED" },
    });
    return { ok: false, reason: "gateway_error", error: created.error };
  }

  await db.order.update({
    where: { id: order.id },
    data: { razorpayOrderId: created.order.id },
  });

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalMinor,
    currency: cart.currency,
    // The key ID is public by design — it identifies the seller's account to
    // Razorpay Checkout in the browser. The secret never leaves the server.
    razorpay: { orderId: created.order.id, keyId: integration.config.keyId },
  };
}

export type ConfirmPaymentResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; reason: "not_found" | "bad_signature" | "payments_unavailable" };

/**
 * The browser callback after Razorpay Checkout closes.
 *
 * The signature is what makes this trustworthy; the webhook is what makes it
 * reliable. Both run, both are idempotent, and whichever arrives first wins.
 */
export async function confirmPayment(params: {
  orderId: string;
  buyerId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<ConfirmPaymentResult> {
  const order = await db.order.findFirst({
    where: { id: params.orderId, buyerId: params.buyerId },
    select: {
      id: true,
      orderNumber: true,
      sellerId: true,
      razorpayOrderId: true,
      paymentStatus: true,
    },
  });
  if (!order?.razorpayOrderId) return { ok: false, reason: "not_found" };

  if (order.paymentStatus === "PAID") {
    return { ok: true, orderId: order.id, orderNumber: order.orderNumber };
  }

  const integration = await getRazorpayConfig(order.sellerId);
  if (!integration) return { ok: false, reason: "payments_unavailable" };

  const valid = verifyPaymentSignature(integration.config, {
    orderId: order.razorpayOrderId,
    paymentId: params.razorpayPaymentId,
    signature: params.razorpaySignature,
  });
  if (!valid) return { ok: false, reason: "bad_signature" };

  await markPaid(order.id, params.razorpayPaymentId);
  return { ok: true, orderId: order.id, orderNumber: order.orderNumber };
}

/**
 * Idempotent transition to PAID. Safe to call from both the browser callback
 * and the webhook — the guarded `updateMany` means only the first one does
 * anything, so a duplicate can never fan out two sets of demand alerts.
 */
export async function markPaid(orderId: string, razorpayPaymentId: string): Promise<boolean> {
  const updated = await db.order.updateMany({
    where: { id: orderId, paymentStatus: { not: "PAID" } },
    data: {
      paymentStatus: "PAID",
      status: "CONFIRMED",
      razorpayPaymentId,
      paidAt: new Date(),
    },
  });

  if (updated.count !== 1) return false;

  await finaliseOrder(orderId);
  return true;
}

/**
 * Everything that happens once an order is real: empty the cart, and tell the
 * rest of the category that demand exists — without telling them who.
 */
async function finaliseOrder(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      buyerId: true,
      items: { select: { name: true, quantity: true, productId: true } },
    },
  });
  if (!order) return;

  const cart = await db.cart.findUnique({
    where: { sellerId_buyerId: { sellerId: order.sellerId, buyerId: order.buyerId } },
    select: { id: true },
  });
  if (cart) await clearCart(cart.id);

  await createDemandAlerts(order.id);

  // Only when the seller opted in, and never fatal — see autoCreateShipment.
  await autoCreateShipment(order.sellerId, order.id);
}

/** Quantity bands. Never an exact number — see docs/LEADS.md §7. */
export function quantityBand(quantity: number): string {
  if (quantity <= 10) return "1-10";
  if (quantity <= 50) return "11-50";
  if (quantity <= 200) return "51-200";
  if (quantity <= 1000) return "201-1000";
  return "1000+";
}

/**
 * Anonymous demand alerts to other sellers in the same category and city.
 *
 * Carries no buyer column of any kind, and the quantity is banded: an exact
 * quantity plus a timestamp would identify the order it came from.
 */
export async function createDemandAlerts(orderId: string): Promise<number> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      seller: { select: { locationId: true } },
      items: {
        select: {
          name: true,
          quantity: true,
          product: { select: { categoryId: true } },
        },
      },
    },
  });
  if (!order) return 0;

  const locationId = order.seller.locationId;
  if (!locationId) return 0;

  let created = 0;

  for (const item of order.items) {
    const categoryId = item.product?.categoryId;
    if (!categoryId) continue;

    const recipients = await db.seller.findMany({
      where: {
        id: { not: order.sellerId },
        status: "VERIFIED",
        deletedAt: null,
        categories: { some: { categoryId } },
        OR: [{ locationId }, { serviceAreas: { some: { locationId } } }],
      },
      select: { id: true },
      take: 20,
    });
    if (recipients.length === 0) continue;

    await db.demandAlert.createMany({
      data: recipients.map((recipient) => ({
        sellerId: recipient.id,
        categoryId,
        locationId,
        productName: item.name,
        quantityBand: quantityBand(item.quantity),
      })),
    });
    created += recipients.length;
  }

  return created;
}
