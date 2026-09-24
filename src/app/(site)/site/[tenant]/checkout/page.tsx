import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getBuyerSession } from "@/server/services/buyer.service";
import { getCart } from "@/server/services/cart.service";
import { canAcceptPayments, getRazorpayConfig } from "@/server/services/integration.service";
import { formatMoney } from "@/lib/utils/money";
import { CheckoutForm } from "@/components/site/CheckoutForm";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ tenant: string }> };

export default async function CheckoutPage({ params }: Props) {
  const { tenant } = await params;

  const seller = await db.seller.findFirst({
    where: { slug: tenant, status: "VERIFIED", deletedAt: null },
    select: { id: true, businessName: true },
  });
  if (!seller) notFound();
  if (!(await canAcceptPayments(seller.id))) notFound();

  const buyer = await getBuyerSession();
  if (!buyer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="mt-3 text-sm text-neutral-600">Sign in to complete your order.</p>
        <Link
          href="/login"
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const [cart, razorpay] = await Promise.all([
    getCart(seller.id, buyer.id),
    getRazorpayConfig(seller.id),
  ]);
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="mt-3 text-sm text-neutral-600">Your cart is empty.</p>
        <Link href="/products" className="mt-5 inline-block text-sm underline">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-neutral-600">{seller.businessName}</p>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <h2 className="text-sm font-semibold">Order summary</h2>
        <ul className="mt-2 space-y-1 text-sm text-neutral-700">
          {cart.lines.map((line) => (
            <li key={line.itemId} className="flex justify-between gap-4">
              <span>
                {line.name} × {line.quantity}
              </span>
              <span className="tabular-nums">
                {formatMoney(line.lineTotalMinor, cart.currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 text-sm font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(cart.subtotalMinor, cart.currency)}</span>
        </div>
      </section>

      <div className="mt-6">
        <CheckoutForm
          sellerName={seller.businessName}
          buyerName={buyer.name}
          buyerPhone={buyer.phone}
          codEnabled={razorpay?.config.codEnabled ?? false}
        />
      </div>
    </div>
  );
}
