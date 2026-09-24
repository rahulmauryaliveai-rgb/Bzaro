import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/guards";
import { forSeller } from "@/lib/db-tenant";
import { formatMoney } from "@/lib/utils/money";
import { getSellerFeatures } from "@/server/services/integration.service";
import { ShipNowButton } from "@/components/dashboard/IntegrationForms";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

const PAYMENT_LABEL: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Payment pending", className: "bg-amber-100 text-amber-900" },
  PAID: { label: "Paid", className: "bg-green-100 text-green-900" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-900" },
  REFUNDED: { label: "Refunded", className: "bg-neutral-200 text-neutral-800" },
};

const SHIPPING_LABEL: Record<string, string> = {
  NOT_SHIPPED: "Not shipped",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

/**
 * Orders from this seller's own storefront (Phase 7).
 *
 * Only ever this seller's — a checkout produces an order for exactly one
 * seller, which is what separates it from a lead.
 */
export default async function OrdersPage() {
  const scope = await requireSeller();
  const db = forSeller(scope.sellerId);

  const features = await getSellerFeatures(scope.sellerId);

  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      totalMinor: true,
      currency: true,
      paymentStatus: true,
      paymentMethod: true,
      shippingStatus: true,
      trackingUrl: true,
      awb: true,
      buyerName: true,
      buyerPhone: true,
      shiprocketOrderId: true,
      createdAt: true,
      items: { select: { id: true, name: true, quantity: true } },
    },
  });

  const paidTotal = orders
    .filter((order) => order.paymentStatus === "PAID")
    .reduce((sum, order) => sum + order.totalMinor, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Checkouts on your storefront. {orders.length} order{orders.length === 1 ? "" : "s"} ·{" "}
          {formatMoney(paidTotal, "INR")} paid.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">No orders yet.</p>
          <p className="mt-1 text-xs text-neutral-500">
            Orders appear here once payments are switched on and a buyer checks out.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const payment = PAYMENT_LABEL[order.paymentStatus] ?? PAYMENT_LABEL["PENDING"]!;
            return (
              <li
                key={order.id}
                className="rounded-lg border border-neutral-200 bg-white p-4 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{order.orderNumber}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${payment.className}`}>
                    {payment.label}
                  </span>
                </div>

                <p className="mt-2 text-neutral-700">
                  {order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}
                </p>

                <p className="mt-1 text-neutral-600">
                  {formatMoney(order.totalMinor, order.currency)}
                  {order.paymentMethod ? ` · ${order.paymentMethod.toUpperCase()}` : ""} ·{" "}
                  {SHIPPING_LABEL[order.shippingStatus] ?? order.shippingStatus}
                </p>

                <p className="mt-1 text-neutral-500">
                  {order.buyerName}
                  {order.buyerPhone ? ` · ${order.buyerPhone}` : ""} ·{" "}
                  <time dateTime={order.createdAt.toISOString()}>
                    {order.createdAt.toLocaleString("en-IN")}
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
                ) : features.shippingEnabled &&
                  !order.shiprocketOrderId &&
                  (order.paymentStatus === "PAID" || order.paymentMethod === "cod") ? (
                  <ShipNowButton orderId={order.id} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
