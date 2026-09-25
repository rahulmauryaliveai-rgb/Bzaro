import type { Metadata } from "next";
import { requireBuyerPage } from "@/lib/buyer/guard";
import { AccountShell } from "@/components/account/AccountShell";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "My orders",
  robots: { index: false, follow: false },
};

const STATUS_COPY: Record<string, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};

const SHIPPING_COPY: Record<string, string> = {
  NOT_SHIPPED: "Not shipped yet",
  PROCESSING: "Being packed",
  SHIPPED: "On its way",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

export default async function MyOrdersPage() {
  const user = await requireBuyerPage("/account/orders");

  const orders = await db.order.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      orderNumber: true,
      totalMinor: true,
      currency: true,
      paymentStatus: true,
      shippingStatus: true,
      trackingUrl: true,
      awb: true,
      createdAt: true,
      seller: { select: { businessName: true } },
      items: { select: { id: true, name: true, quantity: true } },
    },
  });

  return (
    <AccountShell userId={user.id} active="orders">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">My orders</h1>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">No orders yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-lg border border-neutral-200 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{order.seller.businessName}</span>
                <span className="font-mono text-xs text-neutral-500">{order.orderNumber}</span>
              </div>
              <p className="mt-2 text-neutral-700">
                {order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}
              </p>
              <p className="mt-1 text-neutral-600">
                {formatMoney(order.totalMinor, order.currency)} ·{" "}
                {STATUS_COPY[order.paymentStatus] ?? order.paymentStatus} ·{" "}
                {SHIPPING_COPY[order.shippingStatus] ?? order.shippingStatus}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                <time dateTime={order.createdAt.toISOString()}>
                  {order.createdAt.toLocaleDateString("en-IN")}
                </time>
              </p>
              {order.trackingUrl ? (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-neutral-900 underline"
                >
                  Track {order.awb ?? "shipment"} ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
