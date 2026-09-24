import "server-only";
import { db } from "@/lib/db";
import { getShiprocketToken, recordTestResult } from "@/server/services/integration.service";
import {
  assignShiprocketAwb,
  createShiprocketOrder,
  trackingUrlFor,
} from "@/lib/shipping/shiprocket";
import { minorToMajorString } from "@/lib/utils/money";
import { z } from "zod";

/**
 * Turning a paid order into a shipment (Phase 6).
 *
 * Two entry points, one path: the seller presses "Ship now", or the order was
 * paid on a store with auto-create switched on. Both land here.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * `shiprocketOrderId` is the guard. Creating a second shipment for an order
 * costs the seller a real pickup, so the guarded `updateMany` that claims the
 * order is what stops a double-click or a retried webhook doing it twice.
 *
 * ── Failure is not fatal ─────────────────────────────────────────────────────
 * A courier that cannot service a pincode is a normal Tuesday. The order stays
 * paid and simply remains unshipped, with the reason recorded, so the seller
 * can book it by hand. Nothing here ever rolls back a payment.
 */

/** Shipping addresses are stored as JSON; validate before trusting the shape. */
const addressSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  phone: z.string(),
});

const DEFAULTS = { weightKg: 0.5, lengthCm: 10, breadthCm: 10, heightCm: 10 };

export type ShipResult =
  | { ok: true; awb: string; trackingUrl: string }
  | {
      ok: false;
      reason: "not_found" | "not_paid" | "already_shipped" | "not_configured";
      error?: string;
    }
  | { ok: false; reason: "gateway_error"; error: string };

export async function createShipmentForOrder(
  sellerId: string,
  orderId: string,
): Promise<ShipResult> {
  const order = await db.order.findFirst({
    where: { id: orderId, sellerId },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      paymentMethod: true,
      shiprocketOrderId: true,
      subtotalMinor: true,
      currency: true,
      shippingAddress: true,
      buyerEmail: true,
      placedAt: true,
      items: { select: { name: true, quantity: true, unitPriceMinor: true, productId: true } },
    },
  });

  if (!order) return { ok: false, reason: "not_found" };
  if (order.shiprocketOrderId) return { ok: false, reason: "already_shipped" };

  // COD orders are shippable before money arrives; prepaid ones are not.
  if (order.paymentStatus !== "PAID" && order.paymentMethod !== "cod") {
    return { ok: false, reason: "not_paid" };
  }

  const address = addressSchema.safeParse(order.shippingAddress);
  if (!address.success) {
    return { ok: false, reason: "gateway_error", error: "The saved address is incomplete." };
  }

  const auth = await getShiprocketToken(sellerId);
  if (!auth) return { ok: false, reason: "not_configured" };

  const { token, config } = auth;

  // Claim the order before calling out, so two concurrent "Ship now" presses
  // cannot both reach Shiprocket.
  const claimed = await db.order.updateMany({
    where: { id: order.id, shiprocketOrderId: null },
    data: { shippingStatus: "PROCESSING" },
  });
  if (claimed.count !== 1) return { ok: false, reason: "already_shipped" };

  const created = await createShiprocketOrder(token, {
    orderNumber: order.orderNumber,
    orderDate: order.placedAt.toISOString().slice(0, 10),
    pickupLocation: config.pickupLocation,
    billing: {
      name: address.data.name,
      address: address.data.line1,
      address2: address.data.line2,
      city: address.data.city,
      state: address.data.state,
      pincode: address.data.pincode,
      phone: address.data.phone,
      email: order.buyerEmail ?? undefined,
    },
    items: order.items.map((item, index) => ({
      name: item.name,
      sku: item.productId ?? `ITEM-${index + 1}`,
      units: item.quantity,
      sellingPrice: Number(minorToMajorString(item.unitPriceMinor, order.currency)),
    })),
    subTotal: Number(minorToMajorString(order.subtotalMinor, order.currency)),
    dimensions: {
      weightKg: config.defaultWeightKg ?? DEFAULTS.weightKg,
      lengthCm: config.defaultLengthCm ?? DEFAULTS.lengthCm,
      breadthCm: config.defaultBreadthCm ?? DEFAULTS.breadthCm,
      heightCm: config.defaultHeightCm ?? DEFAULTS.heightCm,
    },
    paymentMethod: order.paymentMethod === "cod" ? "COD" : "Prepaid",
  });

  if (!created.ok) {
    await releaseClaim(order.id);
    await recordTestResult(sellerId, "SHIPROCKET", { ok: false, error: created.error });
    return { ok: false, reason: "gateway_error", error: created.error };
  }

  const shipmentId = created.data.shipment_id;
  await db.order.update({
    where: { id: order.id },
    data: { shiprocketOrderId: String(created.data.order_id ?? shipmentId ?? order.orderNumber) },
  });

  if (!shipmentId) {
    // The order exists in Shiprocket but has no shipment to label yet. Leave it
    // for the seller rather than pretending it shipped.
    return {
      ok: false,
      reason: "gateway_error",
      error: "Shiprocket created the order but returned no shipment to label.",
    };
  }

  const awb = await assignShiprocketAwb(token, shipmentId);
  if (!awb.ok) {
    await recordTestResult(sellerId, "SHIPROCKET", { ok: false, error: awb.error });
    return { ok: false, reason: "gateway_error", error: awb.error };
  }

  const awbCode = awb.data.awb_code!;
  const trackingUrl = trackingUrlFor(awbCode);

  await db.order.update({
    where: { id: order.id },
    data: { awb: awbCode, trackingUrl, shippingStatus: "SHIPPED" },
  });

  await recordTestResult(sellerId, "SHIPROCKET", { ok: true });

  return { ok: true, awb: awbCode, trackingUrl };
}

/** Put a failed claim back so the seller can retry. */
async function releaseClaim(orderId: string): Promise<void> {
  await db.order.updateMany({
    where: { id: orderId, shiprocketOrderId: null },
    data: { shippingStatus: "NOT_SHIPPED" },
  });
}

/**
 * Called when an order becomes paid. Does nothing unless the seller asked for
 * shipments to be created automatically — and never throws, because a courier
 * problem must not fail the payment that just succeeded.
 */
export async function autoCreateShipment(sellerId: string, orderId: string): Promise<void> {
  try {
    const auth = await getShiprocketToken(sellerId);
    if (!auth?.config.autoCreate) return;

    await createShipmentForOrder(sellerId, orderId);
  } catch (error) {
    console.error("[shipping] auto-create failed:", error);
  }
}
