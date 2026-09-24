import "server-only";
import { db } from "@/lib/db";

/**
 * The seller's month at a glance (Phase 7).
 *
 * Four numbers, chosen because together they answer "is Bzaro worth what I pay
 * for it": how many leads arrived, how many came from the marketplace rather
 * than the seller's own store, how many they won, and what that was worth.
 *
 * Deliberately calendar-month rather than rolling-30-day: it has to line up
 * with the billing period the seller is comparing it against.
 */

export type MonthlySummary = {
  monthLabel: string;
  leads: number;
  fromBzaro: number;
  orders: number;
  wonValueMinor: number;
  currency: string;
};

export async function getMonthlySummary(sellerId: string): Promise<MonthlySummary> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  const [leads, fromBzaro, orders, paidOrders] = await Promise.all([
    db.lead.count({ where: { sellerId, createdAt: { gte: start } } }),
    db.lead.count({
      where: {
        sellerId,
        createdAt: { gte: start },
        // Either raised on the marketplace, or on the storefront by someone
        // the marketplace sent (first-touch `?ref=bzaro`).
        requirement: { OR: [{ source: "BZARO_MARKETPLACE" }, { refBzaro: true }] },
      },
    }),
    db.order.count({ where: { sellerId, createdAt: { gte: start } } }),
    db.order.findMany({
      where: { sellerId, paymentStatus: "PAID", paidAt: { gte: start } },
      select: { totalMinor: true, currency: true },
    }),
  ]);

  return {
    monthLabel: start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    leads,
    fromBzaro,
    orders,
    wonValueMinor: paidOrders.reduce((sum, order) => sum + order.totalMinor, 0),
    currency: paidOrders[0]?.currency ?? "INR",
  };
}
